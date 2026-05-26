const crypto = require('crypto');
const sharp = require('sharp');
const { getSupabaseConfig, restHeaders } = require('./supabase');
const { isAllowedImageUrl } = require('./imageThumb');

const DEFAULT_BUCKET = 'activity-images';
const DEFAULT_CACHE = 'public, max-age=31536000, immutable';
const MAX_SYNC_BYTES = 40 * 1024 * 1024;

const VARIANTS = {
  card: { width: 640, quality: 78 },
  hero: { width: 1440, quality: 82 },
  gallery: { width: 160, quality: 74 },
};

function imageBucket() {
  return (process.env.SUPABASE_IMAGE_BUCKET || DEFAULT_BUCKET).trim();
}

function publicObjectUrl(path) {
  const { url } = getSupabaseConfig();
  const bucket = imageBucket();
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

function objectUploadUrl(path) {
  const { url } = getSupabaseConfig();
  const bucket = imageBucket();
  return `${url}/storage/v1/object/${bucket}/${path}`;
}

async function uploadPublicObject(path, buffer, contentType = 'image/webp') {
  const { url, serviceKey, canWrite } = getSupabaseConfig();
  if (!url || !serviceKey || !canWrite) {
    const err = new Error('Supabase storage write credentials missing');
    err.code = 'SUPABASE_CONFIG';
    throw err;
  }

  const res = await fetch(objectUploadUrl(path), {
    method: 'POST',
    headers: {
      ...restHeaders(serviceKey, {
        'Content-Type': contentType,
        'x-upsert': 'true',
        'cache-control': DEFAULT_CACHE,
      }),
    },
    body: buffer,
  });

  const text = await res.text();
  if (!res.ok && res.status !== 200) {
    const err = new Error(`Supabase storage ${res.status}: ${text.slice(0, 300)}`);
    err.code = 'SUPABASE_STORAGE_ERROR';
    err.status = res.status;
    throw err;
  }

  return publicObjectUrl(path);
}

async function fetchOriginalForSync(url, { timeoutMs = 30000 } = {}) {
  if (!isAllowedImageUrl(url)) {
    const err = new Error('Invalid or disallowed image url');
    err.code = 'INVALID_IMAGE_URL';
    throw err;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'djscla-owned-image-sync/1.0' },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_SYNC_BYTES) throw new Error('upstream too large for sync');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SYNC_BYTES) throw new Error('upstream too large for sync');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function renderVariant(buffer, { width, quality }) {
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

function hashSource(url) {
  return crypto.createHash('md5').update(String(url || '')).digest('hex').slice(0, 10);
}

function normalizePhotoSources(activity, { coverOnly = false } = {}) {
  const seen = new Set();
  const sources = [];
  const add = (url, index, isCover = false) => {
    if (!url || typeof url !== 'string' || seen.has(url)) return;
    seen.add(url);
    sources.push({ url, index, isCover });
  };

  add(activity.coverImageUrl, 0, true);
  if (!coverOnly) {
    (activity.photoUrls || []).forEach((url, index) => add(url, index, index === 0));
  }
  return sources;
}

async function ingestActivityOwnedImages(activity, opts = {}) {
  const { coverOnly = false } = opts;
  const sources = normalizePhotoSources(activity, { coverOnly });
  if (!sources.length) {
    return {
      coverImageOwnedUrl: null,
      coverImageCardUrl: null,
      coverImageHeroUrl: null,
      coverImageGalleryUrl: null,
      photoUrlsOwned: [],
      imageAssets: [],
    };
  }

  const activityId = String(activity.id);
  const imageAssets = [];

  for (const source of sources) {
    const upstream = await fetchOriginalForSync(source.url);
    const key = hashSource(source.url);
    const base = `activities/${activityId}/${source.index}-${key}`;
    const [cardBuf, heroBuf, galleryBuf] = await Promise.all([
      renderVariant(upstream, VARIANTS.card),
      renderVariant(upstream, VARIANTS.hero),
      renderVariant(upstream, VARIANTS.gallery),
    ]);
    const [cardUrl, heroUrl, galleryUrl] = await Promise.all([
      uploadPublicObject(`${base}/card.webp`, cardBuf),
      uploadPublicObject(`${base}/hero.webp`, heroBuf),
      uploadPublicObject(`${base}/gallery.webp`, galleryBuf),
    ]);

    imageAssets.push({
      sourceUrl: source.url,
      cardUrl,
      heroUrl,
      galleryUrl,
      isCover: source.isCover,
    });
  }

  const cover = imageAssets[0] || null;
  return {
    coverImageOwnedUrl: cover ? cover.heroUrl : null,
    coverImageCardUrl: cover ? cover.cardUrl : null,
    coverImageHeroUrl: cover ? cover.heroUrl : null,
    coverImageGalleryUrl: cover ? cover.galleryUrl : null,
    photoUrlsOwned: imageAssets.map((asset) => asset.heroUrl).filter(Boolean),
    imageAssets,
  };
}

module.exports = {
  DEFAULT_BUCKET,
  ingestActivityOwnedImages,
  imageBucket,
};
