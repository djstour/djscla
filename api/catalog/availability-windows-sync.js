const { syncAvailabilityWindowBatch } = require('../../lib/availabilityWindowSync');

function checkCronAuth(req) {
  const secret = (
    process.env.CRON_SECRET
    || process.env.CATALOG_SYNC_SECRET
    || process.env.TRANSLATION_SYNC_SECRET
    || ''
  ).trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

/**
 * Cron — refresh stale activities.availability_window batches (Phase 2).
 * GET/POST ?limit=25
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!checkCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = parseInt(req.query.limit || '25', 10);
  try {
    const summary = await syncAvailabilityWindowBatch({ limit, uiLang: 'en' });
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message, code: err.code || 'AVAIL_WINDOW_SYNC_ERROR' });
  }
};
