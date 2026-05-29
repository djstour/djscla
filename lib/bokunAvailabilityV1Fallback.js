/**
 * v2 availability DTO has no per-slot pricing; graft pricesByRate from v1 availabilities.
 * @see lib/bokunExtrasV1Fallback.js — same narrow v1 read pattern.
 */

const { bokunRequest, getQuoteCurrency } = require('./bokunClient');

function v1FallbackEnabled() {
  const flag = String(process.env.BOKUN_AVAILABILITY_V1_FALLBACK || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function resolveAmountValue(amount) {
  if (amount == null) return null;
  if (typeof amount === 'number') return Number.isFinite(amount) ? amount : null;
  if (typeof amount === 'object' && amount.amount != null) return resolveAmountValue(amount.amount);
  const n = Number(amount);
  return Number.isFinite(n) ? n : null;
}

function slotKey(row) {
  if (!row) return '';
  const date = row.localDate || row.dateString || row.date;
  const dateStr = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : (typeof date === 'number' ? new Date(date).toISOString().slice(0, 10) : '');
  const st = row.startTimeId != null ? String(row.startTimeId) : '';
  return `${dateStr}:${st}`;
}

/**
 * @param {string|number} experienceId
 * @param {{ start: string, end?: string }} range
 * @returns {Promise<object[]>}
 */
async function fetchV1Availabilities(experienceId, { start, end = start }) {
  if (!v1FallbackEnabled() || experienceId == null || !start) return [];
  try {
    const qs = new URLSearchParams({ start, end: end || start });
    const payload = await bokunRequest({
      method: 'GET',
      path: `/activity.json/${encodeURIComponent(String(experienceId))}/availabilities?${qs}`,
    });
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.availabilities)) return payload.availabilities;
    return [];
  } catch (err) {
    console.warn('[bokunAvailabilityV1Fallback]', experienceId, err.message || err);
    return [];
  }
}

async function convertMoneyToQuote(amount, sourceCurrency, quoteCurrency) {
  const { getFxSnapshot, roundForCurrency, convertToUsd } = require('./fx');
  const raw = resolveAmountValue(amount);
  if (raw == null || raw <= 0) return null;
  const source = String(sourceCurrency || quoteCurrency || 'USD').toUpperCase();
  const quote = String(quoteCurrency || 'USD').toUpperCase();
  if (source === quote) return roundForCurrency(raw, quote);
  const snap = await getFxSnapshot();
  return roundForCurrency(convertToUsd(raw, source, snap.rates), quote);
}

async function normalizePricesByRate(pricesByRate, quoteCurrency) {
  if (!Array.isArray(pricesByRate) || !pricesByRate.length) return [];
  const quote = quoteCurrency || getQuoteCurrency();
  const out = [];
  for (const rateRow of pricesByRate) {
    const pricePerCategoryUnit = [];
    for (const entry of (rateRow.pricePerCategoryUnit || [])) {
      const raw = resolveAmountValue(entry.amount);
      if (raw == null || raw <= 0) {
        pricePerCategoryUnit.push(entry);
        continue;
      }
      const sourceCur = (typeof entry.amount === 'object' && entry.amount?.currency)
        ? entry.amount.currency
        : quote;
      const converted = await convertMoneyToQuote(raw, sourceCur, quote);
      pricePerCategoryUnit.push({
        ...entry,
        amount: {
          ...(typeof entry.amount === 'object' && entry.amount ? entry.amount : {}),
          amount: converted,
          currency: quote,
        },
      });
    }
    let pricePerBooking = rateRow.pricePerBooking;
    if (pricePerBooking) {
      const bookingRaw = resolveAmountValue(pricePerBooking);
      if (bookingRaw != null && bookingRaw > 0) {
        const bookingCur = (typeof pricePerBooking === 'object' && pricePerBooking.currency)
          ? pricePerBooking.currency
          : quote;
        const convertedBooking = await convertMoneyToQuote(bookingRaw, bookingCur, quote);
        pricePerBooking = {
          ...(typeof pricePerBooking === 'object' ? pricePerBooking : {}),
          amount: convertedBooking,
          currency: quote,
        };
      }
    }
    out.push({
      ...rateRow,
      pricePerCategoryUnit,
      pricePerBooking,
    });
  }
  return out;
}

/**
 * Merge v1 pricesByRate onto v2-mapped availability rows (matched by date + startTimeId).
 * @param {string|number} experienceId
 * @param {object[]} v2Rows
 * @param {{ start: string, end?: string }} range
 */
async function mergeV1AvailabilityPricing(experienceId, v2Rows, { start, end = start }) {
  if (!Array.isArray(v2Rows) || !v2Rows.length) return v2Rows || [];
  const v1Rows = await fetchV1Availabilities(experienceId, { start, end });
  if (!v1Rows.length) return v2Rows;

  const v1ByKey = new Map();
  const v1ByDate = new Map();
  v1Rows.forEach((row) => {
    const key = slotKey(row);
    const date = row.localDate || row.dateString
      || (typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null);
    if (key && Array.isArray(row.pricesByRate) && row.pricesByRate.length) {
      v1ByKey.set(key, row);
    }
    if (date && Array.isArray(row.pricesByRate) && row.pricesByRate.length) {
      const prev = v1ByDate.get(date);
      const score = (r) => (r.pricesByRate || []).reduce(
        (n, rate) => n + (rate.pricePerCategoryUnit || []).length,
        0,
      );
      if (!prev || score(row) >= score(prev)) v1ByDate.set(date, row);
    }
  });
  if (!v1ByKey.size && !v1ByDate.size) return v2Rows;

  const quote = getQuoteCurrency();
  const out = [];
  for (const v2 of v2Rows) {
    let hit = v1ByKey.get(slotKey(v2));
    if (!hit && v2.localDate) hit = v1ByDate.get(v2.localDate);
    if (!hit) {
      out.push(v2);
      continue;
    }
    const pricesByRate = await normalizePricesByRate(hit.pricesByRate, quote);
    out.push({
      ...v2,
      pricesByRate,
      defaultRateId: hit.defaultRateId ?? pricesByRate[0]?.activityRateId ?? v2.defaultRateId,
    });
  }
  return out;
}

module.exports = {
  v1FallbackEnabled,
  fetchV1Availabilities,
  mergeV1AvailabilityPricing,
};
