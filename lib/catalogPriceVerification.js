/**
 * Catalog price display trust — REST v2 only (no activity.json).
 *
 * v2 experiencePriceRules 常不等於 Hosted 旅客售價，故預設不信任 components 牌價。
 * 前台僅在 priceDisplay.source === 'admin'（人工對照 Bókun 後台）或
 * 日後 v2 可用性／售價端點提供獨立報價時顯示。
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

const TRUSTED_SOURCES = new Set(['admin', 'v2_availability']);

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

/**
 * Automatic v2 audit — never sets trusted for public display.
 * @param {object} params
 * @param {object} params.activity
 * @param {number|null} [params.commissionPct] — from v2 marketplace commission API
 */
function evaluateCatalogPriceTrust({ activity, commissionPct = null }) {
  const catalogMax = catalogMaxUsd(activity);
  const checkedAt = new Date().toISOString();
  const base = {
    checkedAt,
    catalogMaxUsd: catalogMax,
    commissionPct: commissionPct != null ? Number(commissionPct) : null,
    verifyPolicy: 'v2_only',
    source: 'v2_components_audit',
    trusted: false,
  };

  if (!activity || !hasUsablePrice(activity)) {
    return {
      ...base,
      reason: 'no_catalog_price',
      message: 'v2 元件無可用牌價資料',
    };
  }

  if (pricingLooksMislabeled(activity)) {
    return {
      ...base,
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
      reason: 'commission_like_amount',
      message: 'catalog 金額疑似佣金比例，非旅客售價',
    };
  }

  if (!hasPlausiblePrice(activity)) {
    return {
      ...base,
      reason: 'implausible_catalog',
      message: `v2 components 最高牌價低於 $${MIN_PLAUSIBLE_DISPLAY_PRICE}，不可作前台售價`,
    };
  }

  return {
    ...base,
    reason: 'v2_components_not_for_display',
    message: '依 REST v2 規範，components 牌價不作前台售價；請對照 Bókun 後台後由管理員核准，或於 Hosted 結帳確認',
  };
}

function buildAdminTrustedPriceDisplay(activity, { note } = {}) {
  const catalogMax = catalogMaxUsd(activity);
  return {
    trusted: true,
    source: 'admin',
    checkedAt: new Date().toISOString(),
    catalogMaxUsd: catalogMax,
    commissionPct: null,
    verifyPolicy: 'v2_only',
    reason: 'admin_confirmed',
    message: note || '管理員已對照 Bókun 後台核准前台顯示牌價',
  };
}

function isPriceDisplayFresh(priceDisplay) {
  if (!priceDisplay || !priceDisplay.checkedAt) return false;
  const age = Date.now() - new Date(priceDisplay.checkedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < PRICE_DISPLAY_TTL_MS;
}

/** Public gate — only admin- or live-availability-confirmed prices. */
function isDisplayableCatalogPrice(activity) {
  if (!activity || pricingLooksMislabeled(activity)) return false;
  const pd = activity.priceDisplay;
  if (!isPriceDisplayFresh(pd) || !pd.trusted) return false;
  return TRUSTED_SOURCES.has(String(pd.source || ''));
}

function shouldPreserveTrustedDisplay(existing) {
  return isPriceDisplayFresh(existing)
    && existing.trusted === true
    && TRUSTED_SOURCES.has(String(existing.source || ''));
}

/**
 * Re-run v2 audit; preserves an existing admin / availability trust stamp.
 */
async function verifyActivityPriceDisplay(experienceId, activity) {
  const existing = activity && activity.priceDisplay;
  if (shouldPreserveTrustedDisplay(existing)) {
    return {
      ...activity,
      priceDisplay: existing,
      priceUnverified: false,
    };
  }

  const commissionPct = await resolveCommissionPct(experienceId);
  const priceDisplay = evaluateCatalogPriceTrust({ activity, commissionPct });

  return {
    ...activity,
    priceDisplay,
    priceUnverified: !priceDisplay.trusted,
  };
}

/**
 * Admin confirms price matches Bókun backend after manual review.
 */
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
  TRUSTED_SOURCES,
  looksLikeCommissionStoredAsPrice,
  evaluateCatalogPriceTrust,
  buildAdminTrustedPriceDisplay,
  applyAdminPriceTrust,
  isPriceDisplayFresh,
  isDisplayableCatalogPrice,
  verifyActivityPriceDisplay,
};
