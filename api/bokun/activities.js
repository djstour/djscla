const { searchActivities, getQuoteCurrency, applyQuoteCurrency } = require('../lib/bokun');
const { normalizeSearchResponse } = require('../lib/normalizeActivity');
const { loadTranslationsForActivities } = require('../lib/attachTranslations');

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

  try {
    const raw = await searchActivities({ uiLang, page, pageSize });
    const { activities: normalized, meta } = normalizeSearchResponse(raw);
    const quoteCurrency = getQuoteCurrency();
    const activities = applyQuoteCurrency(normalized, quoteCurrency);
    const translations = await loadTranslationsForActivities(activities);

    return res.status(200).json({
      source: 'bokun',
      activities,
      translations,
      meta: { ...meta, quoteCurrency },
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    const hints = [];
    if (status === 401) {
      hints.push('Check Vercel env: BOKUN_ACCESS_KEY + BOKUN_SECRET_KEY (pair from Bókun → Settings → API keys).');
      hints.push('Sandbox keys need BOKUN_API_HOST=https://api.bokuntest.com — production keys use https://api.bokun.io');
      hints.push('Redeploy after changing environment variables.');
    }
    if (err.code === 'BOKUN_CONFIG') {
      hints.push('Set BOKUN_ACCESS_KEY and BOKUN_SECRET_KEY on the Vercel project, then redeploy.');
    }
    return res.status(status).json({
      error: err.message,
      code: err.code || 'BOKUN_ERROR',
      hints,
    });
  }
};
