/**
 * Bókun REST client (server-only).
 * Auth: X-Bokun-Date + X-Bokun-AccessKey + X-Bokun-Signature (HMAC-SHA1).
 * @see https://bokun.dev/booking-api-rest/.../configuring-the-platform-for-api-usage-and-authentication
 */

const crypto = require('crypto');

function formatBokunDate(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function buildSignature({ date, accessKey, method, path, secretKey }) {
  const payload = `${date}${accessKey}${method.toUpperCase()}${path}`;
  return crypto.createHmac('sha1', secretKey).update(payload).digest('base64');
}

function getConfig() {
  const accessKey = (process.env.BOKUN_ACCESS_KEY || '').trim();
  const secretKey = (process.env.BOKUN_SECRET_KEY || process.env.BOKUN_SECRET || '').trim();
  const host = (process.env.BOKUN_API_HOST || 'https://api.bokun.io').replace(/\/$/, '');
  const lang = process.env.BOKUN_LANG || 'EN';
  const currency = process.env.BOKUN_CURRENCY || 'USD';

  if (!accessKey || !secretKey) {
    const err = new Error('BOKUN_ACCESS_KEY and BOKUN_SECRET_KEY must be set in the environment');
    err.code = 'BOKUN_CONFIG';
    throw err;
  }

  return { accessKey, secretKey, host, lang, currency };
}

/**
 * @param {{ method: string, path: string, body?: object }} opts — `path` must include query string for signing
 */
async function bokunRequest({ method, path, body }) {
  const { accessKey, secretKey, host } = getConfig();
  const date = formatBokunDate();
  const signature = buildSignature({ date, accessKey, method, path, secretKey });

  const headers = {
    'X-Bokun-Date': date,
    'X-Bokun-AccessKey': accessKey,
    'X-Bokun-Signature': signature,
  };

  if (method === 'POST' || method === 'PUT') {
    headers['Content-Type'] = 'application/json;charset=UTF-8';
  }

  const url = `${host}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`Bókun ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

function uiLangToBokunLang(uiLang) {
  return { hant: 'EN', hans: 'EN', en: 'EN' }[uiLang] || 'EN';
}

async function searchActivities({ uiLang, page = 1, pageSize = 50, query = {} } = {}) {
  const { lang: defaultLang, currency } = getConfig();
  const lang = uiLang ? uiLangToBokunLang(uiLang) : defaultLang;
  const path = `/activity.json/search?lang=${encodeURIComponent(lang)}&currency=${encodeURIComponent(currency)}`;

  const body = {
    page,
    pageSize: Math.min(Math.max(pageSize, 1), 100),
    ...query,
  };

  return bokunRequest({ method: 'POST', path, body });
}

async function getActivityById(id, { uiLang } = {}) {
  const { lang: defaultLang, currency } = getConfig();
  const lang = uiLang ? uiLangToBokunLang(uiLang) : defaultLang;
  const path = `/activity.json/${id}?lang=${encodeURIComponent(lang)}&currency=${encodeURIComponent(currency)}`;
  return bokunRequest({ method: 'GET', path });
}

async function getActivityAvailabilities(id, {
  start,
  end = start,
  uiLang,
  currency,
} = {}) {
  const { lang: defaultLang, currency: defaultCurrency } = getConfig();
  const lang = uiLang ? uiLangToBokunLang(uiLang) : defaultLang;
  const quoteCurrency = (currency || defaultCurrency || 'USD').toUpperCase();
  const params = new URLSearchParams({
    start,
    end,
    lang,
    currency: quoteCurrency,
  });
  const path = `/activity.json/${id}/availabilities?${params.toString()}`;
  return bokunRequest({ method: 'GET', path });
}

/** Bókun often leaves `currency: ISK` on items even when search used `currency=USD`. */
function getQuoteCurrency() {
  return (process.env.BOKUN_CURRENCY || 'USD').trim().toUpperCase();
}

function applyQuoteCurrency(activities, quoteCurrency = getQuoteCurrency()) {
  const code = (quoteCurrency || 'ISK').toUpperCase();
  return activities.map((a) => ({
    ...a,
    currency: code,
    defaultCurrency: code,
    pricing: (a.pricing || []).map((row) => ({ ...row, currency: code })),
    nextDefaultPrice: a.nextDefaultPrice
      ? { ...a.nextDefaultPrice, currency: code }
      : null,
  }));
}

module.exports = {
  bokunRequest,
  searchActivities,
  getActivityById,
  getActivityAvailabilities,
  uiLangToBokunLang,
  getQuoteCurrency,
  applyQuoteCurrency,
};
