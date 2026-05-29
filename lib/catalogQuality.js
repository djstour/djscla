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

function hasV2DetailShape(activity) {
  if (!activity) return false;
  if (activity.activityType) return true;
  const cutoff = Number(activity.bookingCutoff);
  if (Number.isFinite(cutoff) && cutoff > 0) return true;
  if (Number(activity.bookingCutoffHours) > 0) return true;
  if (Number(activity.bookingCutoffDays) > 0) return true;
  if (Number(activity.bookingCutoffWeeks) > 0) return true;
  if (Number(activity.bookingCutoffMinutes) > 0) return true;
  if (activity.cancellationPolicy && (
    activity.cancellationPolicy.title
    || (Array.isArray(activity.cancellationPolicy.penaltyRules) && activity.cancellationPolicy.penaltyRules.length)
  )) return true;
  if (activity.meetingPoint && (activity.meetingPoint.title || activity.meetingPoint.address)) return true;
  return false;
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

function auditActivityPayload(activity) {
  const amounts = collectDisplayAmounts(activity);
  const maxUsd = amounts.length ? Math.max(...amounts) : 0;
  const minUsd = amounts.length ? Math.min(...amounts) : 0;

  return {
    minDisplayUsd: minUsd,
    maxDisplayUsd: maxUsd,
    priceImplausible: amounts.length > 0 && maxUsd < MIN_PLAUSIBLE_DISPLAY_PRICE,
    pickupHostedOnly: pickupSelectionAtHosted(activity),
    missingV2Detail: !hasV2DetailShape(activity),
  };
}

module.exports = {
  MIN_PLAUSIBLE_DISPLAY_PRICE,
  collectDisplayAmounts,
  formatDurationLabel,
  resolveDurationDisplay,
  hasUsablePrice,
  hasPlausiblePrice,
  hasV2DetailShape,
  hasDetailDuration,
  isDbDetailCacheUsable,
  pickupSelectionAtHosted,
  auditActivityPayload,
};
