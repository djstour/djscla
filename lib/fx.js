/**
 * FX layer — Frankfurter (ECB reference rates), USD base.
 * @see https://www.frankfurter.app/docs/
 * Rates are cached in-memory per serverless instance (see TTL).
 */

/** Matches UI CURRENCIES (see ui_kits/web/components/_shared.jsx). */
const SUPPORTED = ['USD', 'TWD', 'CNY', 'HKD', 'SGD', 'MYR', 'MOP', 'CAD', 'AUD'];
/** Bókun supplier-native currencies we convert from (not shown in the currency picker). */
const BOKUN_SOURCE_CURRENCIES = ['ISK', 'EUR', 'GBP'];
const INTEGER_DISPLAY_CURRENCIES = ['TWD', 'CNY', 'HKD', 'MOP', 'ISK', 'JPY', 'KRW'];
const BASE = 'USD';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest';
/** ECB / Frankfurter does not publish these; filled from open.er-api.com (live, no hardcoded rates). */
const SUPPLEMENTAL_CURRENCIES = ['TWD', 'MOP'];
const SUPPLEMENTAL_URL = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — display rates only

let cache = {
  fetchedAt: 0,
  date: null,
  provider: 'frankfurter',
  rates: { USD: 1 },
};

async function fetchFrankfurterRates() {
  const targets = [...new Set([
    ...SUPPORTED.filter((c) => c !== BASE && !SUPPLEMENTAL_CURRENCIES.includes(c)),
    ...BOKUN_SOURCE_CURRENCIES,
  ])].join(',');
  const url = `${FRANKFURTER_URL}?from=${BASE}&to=${targets}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Frankfurter: invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`Frankfurter ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

async function fetchSupplementalRates(codes) {
  const needed = codes.filter((c) => c !== BASE && SUPPLEMENTAL_CURRENCIES.includes(c));
  if (needed.length === 0) return {};
  const res = await fetch(SUPPLEMENTAL_URL, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Supplemental FX: invalid JSON (${res.status})`);
  }
  if (!res.ok || data.result !== 'success') {
    throw new Error(`Supplemental FX ${res.status}: ${text.slice(0, 200)}`);
  }
  const out = {};
  for (const code of needed) {
    const rate = data.rates && data.rates[code];
    if (rate != null && Number.isFinite(rate)) out[code] = rate;
  }
  return out;
}

/**
 * @returns {{ base: string, date: string, provider: string, rates: Record<string, number> }}
 */
async function getFxSnapshot({ forceRefresh = false } = {}) {
  const stale = Date.now() - cache.fetchedAt > TTL_MS;
  if (!forceRefresh && !stale && cache.date && Object.keys(cache.rates).length > 1) {
    return {
      base: BASE,
      date: cache.date,
      provider: cache.provider,
      rates: { ...cache.rates },
      cached: true,
    };
  }

  try {
    const data = await fetchFrankfurterRates();
    const rates = { USD: 1, ...(data.rates || {}) };
    const missingSupplemental = SUPPORTED.filter(
      (c) => c !== BASE && SUPPLEMENTAL_CURRENCIES.includes(c) && rates[c] == null,
    );
    if (missingSupplemental.length > 0) {
      const extra = await fetchSupplementalRates(missingSupplemental);
      Object.assign(rates, extra);
    }
    for (const code of SUPPORTED) {
      if (rates[code] == null) {
        console.warn(`[fx] No live rate for ${code}, using 1:1 fallback`);
        rates[code] = code === BASE ? 1 : rates[code] ?? 1;
      }
    }
    cache = {
      fetchedAt: Date.now(),
      date: data.date || new Date().toISOString().slice(0, 10),
      provider: 'frankfurter',
      rates,
    };
    return {
      base: BASE,
      date: cache.date,
      provider: cache.provider,
      rates: { ...rates },
      cached: false,
    };
  } catch (err) {
    if (cache.date && Object.keys(cache.rates).length > 1) {
      return {
        base: BASE,
        date: cache.date,
        provider: cache.provider,
        rates: { ...cache.rates },
        cached: true,
        stale: true,
        warning: err.message,
      };
    }
    throw err;
  }
}

function convertFromUsd(amountUsd, targetCurrency, rates) {
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount)) return 0;
  const code = (targetCurrency || BASE).toUpperCase();
  if (code === BASE) return amount;
  const table = rates || cache.rates;
  const rate = table[code];
  if (!rate || !Number.isFinite(rate)) return amount;
  return amount * rate;
}

/** Frankfurter rates are quoted as target units per 1 USD (e.g. ISK per USD). */
function convertToUsd(amount, fromCurrency, rates) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const from = (fromCurrency || BASE).toUpperCase();
  if (from === BASE) return n;
  const table = rates || cache.rates;
  const rate = table[from];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return n;
  return n / rate;
}

function roundForCurrency(amount, code) {
  const c = (code || BASE).toUpperCase();
  return INTEGER_DISPLAY_CURRENCIES.includes(c)
    ? Math.round(amount)
    : Math.round(amount * 100) / 100;
}

module.exports = {
  SUPPORTED,
  BOKUN_SOURCE_CURRENCIES,
  BASE,
  getFxSnapshot,
  convertFromUsd,
  convertToUsd,
  roundForCurrency,
};
