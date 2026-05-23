const { getActivityById, getQuoteCurrency, applyQuoteCurrency } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function unwrapActivity(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.id != null || payload.activityId != null) return payload;
  if (payload.activity) return payload.activity;
  return payload;
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Missing activity id', code: 'MISSING_ID' });
  }

  const uiLang = req.query.lang || 'hant';

  try {
    const rawPayload = await getActivityById(id, { uiLang });
    const raw = unwrapActivity(rawPayload);
    const quoteCurrency = getQuoteCurrency();
    const [activity] = applyQuoteCurrency([normalizeActivity(raw)], quoteCurrency);
    const translations = await loadTranslationsForActivities([activity]);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      source: 'bokun',
      activity,
      translations,
      meta: { quoteCurrency },
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    const hints = [];
    if (status === 401) {
      hints.push('Check Vercel env: BOKUN_ACCESS_KEY + BOKUN_SECRET_KEY (production keys → https://api.bokun.io).');
    }
    return res.status(status).json({
      error: err.message,
      code: err.code || 'BOKUN_ERROR',
      hints,
    });
  }
};
