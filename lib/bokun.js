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

/**
 * Bókun `/checkout.json/questions` — returns the dynamic per-product questions
 * shown in Bókun back-office's Step 2 (gender, nationality, passport,
 * pickup pref, allergies, etc.). Caller supplies a normalized list of items:
 *
 *   [{ activityId, startTimeId, date, pricingCategoryBookings: [{ id, quantity }] }, …]
 *
 * Bókun's payload uses snake-cased and camelCased keys interchangeably in
 * historical docs; we ship the modern camelCase shape and let the upstream
 * reject if the account is on the legacy schema (rare for resellers signed
 * up after 2020).
 */
async function getCheckoutQuestions({ items, uiLang } = {}) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('getCheckoutQuestions: items[] required');
    err.code = 'INVALID_REQUEST';
    throw err;
  }
  const { lang: defaultLang, currency } = getConfig();
  const lang = uiLang ? uiLangToBokunLang(uiLang) : defaultLang;

  const body = {
    currency,
    lang,
    items: items.map((it) => ({
      activityId: Number(it.activityId) || it.activityId,
      startTimeId: it.startTimeId != null ? Number(it.startTimeId) || it.startTimeId : null,
      date: it.date || null,
      pricingCategoryBookings: Array.isArray(it.pricingCategoryBookings)
        ? it.pricingCategoryBookings.map((row) => ({
            pricingCategoryId: Number(row.pricingCategoryId ?? row.id) || row.pricingCategoryId,
            quantity: Number(row.quantity) || 0,
          }))
        : [],
      // Bókun also accepts `extras` and `pickupPlaceId` here — surface them
      // when present so multi-product carts mirror what was selected on the
      // detail page.
      extras: Array.isArray(it.extras)
        ? it.extras.map((ex) => ({ extraId: Number(ex.extraId ?? ex.id), quantity: Number(ex.quantity) || 1 }))
        : undefined,
      pickupPlaceId: it.pickupPlaceId != null ? Number(it.pickupPlaceId) || it.pickupPlaceId : undefined,
    })),
  };

  return bokunRequest({ method: 'POST', path: '/checkout.json/questions', body });
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
  getCheckoutQuestions,
  uiLangToBokunLang,
  getQuoteCurrency,
  applyQuoteCurrency,
};
