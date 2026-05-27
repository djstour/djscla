/**
 * Bókun pricing-category helpers for booking UI (Adult / Youth / Child / …).
 */

function getPricingCategories(activityOrTour) {
  const a = activityOrTour || {};
  const raw = a.raw || a;
  const list = a.pricingCategories
    || raw.pricingCategories
    || [];
  return Array.isArray(list) ? list.filter((c) => c && c.id != null) : [];
}

const TICKET_CATEGORY_ORDER = {
  ADULT: 0,
  TEENAGER: 1,
  CHILD: 2,
};

function sortPricingCategories(categories) {
  return [...categories].sort((a, b) => {
    const ao = TICKET_CATEGORY_ORDER[a.ticketCategory];
    const bo = TICKET_CATEGORY_ORDER[b.ticketCategory];
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (a.defaultCategory && !b.defaultCategory) return -1;
    if (!a.defaultCategory && b.defaultCategory) return 1;
    const aMin = Number.isFinite(Number(a.minAge)) ? Number(a.minAge) : 0;
    const bMin = Number.isFinite(Number(b.minAge)) ? Number(b.minAge) : 0;
    return bMin - aMin;
  });
}

function bookablePricingCategories(activityOrTour) {
  const list = getPricingCategories(activityOrTour).filter((c) => !c.internalUseOnly);
  return sortPricingCategories(list);
}

/** Bókun back-office label, e.g. Adults (16+), Youth (12 - 15), Child (6 - 11). */
function paxCategoryLabel(cat) {
  if (!cat) return '';
  if (cat.fullTitle) return String(cat.fullTitle).trim();
  const title = cat.title || (cat.ticketCategory === 'CHILD' ? 'Child' : 'Adult');
  const min = cat.minAge ?? '';
  const max = cat.maxAge ?? '';
  if (min === '' && max === '') return title;
  if (Number(max) === 0 || max === null) {
    return `${title} (${min}+)`;
  }
  return `${title} (${min} - ${max})`;
}

function findCategory(categories, matcher) {
  return categories.find(matcher) || null;
}

function initPaxCounts(categories, legacy = {}) {
  const counts = {};
  categories.forEach((c) => {
    counts[String(c.id)] = 0;
  });
  const adult = findCategory(categories, (c) =>
    c.defaultCategory || c.ticketCategory === 'ADULT' || /adult/i.test(c.title || ''));
  const youth = findCategory(categories, (c) =>
    c.ticketCategory === 'TEENAGER' || /youth/i.test(c.title || c.fullTitle || ''));
  const child = findCategory(categories, (c) =>
    (c.ticketCategory === 'CHILD' || /child/i.test(c.title || '')) && c.id !== youth?.id);

  const legacyAdults = Math.max(0, Number(legacy.adults) || 0);
  const legacyChildren = Math.max(0, Number(legacy.children) || 0);

  if (adult) {
    counts[String(adult.id)] = legacyAdults > 0 ? legacyAdults : 1;
  } else if (categories[0]) {
    counts[String(categories[0].id)] = legacyAdults > 0 ? legacyAdults : 1;
  }

  if (child && legacyChildren > 0) {
    counts[String(child.id)] = legacyChildren;
  }

  return counts;
}

