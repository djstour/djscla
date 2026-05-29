/**
 * Catalog / detail payload quality checks (pricing sanity, pickup model).
 * Shared by API detail cache gate, admin health, and catalog sync stats.
 */

const MIN_PLAUSIBLE_DISPLAY_PRICE = Number(process.env.CATALOG_MIN_PLAUSIBLE_USD) || 12;

function collectDisplayAmounts(activity) {
  if (!activity || typeof activity !== 'object') return [];
  const amounts = [];
  (activity.pricing || []).forEach((row) => {
    const n = Number(row && row.amount);
    if (Number.isFinite(n) && n > 0) amounts.push(n);
  });
  const next = activity.nextDefaultPrice && Number(activity.nextDefaultPrice.amount);
  if (Number.isFinite(next) && next > 0) amounts.push(next);
  return amounts;
}

function formatDurationLabel(dur) {
  if (!dur || typeof dur !== 'object') return '';
  if (dur.label && String(dur.label).trim()) return String(dur.label).trim();

  const parts = [];
  const w = Number(dur.weeks) || 0;
  const d = Number(dur.days) || 0;
  const h = Number(dur.hours) || 0;
  const m = Number(dur.minutes) || 0;
  if (w > 0) parts.push(`${w} ${w === 1 ? 'week' : 'weeks'}`);
  if (d > 0) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

function hasUsablePrice(activity) {
  return collectDisplayAmounts(activity).length > 0;
}

function hasPlausiblePrice(activity) {
  if (!hasUsablePrice(activity)) return false;
  return Math.max(...collectDisplayAmounts(activity)) >= MIN_PLAUSIBLE_DISPLAY_PRICE;
}

/** Legacy payloads stored ISK magnitudes with currency=USD (e.g. 26990). */
function pricingLooksMislabeled(activity) {
  if (!activity || typeof activity !== 'object') return false;
  const rows = Array.isArray(activity.pricing) ? activity.pricing : [];
  return rows.some((row) => {
    const amount = Number(row && row.amount);
    const cur = String((row && row.currency) || activity.currency || 'USD').toUpperCase();
    return cur === 'USD' && Number.isFinite(amount) && amount >= 5000;
  });
}

function hasV2DetailShape(activity) {
  if (!activity) return false;
  if (activity.activityType) return true;

  const cutoffTotal = Number(
    activity.bookingCutoffTotalMinutes != null
      ? activity.bookingCutoffTotalMinutes
      : activity.bookingCutoff,
  );
  if (Number.isFinite(cutoffTotal) && cutoffTotal > 0) return true;
  if (Number(activity.bookingCutoffHours) > 0) return true;
  if (Number(activity.bookingCutoffDays) > 0) return true;
  if (Number(activity.bookingCutoffWeeks) > 0) return true;
  if (Number(activity.bookingCutoffMinutes) > 0) return true;

  if (activity.cancellationPolicyTitle) return true;
  const policy = activity.cancellationPolicy;
  if (policy && (
    policy.title
    || (Array.isArray(policy.penaltyRules) && policy.penaltyRules.length)
  )) return true;

  const mp = activity.meetingPoint;
  if (mp && (mp.title || mp.address)) return true;

  const mt = activity.meetingType;
  if (mt && typeof mt === 'object') {
    if (mt.type) return true;
    if (Array.isArray(mt.meetingPointAddresses) && mt.meetingPointAddresses.length) return true;
    if (Array.isArray(mt.pickupPlaceGroupIds) && mt.pickupPlaceGroupIds.length) return true;
  }

  if (Array.isArray(activity.bookableExtras) && activity.bookableExtras.length > 0) return true;
  if (String(activity.cancellationPolicyHtml || '').trim().length > 20) return true;

  return false;
}

/** Row-level: detail sync completed (column) and payload has v2 detail markers. */
function hasCompletedDetailSync(row) {
  if (!row || !row.detail_synced_at) return false;
  return hasV2DetailShape(row.bokun_payload || row);
}

function hasDetailDuration(activity) {
  if (!activity) return false;
  if (String(activity.durationText || '').trim()) return true;
  const mins = Number(activity.durationMinutes);
  return Number.isFinite(mins) && mins > 0;
}

/** Human-readable duration for UI when only minutes or a duration object exist. */
function resolveDurationDisplay(activity) {
  if (!activity) return '';
  const text = String(activity.durationText || activity.duration || '').trim();
  if (text && text !== '[object Object]') return text;
  if (activity.duration && typeof activity.duration === 'object') {
    const fromObj = formatDurationLabel(activity.duration);
    if (fromObj) return fromObj;
  }
  const mins = Number(activity.durationMinutes);
  if (Number.isFinite(mins) && mins > 0) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
    if (m > 0) parts.push(`${m} ${m === 1 ? 'minute' : 'minutes'}`);
    return parts.join(' ');
  }
  return '';
}

