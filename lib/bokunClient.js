/**
 * Bókun HTTP client — HMAC auth only (REST v2 paths).
 * @see https://api-docs.bokun.dev/rest-v2
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
 * @param {{ method: string, path: string, body?: object }} opts — path must include query for signing
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

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
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

function getQuoteCurrency() {
  return (process.env.BOKUN_CURRENCY || 'USD').trim().toUpperCase();
}

function applyQuoteCurrency(activities, quoteCurrency = getQuoteCurrency()) {
  const code = (quoteCurrency || 'USD').toUpperCase();
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
  getConfig,
  uiLangToBokunLang,
  getQuoteCurrency,
  applyQuoteCurrency,
};