function paxCountsTotal(counts) {
  return Object.values(counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

function buildAvailabilityPax(categories, counts) {
  return categories
    .map((cat) => ({
      pricingCategoryId: cat.id,
      quantity: Number(counts[String(cat.id)]) || 0,
    }))
    .filter((row) => row.quantity > 0);
}

function paxCountsToLegacyGuests(categories, counts) {
  const adult = findCategory(categories, (c) =>
    c.defaultCategory || c.ticketCategory === 'ADULT');
  const youth = findCategory(categories, (c) => c.ticketCategory === 'TEENAGER');
  const child = findCategory(categories, (c) => c.ticketCategory === 'CHILD');
  const adults = adult ? (Number(counts[String(adult.id)]) || 0) : 0;
  const children = (youth ? (Number(counts[String(youth.id)]) || 0) : 0)
    + (child ? (Number(counts[String(child.id)]) || 0) : 0);
  return { adults, children };
}

/**
 * Effective per-booking pax ceiling from live availability (date / time / check).
 * Falls back to bookingCap when upstream has no finite capacity.
 */
function resolveLivePaxCap({
  bookingCap,
  dayInfo,
  startTimeId,
  dayTimes,
  availabilityCheck,
}) {
  const cap = Number.isFinite(Number(bookingCap)) && Number(bookingCap) > 0
    ? Number(bookingCap)
    : 15;

  const finite = (n) => Number.isFinite(Number(n)) && Number(n) >= 0;

  let live = null;

  const fromCheck = availabilityCheck?.availability?.capacityRemaining;
  if (finite(fromCheck)) live = Number(fromCheck);

  if (live == null && startTimeId != null && startTimeId !== '' && Array.isArray(dayTimes)) {
    const slot = dayTimes.find((t) => String(t.id) === String(startTimeId));
    if (slot && finite(slot.capacityRemaining)) live = Number(slot.capacityRemaining);
  }

  if (live == null && Array.isArray(dayTimes) && dayTimes.length === 1) {
    const only = dayTimes[0];
    if (only && finite(only.capacityRemaining)) live = Number(only.capacityRemaining);
  }

  if (live == null && Array.isArray(dayTimes) && dayTimes.length > 1
    && (startTimeId == null || startTimeId === '')) {
    const slotCaps = dayTimes
      .filter((t) => !t.soldOut && finite(t.capacityRemaining))
      .map((t) => Number(t.capacityRemaining));
    if (slotCaps.length) live = Math.min(...slotCaps);
  }

  if (live == null && dayInfo && finite(dayInfo.capacityRemaining)) {
    live = Number(dayInfo.capacityRemaining);
  }

  if (live == null) return cap;
  return Math.min(cap, live);
}

/** Min/max quantity for one pricing category given total live cap. */
function categoryPaxBounds(cat, counts, categories, livePaxMax) {
  const minQty = cat.defaultCategory ? 1 : 0;
  const othersTotal = categories.reduce((sum, c) => {
    if (String(c.id) === String(cat.id)) return sum;
    return sum + (Number(counts[String(c.id)]) || 0);
  }, 0);
  const remaining = Math.max(0, Number(livePaxMax) - othersTotal);
  if (cat.defaultCategory) {
    const min = livePaxMax > 0 ? 1 : 0;
    return { min, max: Math.max(min, remaining) };
  }
  return { min: 0, max: remaining };
}

/** Trim counts when total exceeds live cap (non-default categories first). */
function clampPaxCounts(counts, categories, livePaxMax) {
  const maxTotal = Number(livePaxMax);
  if (!Number.isFinite(maxTotal) || maxTotal < 0) return counts;
  let total = paxCountsTotal(counts);
  if (total <= maxTotal) return counts;

  const next = { ...counts };
  let excess = total - maxTotal;
  const order = [...categories].sort((a, b) => {
    if (a.defaultCategory && !b.defaultCategory) return 1;
    if (!a.defaultCategory && b.defaultCategory) return -1;
    return 0;
  });

  order.forEach((cat) => {
    if (excess <= 0) return;
    const key = String(cat.id);
    const min = cat.defaultCategory && maxTotal > 0 ? 1 : 0;
    const cur = Number(next[key]) || 0;
    const drop = Math.min(excess, Math.max(0, cur - min));
    if (drop > 0) {
      next[key] = cur - drop;
      excess -= drop;
    }
  });

  return next;
}

function unitPriceFromTour(tour, categoryId) {
  const id = String(categoryId);
  const table = Array.isArray(tour?.priceTable) ? tour.priceTable : [];
  const row = table.find((r) => String(r.categoryId) === id);
  if (row && row.amount != null && Number(row.amount) > 0) return Number(row.amount);
  const pricing = tour?.pricing || tour?.raw?.pricing || [];
  const pr = pricing.find((p) => String(p.pricingCategoryId) === id);
  if (pr && Number(pr.amount) > 0) return Number(pr.amount);
  return null;
}

const api = {
  getPricingCategories,
  sortPricingCategories,
  bookablePricingCategories,
  paxCategoryLabel,
  initPaxCounts,
  paxCountsTotal,
  buildAvailabilityPax,
  paxCountsToLegacyGuests,
  unitPriceFromTour,
  resolveLivePaxCap,
  categoryPaxBounds,
  clampPaxCounts,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.AuralisPax = api;
}
