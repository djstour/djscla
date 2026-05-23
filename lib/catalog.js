/**
 * Catalog fetch — paginated Bókun search with optional full channel sync.
 * Used by /api/catalog/activities (stable contract for UI + ops).
 */

const { searchActivities, applyQuoteCurrency, getQuoteCurrency } = require('./bokun');
const { normalizeSearchResponse } = require('./normalizeActivity');

const MAX_PAGE_SIZE = 100;
const DEFAULT_ALL_CAP = 2000;

function filterByVendorId(activities, vendorId) {
  if (vendorId == null || vendorId === '' || vendorId === 'all') return activities;
  const vid = String(vendorId);
  return activities.filter((a) => a.vendor && String(a.vendor.id) === vid);
}

/**
 * Single Bókun search page → normalized activities + meta.
 */
async function fetchCatalogPage({ uiLang, page = 1, pageSize = 50, vendorId } = {}) {
  const ps = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const raw = await searchActivities({ uiLang, page, pageSize: ps });
  const quoteCurrency = getQuoteCurrency();
  let { activities, meta } = normalizeSearchResponse(raw, { page, pageSize: ps });
  activities = applyQuoteCurrency(activities, quoteCurrency);
  activities = filterByVendorId(activities, vendorId);

  if (vendorId && vendorId !== 'all') {
    meta = { ...meta, vendorId: String(vendorId), filteredCount: activities.length };
  }

  return { activities, meta: { ...meta, quoteCurrency } };
}

/**
 * Walk Bókun pages until empty, hasMore false, or maxItems reached.
 * For ops / small channels only — not for 100k SKU scale.
 */
async function fetchAllCatalogPages({ uiLang, pageSize = 100, maxItems = DEFAULT_ALL_CAP, vendorId } = {}) {
  const ps = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const cap = Math.max(1, maxItems);
  const merged = [];
  let page = 1;
  let lastMeta = { page: 1, pageSize: ps, total: null, hasMore: false };

  while (merged.length < cap) {
    const raw = await searchActivities({ uiLang, page, pageSize: ps });
    const quoteCurrency = getQuoteCurrency();
    let { activities, meta } = normalizeSearchResponse(raw, { page, pageSize: ps });
    activities = applyQuoteCurrency(activities, quoteCurrency);

    if (!activities.length) break;

    merged.push(...activities);
    lastMeta = meta;

    if (!meta.hasMore || activities.length < ps) break;
    page += 1;
  }

  let activities = merged.slice(0, cap);
  activities = filterByVendorId(activities, vendorId);

  const total = vendorId && vendorId !== 'all'
    ? activities.length
    : (lastMeta.total != null ? lastMeta.total : merged.length);

  return {
    activities,
    meta: {
      page: 1,
      pageSize: activities.length,
      total,
      hasMore: merged.length >= cap && lastMeta.hasMore,
      fetchedPages: page,
      quoteCurrency: lastMeta.quoteCurrency || getQuoteCurrency(),
      ...(vendorId && vendorId !== 'all' ? { vendorId: String(vendorId) } : {}),
    },
  };
}

module.exports = {
  fetchCatalogPage,
  fetchAllCatalogPages,
  filterByVendorId,
  MAX_PAGE_SIZE,
  DEFAULT_ALL_CAP,
};
