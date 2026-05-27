/**
 * GET /api/catalog/featured — homepage featured activities from Supabase.
 *
 * Public read; returns slim list items in Bókun-shaped payload for the adapter.
 */

const { fetchFeaturedActivitiesFromDb } = require('../../lib/catalogDb');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');
const { slimActivityForList } = require('../../lib/slimActivity');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit || '6', 10) || 6, 1), 24);

  try {
    const result = await fetchFeaturedActivitiesFromDb({ limit });
    const list = result.activities.map(slimActivityForList);
    const translations = await loadTranslationsForActivities(list);

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return res.status(200).json({
      source: 'db',
      activities: list,
      translations,
      meta: result.meta,
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'FEATURED_ERROR',
    });
  }
};
