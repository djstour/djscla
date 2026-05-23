const { fetchCatalogPage, fetchAllCatalogPages, DEFAULT_ALL_CAP } = require('../../lib/catalog');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');
const { slimActivityForList } = require('../../lib/slimActivity');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uiLang = req.query.lang || 'hant';
  const page = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '50', 10);
  const vendorId = req.query.vendorId;
  const fetchAll = req.query.all === 'true' || req.query.all === '1';
  const maxItems = parseInt(req.query.maxItems || String(DEFAULT_ALL_CAP), 10);
  const full = req.query.full === 'true' || req.query.full === '1';

  try {
    const { activities, meta } = fetchAll
      ? await fetchAllCatalogPages({ uiLang, pageSize: Math.min(pageSize, 100), maxItems, vendorId })
      : await fetchCatalogPage({ uiLang, page, pageSize, vendorId });

    const list = full ? activities : activities.map(slimActivityForList);
    const translations = await loadTranslationsForActivities(list);

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return res.status(200).json({
      source: 'bokun',
      activities: list,
      translations,
      meta,
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    const hints = [];
    if (status === 401) {
      hints.push('Check Vercel env: BOKUN_ACCESS_KEY + BOKUN_SECRET_KEY.');
      hints.push('Sandbox: BOKUN_API_HOST=https://api.bokuntest.com — production: https://api.bokun.io');
    }
    if (err.code === 'BOKUN_CONFIG') {
      hints.push('Set BOKUN_ACCESS_KEY and BOKUN_SECRET_KEY on Vercel, then redeploy.');
    }
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CATALOG_ERROR',
      hints,
    });
  }
};
