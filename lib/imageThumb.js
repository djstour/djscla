/**
 * Fetch + resize Bókun S3 images for /api/media/thumb (WebP, width-capped).
 */

const ALLOWED_HOSTS = new Set(['bokun.s3.amazonaws.com']);
const MAX_BYTES = 8 * 1024 * 1024;

function isAllowedImageUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function fetchUpstream(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'djscla-image-thumb/1.0' },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('upstream too large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('upstream too large');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function resizeToWebp(buffer, { width, quality }) {
  const sharp = require('sharp');
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

function buildThumbPath(url, { w = 480, q = 80 } = {}) {
  if (!url || !isAllowedImageUrl(url)) return url || '';
  const params = new URLSearchParams({
    url,
    w: String(clampInt(w, 64, 1920, 480)),
    q: String(clampInt(q, 40, 90, 80)),
  });
  return `/api/media/thumb?${params.toString()}`;
}

module.exports = {
  ALLOWED_HOSTS,
  isAllowedImageUrl,
  clampInt,
  fetchUpstream,
  resizeToWebp,
  buildThumbPath,
};
