/**
 * Marketplace contract pricing insights for admin (B2B).
 * List price = experience price-catalog amount; estimated cost ≈ list × (1 − commission%).
 */

const { bokunRequest } = require('./bokunClient');
const { discoverContractProducts } = require('./bokunV2Catalog');

const COMMISSION_CACHE_MS = 15 * 60 * 1000;
const commissionCache = new Map();

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(amount, currency) {
  const c = (currency || 'USD').toUpperCase();
  const integer = ['ISK', 'JPY', 'KRW', 'TWD', 'CNY', 'HKD', 'MOP'].includes(c);
  return integer ? Math.round(amount) : Math.round(amount * 100) / 100;
}

/** Prefer ADULT, else first positive ticket-category commission. */
function primaryCommissionPercent(commissionDto) {
  if (!commissionDto || typeof commissionDto !== 'object') return null;
  const product = commissionDto.product;
  if (!product || typeof product !== 'object') return null;
  const adult = num(product.ADULT);
  if (adult > 0) return adult;
  const values = Object.values(product).map(num).filter((n) => n > 0);
  if (!values.length) return null;
  return values[0];
}

async function getContractIndexByExperienceId() {
  const entries = await discoverContractProducts();
  const map = new Map();
  entries.forEach((entry) => {
    if (entry && entry.experienceId != null) {
      map.set(String(entry.experienceId), entry);
    }
  });
  return map;
}

async function fetchContractCommission(contractId, experienceId) {
  const key = `${contractId}:${experienceId}`;
  const hit = commissionCache.get(key);
  if (hit && Date.now() - hit.at < COMMISSION_CACHE_MS) return hit.data;

  const data = await bokunRequest({
    method: 'GET',
    path: `/restapi/v2.0/marketplace/contract/${contractId}/experience/${experienceId}/commission`,
  });
  commissionCache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * Lowest positive pricing row from stored bokun_payload (post-sync USD or legacy ISK).
 */
function listPriceFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const rows = Array.isArray(payload.pricing) ? payload.pricing : [];
  let lowest = null;
  let currency = payload.sourceCurrency || payload.currency || 'USD';

  rows.forEach((row) => {
    const amount = num(row && row.amount);
    if (amount <= 0) return;
    const rowCur = (row.currency || currency || 'USD').toUpperCase();
    if (lowest == null || amount < lowest.amount) {
      lowest = { amount, currency: rowCur };
      currency = rowCur;
    }
  });

  if (lowest) return lowest;

  const next = payload.nextDefaultPrice;
  if (next && num(next.amount) > 0) {
    return {
      amount: num(next.amount),
      currency: (next.currency || currency || 'USD').toUpperCase(),
    };
  }

  return null;
}

function estimateNetFromList(listAmount, commissionPct) {
  const list = num(listAmount);
  const pct = num(commissionPct);
  if (list <= 0 || pct <= 0) return null;
  if (pct >= 100) return 0;
  return list * (1 - pct / 100);
}

/**
 * @param {{ bokunActivityId: string, priceFrom?: number|null, currency?: string, bokunPayload?: object }} row
 */
async function resolveContractPricingForActivity(row, contractIndex) {
  const id = String(row.bokunActivityId);
  const entry = contractIndex.get(id);

  const fromPayload = row.bokunPayload ? listPriceFromPayload(row.bokunPayload) : null;
  const listPrice = fromPayload || (row.priceFrom != null && row.priceFrom > 0
    ? { amount: num(row.priceFrom), currency: (row.currency || 'USD').toUpperCase() }
    : null);

  if (!entry || !entry.contractId) {
    return {
      bokunActivityId: id,
      available: false,
      reason: 'NO_CONTRACT',
      listPrice,
      commissionPct: null,
      estimatedCost: null,
      contractId: null,
    };
  }

  try {
    const commissionDto = await fetchContractCommission(entry.contractId, id);
    const commissionPct = primaryCommissionPercent(commissionDto);
    const estimatedAmount = listPrice && commissionPct != null
      ? estimateNetFromList(listPrice.amount, commissionPct)
      : null;

    return {
      bokunActivityId: id,
      available: true,
      contractId: entry.contractId,
      supplierId: entry.supplierId ?? null,
      listPrice: listPrice
        ? { amount: listPrice.amount, currency: listPrice.currency }
        : null,
      commissionPct,
      estimatedCost: estimatedAmount != null && listPrice
        ? {
          amount: roundMoney(estimatedAmount, listPrice.currency),
          currency: listPrice.currency,
        }
        : null,
      priceKind: 'catalog_list',
      note: 'Marketplace catalog list price; estimated cost = list × (1 − commission%).',
    };
  } catch (err) {
    return {
      bokunActivityId: id,
      available: false,
      reason: 'BOKUN_ERROR',
      error: err.message,
      contractId: entry.contractId,
      listPrice,
      commissionPct: null,
      estimatedCost: null,
    };
  }
}

async function mapPool(items, concurrency, fn) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, () => worker()),
  );
  return results;
}

/**
 * @param {Array<{ bokunActivityId: string, priceFrom?: number, currency?: string, bokunPayload?: object }>} rows
 */
async function enrichRowsWithContractPricing(rows, { concurrency = 8 } = {}) {
  if (!rows.length) return {};
  const contractIndex = await getContractIndexByExperienceId();
  const results = await mapPool(
    rows,
    concurrency,
    (row) => resolveContractPricingForActivity(row, contractIndex),
  );
  const byId = {};
  results.forEach((r) => {
    if (r && r.bokunActivityId) byId[String(r.bokunActivityId)] = r;
  });
  return byId;
}

module.exports = {
  primaryCommissionPercent,
  listPriceFromPayload,
  estimateNetFromList,
  enrichRowsWithContractPricing,
  getContractIndexByExperienceId,
  fetchContractCommission,
};
