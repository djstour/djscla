const {
  fetchCatalogPage,
  fetchAllCatalogPages,
  fetchChannelContractCatalog,
  DEFAULT_ALL_CAP,
} = require('../../lib/catalog');
const {
  fetchCatalogPageFromDb,
  fetchAllCatalogFromDb,
} = require('../../lib/catalogDb');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');
const { slimActivityForList } = require('../../lib/slimActivity');
const { isDisplayableTranslation } = require('../../lib/translationVerification');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Decide which catalog backend to read from.
 * - ?source=db|bokun query param (debugging / forced live Bókun)
 * - CATALOG_SOURCE env (default db after catalog sync)
 */
function resolveSource(req) {
  const requested = (req.query.source || process.env.CATALOG_SOURCE || 'db')
    .toString()
    .toLowerCase();
  return requested === 'bokun' ? 'bokun' : 'db';
}

async function readFromDb(opts) {
  const { fetchAll, vendorId, page, pageSize, maxItems, chips, routes, facets, q } = opts;
  if (fetchAll) {
    return fetchAllCatalogFromDb({
      maxItems,
      vendorId: vendorId && vendorId !== 'all' ? vendorId : undefined,
      chips,
      routes,
      facets,
      q,
    });
  }
  return fetchCatalogPageFromDb({ page, pageSize, vendorId, chips, routes, facets, q });
}

async function readFromBokun({ fetchAll, vendorId, page, pageSize, uiLang, maxItems }) {
  if (fetchAll) {
    if (vendorId && vendorId !== 'all') {
      return fetchAllCatalogPages({ uiLang, pageSize: Math.min(pageSize, 100), maxItems, vendorId });
    }
    return fetchChannelContractCatalog({ uiLang, pageSize: Math.min(pageSize, 100), maxItems });
  }
  return fetchCatalogPage({ uiLang, page, pageSize, vendorId });
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
  const source = resolveSource(req);

  const chips = req.query.chips || req.query.chip;
  const routes = req.query.routes || req.query.route;
  const facets = req.query.facets || req.query.facet;
  const q = req.query.q;
  const hasServerFilters = !!(chips || routes || facets || q);

  const opts = { fetchAll, vendorId, page, pageSize, uiLang, maxItems, chips, routes, facets, q };

  try {
    let result;
    let usedSource = source;

    if (source === 'db') {
      try {
        result = await readFromDb(opts);
      } catch (dbErr) {
        console.warn('[Auralis] catalog DB read failed, falling back to Bókun:', dbErr.message);
        result = await readFromBokun(opts);
        usedSource = 'bokun';
      }
    } else {
      if (hasServerFilters) {
        return res.status(400).json({
          error: 'Server-side chip/route/facet/q filters require source=db',
          code: 'CATALOG_FILTER_REQUIRES_DB',
          hint: 'Add source=db query or set CATALOG_SOURCE=db on Vercel.',
        });
      }
      result = await readFromBokun(opts);
    }

    let list = full ? result.activities : result.activities.map(slimActivityForList);
    const translations = await loadTranslationsForActivities(list);

    if (uiLang === 'hant' || uiLang === 'hans') {
      list = list.filter((activity) => isDisplayableTranslation(
        activity,
        uiLang,
        translations[String(activity.id)] || null,
      ));
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

    return res.status(200).json({
      source: usedSource,
      activities: list,
      translations,
      meta: { ...result.meta, source: usedSource },
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
