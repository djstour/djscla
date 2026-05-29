/**
 * Catalog price display trust — REST v2 only (no activity.json).
 *
 * Bókun v2 components (experiencePriceRules) are the catalog sync source.
 * Public UI auto-shows prices that pass automated sanity checks; suspicious
 * rows (too low, ISK mislabel, commission-as-price) stay hidden.
 *
 * Final fare at booking still comes from Hosted checkout / availability check.
 */

const {
  MIN_PLAUSIBLE_DISPLAY_PRICE,
  collectDisplayAmounts,
  hasPlausiblePrice,
  hasUsablePrice,
  pricingLooksMislabeled,
} = require('./catalogQuality');
const {
  getContractIndexByExperienceId,
  fetchContractCommission,
  primaryCommissionPercent,
} = require('./bokunMarketplacePricing');

const PRICE_DISPLAY_TTL_MS = Number(process.env.PRICE_DISPLAY_VERIFY_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

const BLOCKED_REASONS = new Set([
  'no_catalog_price',
  'mislabeled_currency',
  'commission_like_amount',
  'implausible_catalog',
]);

/** v2 rules sometimes store commission % as a dollar amount (e.g. 0.93 ↔ 93%). */
function looksLikeCommissionStoredAsPrice(amount, commissionPct) {
  const n = Number(amount);
  const pct = Number(commissionPct);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(pct) || pct <= 0) return false;
  if (n >= MIN_PLAUSIBLE_DISPLAY_PRICE) return false;
  if (Math.abs(n * 100 - pct) < 2) return true;
  if (Math.abs(n - pct) < 2) return true;
  if (pct > 50 && n < 5 && Math.abs(n * 100 - pct) < 5) return true;
  return false;
}

function catalogMaxUsd(activity) {
  const amounts = collectDisplayAmounts(activity);
  return amounts.length ? Math.max(...amounts) : 0;
}

function needsCommissionProbe(activity) {
  const max = catalogMaxUsd(activity);
  if (!hasUsablePrice(activity)) return false;
  if (max < MIN_PLAUSIBLE_DISPLAY_PRICE) return true;
  if (max < 50) return true;
  return false;
}

/**
 * Automated v2 catalog price audit (no manual approval step).
 */
function evaluateCatalogPriceTrust({ activity, commissionPct = null }) {
  const catalogMax = catalogMaxUsd(activity);
  const checkedAt = new Date().toISOString();
  const base = {
    checkedAt,
    catalogMaxUsd: catalogMax,
    commissionPct: commissionPct != null ? Number(commissionPct) : null,
    verifyPolicy: 'v2_auto',
  };

  if (!activity || !hasUsablePrice(activity)) {
    return {
      ...base,
      trusted: false,
      source: 'v2_components',
      reason: 'no_catalog_price',
      message: 'v2 元件無可用牌價',
    };
  }

  if (pricingLooksMislabeled(activity)) {
    return {
      ...base,
      trusted: false,
      source: 'v2_components',
      reason: 'mislabeled_currency',
      message: 'catalog 價格疑似 ISK 誤標為 USD',
    };
  }

  if (commissionPct != null && (
    looksLikeCommissionStoredAsPrice(catalogMax, commissionPct)
    || collectDisplayAmounts(activity).some((a) => looksLikeCommissionStoredAsPrice(a, commissionPct))
  )) {
    return {
      ...base,
      trusted: false,
      source: 'v2_components',
      reason: 'commission_like_amount',
      message: 'catalog 金額疑似佣金比例，非旅客售價',
    };
  }

  if (!hasPlausiblePrice(activity)) {
    return {
      ...base,
      trusted: false,
      source: 'v2_components',
      reason: 'implausible_catalog',
      message: `v2 catalog 最高牌價低於 $${MIN_PLAUSIBLE_DISPLAY_PRICE}`,
    };
  }

  return {
    ...base,
    trusted: true,
    source: 'v2_components',
    reason: 'v2_catalog_ok',
    message: 'v2 components 牌價通過自動稽核，可顯示於前台',
  };
}

function buildAdminTrustedPriceDisplay(activity, { note } = {}) {
  const catalogMax = catalogMaxUsd(activity);
  return {
    trusted: true,
    source: 'admin_override',
    checkedAt: new Date().toISOString(),
    catalogMaxUsd: catalogMax,
    commissionPct: null,
    verifyPolicy: 'v2_auto',
    reason: 'admin_override',
    message: note || '管理員覆寫牌價顯示設定',
  };
}

function isPriceDisplayFresh(priceDisplay) {
  if (!priceDisplay || !priceDisplay.checkedAt) return false;
  const age = Date.now() - new Date(priceDisplay.checkedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < PRICE_DISPLAY_TTL_MS;
}

/** Public gate — automated v2 audit; no per-product manual approval. */
function isDisplayableCatalogPrice(activity) {
  if (!activity || pricingLooksMislabeled(activity)) return false;

  const pd = activity.priceDisplay;
  if (isPriceDisplayFresh(pd)) {
    if (pd.trusted === true) return true;
    if (BLOCKED_REASONS.has(String(pd.reason || ''))) return false;
  }

  const live = evaluateCatalogPriceTrust({ activity, commissionPct: null });
  return live.trusted === true;
}

function shouldPreserveTrustedDisplay(existing) {
  return isPriceDisplayFresh(existing) && existing.trusted === true;
}

/**
 * Re-run automated audit; probes commission API only for suspicious low amounts.
 */
async function verifyActivityPriceDisplay(experienceId, activity) {
  let commissionPct = null;
  if (needsCommissionProbe(activity)) {
    commissionPct = await resolveCommissionPct(experienceId);
  }

  const priceDisplay = evaluateCatalogPriceTrust({ activity, commissionPct });

  return {
    ...activity,
    priceDisplay,
    priceUnverified: !priceDisplay.trusted,
  };
}

function applyAdminPriceTrust(activity, options = {}) {
  const priceDisplay = buildAdminTrustedPriceDisplay(activity, options);
  return {
    ...activity,
    priceDisplay,
    priceUnverified: false,
  };
}

async function resolveCommissionPct(experienceId) {
  try {
    const index = await getContractIndexByExperienceId();
    const entry = index.get(String(experienceId));
    if (!entry || entry.contractId == null) return null;
    const dto = await fetchContractCommission(entry.contractId, experienceId);
    return primaryCommissionPercent(dto);
  } catch {
    return null;
  }
}

module.exports = {
  PRICE_DISPLAY_TTL_MS,
  BLOCKED_REASONS,
  looksLikeCommissionStoredAsPrice,
  evaluateCatalogPriceTrust,
  buildAdminTrustedPriceDisplay,
  applyAdminPriceTrust,
  isPriceDisplayFresh,
  isDisplayableCatalogPrice,
  shouldPreserveTrustedDisplay,
  verifyActivityPriceDisplay,
};
