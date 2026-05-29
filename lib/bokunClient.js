/**
 * Bókun HTTP client — HMAC auth only (REST v2 paths).
 * @see https://api-docs.bokun.dev/rest-v2
 */

const crypto = require('crypto');
const { getFxSnapshot, convertToUsd, roundForCurrency } = require('./fx');

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

/** Currencies that were relabeled to USD without conversion during early v2 sync. */
const MISLABEL_NATIVE_CANDIDATES = ['ISK'];

function looksLikeMislabeledNative(amount, nativeCode, quoteCurrency, rates) {
  if (quoteCurrency !== 'USD' || nativeCode !== 'ISK') return false;
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 2000) return false;
  const rate = rates && rates[nativeCode];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return n >= 5000;
  const asUsd = n / rate;
  return asUsd >= 25 && asUsd <= 2500;
}

/**
 * Native Bókun currency for an activity (before quote conversion).
 * Uses pricing row currencies; repairs legacy payloads that stored ISK amounts as USD.
 */
function inferSourceCurrency(activity, quoteCurrency = getQuoteCurrency(), rates = {}) {
  const quote = (quoteCurrency || 'USD').toUpperCase();
  const rows = Array.isArray(activity.pricing) ? activity.pricing : [];
  const rowCodes = [...new Set(
    rows.map((r) => (r.currency || '').toUpperCase()).filter((c) => c.length === 3),
  )];

  if (activity.sourceCurrency) {
    return String(activity.sourceCurrency).toUpperCase();
  }
  if (rowCodes.length === 1 && rowCodes[0] !== quote) {
    return rowCodes[0];
  }
  if (rowCodes.length === 1 && rowCodes[0] === quote) {
    const amounts = rows.map((r) => Number(r.amount)).filter((n) => Number.isFinite(n) && n > 0);
    const max = amounts.length ? Math.max(...amounts) : 0;
    for (const native of MISLABEL_NATIVE_CANDIDATES) {
      if (looksLikeMislabeledNative(max, native, quote, rates)) return native;
    }
    return quote;
  }
  if (activity.currency && String(activity.currency).toUpperCase() !== quote) {
    return String(activity.currency).toUpperCase();
  }
  return quote;
}

function convertAmountToQuote(amount, sourceCurrency, quoteCurrency, rates) {
  const quote = (quoteCurrency || 'USD').toUpperCase();
  const source = (sourceCurrency || quote).toUpperCase();
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  if (source === quote) return roundForCurrency(n, quote);
  return roundForCurrency(convertToUsd(n, source, rates), quote);
}

function convertActivityToQuoteCurrency(activity, quoteCurrency, rates) {
  const quote = (quoteCurrency || 'USD').toUpperCase();
  const source = inferSourceCurrency(activity, quote, rates);
  const convert = (amount) => convertAmountToQuote(amount, source, quote, rates);

  return {
    ...activity,
    sourceCurrency: source,
    currency: quote,
    defaultCurrency: quote,
    pricing: (activity.pricing || []).map((row) => ({
      ...row,
      amount: convert(row.amount),
      currency: quote,
    })),
    nextDefaultPrice: activity.nextDefaultPrice
      ? {
        ...activity.nextDefaultPrice,
        amount: convert(activity.nextDefaultPrice.amount),
        currency: quote,
      }
      : null,
    bookableExtras: (activity.bookableExtras || []).map((ex) => ({
      ...ex,
      price: convert(ex.price),
    })),
  };
}

/**
 * Normalize activity money fields to BOKUN_CURRENCY (default USD) using live FX.
 * @param {object[]} activities
 * @param {string} [quoteCurrency]
 * @param {Record<string, number>} [rates] — USD-base rates (ISK = units per 1 USD)
 */
function applyQuoteCurrency(activities, quoteCurrency = getQuoteCurrency(), rates = { USD: 1 }) {
  return (activities || []).map((a) => convertActivityToQuoteCurrency(a, quoteCurrency, rates));
}

async function applyQuoteCurrencyAsync(activities, quoteCurrency = getQuoteCurrency()) {
  const snap = await getFxSnapshot();
  return applyQuoteCurrency(activities, quoteCurrency, snap.rates);
}

module.exports = {
  bokunRequest,
  getConfig,
  uiLangToBokunLang,
  getQuoteCurrency,
  inferSourceCurrency,
  applyQuoteCurrency,
  applyQuoteCurrencyAsync,
};
