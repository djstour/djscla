const {
  isAllowedImageUrl,
  clampInt,
  fetchUpstream,
  resizeToWebp,
} = require('../../lib/imageThumb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const src = req.query.url;
  if (!src || !isAllowedImageUrl(src)) {
    return res.status(400).json({ error: 'Invalid or disallowed image url' });
  }

  const width = clampInt(req.query.w, 64, 1920, 480);
  const quality = clampInt(req.query.q, 40, 90, 80);

  try {
    const input = await fetchUpstream(src);
    const out = await resizeToWebp(input, { width, quality });
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(out);
  } catch (err) {
    console.error('[media/thumb]', err.message || err);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.redirect(307, src);
  }
};
