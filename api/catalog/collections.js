/**
 * GET /api/catalog/collections — homepage marketing rails (Supabase).
 */

const { fetchHomepageCollectionsForSite } = require('../../lib/homepageCollections');
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

  const lang = ['hant', 'hans', 'en'].includes(req.query.lang) ? req.query.lang : 'hant';

  try {
    const result = await fetchHomepageCollectionsForSite({ lang });
    const collections = [];
    const allActivities = [];

    result.collections.forEach((col) => {
      const slim = col.activities.map(slimActivityForList);
      allActivities.push(...slim);
      collections.push({
        slug: col.slug,
        sortOrder: col.sortOrder,
        title: col.title,
        overline: col.overline,
        ctaLabel: col.ctaLabel,
        ctaChipId: col.ctaChipId,
        ctaRouteId: col.ctaRouteId,
        activities: slim,
      });
    });

    const translations = await loadTranslationsForActivities(allActivities);

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return res.status(200).json({
      source: 'db',
      collections,
      translations,
      meta: result.meta,
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'COLLECTIONS_ERROR',
    });
  }
};