function isDbDetailCacheUsable(activity) {
  return activity
    && activity.pickupInfo !== undefined
    && activity.bookableExtras !== undefined
    && hasPlausiblePrice(activity)
    && hasV2DetailShape(activity)
    && hasDetailDuration(activity);
}

/**
 * Pick-up places live in Bókun place groups; v2 components only expose group IDs.
 */
function pickupSelectionAtHosted(activity) {
  if (!activity) return false;
  const info = activity.pickupInfo && typeof activity.pickupInfo === 'object'
    ? activity.pickupInfo
    : null;
  if (info && info.selectionAtHostedCheckout) return true;

  const enabled = !!(activity.pickupService || info?.enabled);
  if (!enabled) return false;

  const places = Array.isArray(activity.pickupPlaces) && activity.pickupPlaces.length
    ? activity.pickupPlaces
    : (Array.isArray(info?.places) ? info.places : []);
  if (places.length > 0) return false;

  const groupIds = activity.pickupPlaceGroupIds
    || info?.pickupPlaceGroupIds
    || [];
  if (Array.isArray(groupIds) && groupIds.length > 0) return true;
  if (info?.allPickupPlaceGroups) return true;
  return false;
}

function auditActivityPayload(activity, { detailSyncedAt } = {}) {
  const amounts = collectDisplayAmounts(activity);
  const maxUsd = amounts.length ? Math.max(...amounts) : 0;
  const minUsd = amounts.length ? Math.min(...amounts) : 0;
  const pd = activity && activity.priceDisplay;
  const priceVerified = !!(pd && pd.trusted);
  const priceUntrusted = !!(pd && pd.checkedAt && !pd.trusted && (
    !pd.reason
    || pd.reason === 'implausible_catalog'
    || pd.reason === 'commission_like_amount'
    || pd.reason === 'mislabeled_currency'
    || pd.reason === 'no_catalog_price'
  ));
  const shapeOk = hasV2DetailShape(activity);
  const neverDetailSynced = !detailSyncedAt;
  const syncedButThin = !!detailSyncedAt && !shapeOk;

  return {
    minDisplayUsd: minUsd,
    maxDisplayUsd: maxUsd,
    priceImplausible: amounts.length > 0 && maxUsd < MIN_PLAUSIBLE_DISPLAY_PRICE,
    priceVerified,
    priceUntrusted,
    priceVerifyReason: pd && pd.reason ? String(pd.reason) : null,
    pickupHostedOnly: pickupSelectionAtHosted(activity),
    missingV2Detail: neverDetailSynced || syncedButThin,
    detailNeverSynced: neverDetailSynced,
    detailSyncedThin: syncedButThin,
  };
}

module.exports = {
  MIN_PLAUSIBLE_DISPLAY_PRICE,
  collectDisplayAmounts,
  formatDurationLabel,
  resolveDurationDisplay,
  hasUsablePrice,
  hasPlausiblePrice,
  pricingLooksMislabeled,
  hasV2DetailShape,
  hasCompletedDetailSync,
  hasDetailDuration,
  isDbDetailCacheUsable,
  pickupSelectionAtHosted,
  auditActivityPayload,
};
