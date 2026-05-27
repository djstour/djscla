/**
 * Catalog fetch — paginated Bókun search with optional full channel sync.
 * Used by /api/catalog/activities (stable contract for UI + ops).
 *
 * Supplier pill counts use Bókun contract product totals (merged search rows per
 * vendor), not deduped unique ids — matches Marketplace → Contract summary.
 */

const { searchActivities, applyQuoteCurrency, getQuoteCurrency } = require('./bokun');
const { normalizeSearchResponse } = require('./normalizeActivity');
const { applyChipCache } = require('./chipCache');

const MAX_PAGE_SIZE = 100;
const DEFAULT_ALL_CAP = 2000;

/** Marketplace contract vendors (extend when new contracts are added). */
const DEFAULT_CONTRACT_VENDORS = [
  { id: 85, title: 'Arctic Adventures' },
  { id: 394, title: 'Adventure Vikings' },
];

/** Bókun pagination can return the same activity id twice — keep last row for display. */
function dedupeActivitiesById(activities) {
  const by = new Map();
  (activities || []).forEach((a) => {
    if (a && a.id != null) by.set(String(a.id), a);
  });
  return [...by.values()];
}

function matchesVendorId(activity, vendorId) {
  if (vendorId == null || vendorId === '' || vendorId === 'all') return true;
  const v = activity && activity.vendor;
  return v && v.id != null && String(v.id).trim() === String(vendorId).trim();
}

function filterByVendorId(activities, vendorId) {
  if (vendorId == null || vendorId === '' || vendorId === 'all') return activities;
  return (activities || []).filter((a) => matchesVendorId(a, vendorId));
}

/** Unique activity count per vendor.id (after dedupe) — diagnostic only. */
function buildVendorUniqueCounts(activities) {
  const counts = Object.create(null);
  (activities || []).forEach((a) => {
    const v = a.vendor;
    if (!v || v.id == null) return;
    const key = String(v.id).trim();
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function getContractVendorList() {
  try {
    const path = require('path');
    const fs = require('fs');
    const file = path.join(__dirname, '..', 'data', 'bokunVendors.json');
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(parsed.vendors) && parsed.vendors.length) {
        return parsed.vendors.map((v) => ({
          id: v.id,
          title: v.title || String(v.id),
        }));
      }
    }
  } catch {
    /* use defaults */
  }
  return DEFAULT_CONTRACT_VENDORS;
}

/**
 * Paginate Bókun search; optionally keep only rows for one vendor (post-filter per page).
 * @returns {{ merged: object[], lastMeta: object, fetchedPages: number }}
 */
async function paginateBokunSearch({ uiLang, pageSize, maxItems, vendorId } = {}) {
  const ps = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const cap = Math.max(1, maxItems);
  const merged = [];
  let page = 1;
  let lastMeta = { page: 1, pageSize: ps, total: null, hasMore: false };

  while (merged.length < cap) {
    const raw = await searchActivities({ uiLang, page, pageSize: ps });
    const quoteCurrency = getQuoteCurrency();
    let { activities: pageItems, meta } = normalizeSearchResponse(raw, { page, pageSize: ps });
    pageItems = applyQuoteCurrency(pageItems, quoteCurrency);

    const channelPageSize = pageItems.length;
    if (!channelPageSize) {
      if (!meta.hasMore) break;
      page += 1;
      continue;
    }

    let rows = pageItems;
    if (vendorId != null && vendorId !== '' && vendorId !== 'all') {
      rows = filterByVendorId(pageItems, vendorId);
    }

    merged.push(...rows);
    lastMeta = meta;

    // Use full channel page size for hasMore — not filtered row count (vendor filter
    // can yield << pageSize rows and must not stop pagination early).
    if (!meta.hasMore || channelPageSize < ps) break;
    page += 1;
  }

  return { merged: merged.slice(0, cap), lastMeta, fetchedPages: page };
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
  activities = applyChipCache(activities);

  if (vendorId && vendorId !== 'all') {
    meta = { ...meta, vendorId: String(vendorId), filteredCount: activities.length };
  }

  return { activities, meta: { ...meta, quoteCurrency } };
}

/**
 * All pages for one vendor — contract row count = merged.length (matches Bókun contract summary).
 */
async function fetchAllCatalogPages({ uiLang, pageSize = 100, maxItems = DEFAULT_ALL_CAP, vendorId } = {}) {
  const { merged, lastMeta, fetchedPages } = await paginateBokunSearch({
    uiLang,
    pageSize,
    maxItems,
    vendorId,
  });

  const contractProductCount = merged.length;
  const deduped = dedupeActivitiesById(merged);
  let activities = applyChipCache(deduped);

  const vendorKey = vendorId != null && vendorId !== '' && vendorId !== 'all'
    ? String(vendorId).trim()
    : null;

  const vendorContractCounts = vendorKey
    ? { [vendorKey]: contractProductCount }
    : buildVendorUniqueCounts(activities);

  const uniqueInChannel = activities.length;
  const bokunReportedTotal = lastMeta.total != null ? lastMeta.total : contractProductCount;
  const total = vendorKey
    ? contractProductCount
    : bokunReportedTotal;

  return {
    activities,
    meta: {
      page: 1,
      pageSize: uniqueInChannel,
      total,
      uniqueInChannel,
      contractProductCount,
      mergedRows: contractProductCount,
      duplicateRowsRemoved: Math.max(0, contractProductCount - uniqueInChannel),
      vendorContractCounts,
      vendorUniqueCounts: vendorKey ? { [vendorKey]: uniqueInChannel } : buildVendorUniqueCounts(activities),
      catalogFetchComplete: true,
      hasMore: merged.length >= maxItems && lastMeta.hasMore,
      fetchedPages,
      quoteCurrency: lastMeta.quoteCurrency || getQuoteCurrency(),
      ...(vendorKey ? { vendorId: vendorKey } : {}),
    },
  };
}

/**
 * Derive supplier list + M:N membership from one merged channel search pass.
 * Row counts per vendor = channel search rows (may include duplicate activity ids).
 */
function buildChannelSnapshotFromMerged(merged) {
  const vendorStats = new Map();
  const membership = [];
  const allById = new Map();

  (merged || []).forEach((a) => {
    if (!a || a.id == null) return;
    const id = String(a.id);
    const v = a.vendor;
    const vendorKey = v && v.id != null ? String(v.id).trim() : null;

    if (vendorKey) {
      if (!vendorStats.has(vendorKey)) {
        vendorStats.set(vendorKey, {
          id: v.id,
          title: v.titleOriginal || v.title || `Supplier ${vendorKey}`,
          contractCount: 0,
          uniqueIds: new Set(),
          sample: a,
        });
      }
      const st = vendorStats.get(vendorKey);
      st.contractCount += 1;
      st.uniqueIds.add(id);
      const label = v.titleOriginal || v.title;
      if (label) st.title = label;
      membership.push({ bokunVendorId: vendorKey, bokunActivityId: id });
    }

    allById.set(id, a);
  });

  const vendorList = [...vendorStats.values()]
    .map((st) => ({
      id: st.id,
      title: st.title,
      contractProductCount: st.contractCount,
      uniqueProductCount: st.uniqueIds.size,
      sample: st.sample,
    }))
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  const vendorContractCounts = Object.create(null);
  const vendorUniqueCounts = Object.create(null);
  vendorList.forEach((v) => {
    const k = String(v.id);
    vendorContractCounts[k] = v.contractProductCount;
    vendorUniqueCounts[k] = v.uniqueProductCount;
  });

  return {
    vendorList,
    membership,
    allById,
    vendorContractCounts,
    vendorUniqueCounts,
    mergedRowCount: (merged || []).length,
  };
}

/**
 * Full booking channel — one paginated search discovers all suppliers on the channel.
 * Used by catalog sync and `?all=true` live Bókun fallback.
 */
async function fetchChannelCatalogForSync({ uiLang, pageSize = 100, maxItems = DEFAULT_ALL_CAP } = {}) {
  const { merged, lastMeta, fetchedPages } = await paginateBokunSearch({
    uiLang,
    pageSize,
    maxItems,
  });
  const snap = buildChannelSnapshotFromMerged(merged);
  const activities = applyChipCache([...snap.allById.values()]);
  const contractTotal = Object.values(snap.vendorContractCounts).reduce((sum, n) => sum + n, 0);

  return {
    activities,
    membership: snap.membership,
    vendors: snap.vendorList,
    meta: {
      page: 1,
      pageSize: activities.length,
      total: lastMeta.total != null ? lastMeta.total : snap.mergedRowCount,
      uniqueInChannel: activities.length,
      contractProductCount: snap.mergedRowCount,
      contractTotal,
      mergedRows: snap.mergedRowCount,
      duplicateRowsRemoved: Math.max(0, snap.mergedRowCount - activities.length),
      vendorContractCounts: snap.vendorContractCounts,
      vendorUniqueCounts: snap.vendorUniqueCounts,
      catalogFetchComplete: true,
      hasMore: snap.mergedRowCount >= maxItems && lastMeta.hasMore,
      fetchedPages,
      quoteCurrency: getQuoteCurrency(),
      channelSearchTotal: lastMeta.total,
    },
  };
}

/** @deprecated name kept for callers — now wraps channel-wide discovery. */
async function fetchChannelContractCatalog({ uiLang, pageSize = 100, maxItems = DEFAULT_ALL_CAP } = {}) {
  const channel = await fetchChannelCatalogForSync({ uiLang, pageSize, maxItems });
  const contractTotal = channel.meta.contractTotal
    || Object.values(channel.meta.vendorContractCounts).reduce((sum, n) => sum + n, 0);

  return {
    activities: channel.activities,
    meta: {
      ...channel.meta,
      total: contractTotal,
      vendors: channel.vendors.map((v) => ({
        id: v.id,
        title: v.title,
        contractProductCount: v.contractProductCount,
        uniqueProductCount: v.uniqueProductCount,
        bokunSearchTotal: channel.meta.channelSearchTotal,
      })),
    },
  };
}

module.exports = {
  fetchCatalogPage,
  fetchAllCatalogPages,
  fetchChannelCatalogForSync,
  fetchChannelContractCatalog,
  buildChannelSnapshotFromMerged,
  filterByVendorId,
  dedupeActivitiesById,
  buildVendorUniqueCounts,
  getContractVendorList,
  MAX_PAGE_SIZE,
  DEFAULT_ALL_CAP,
};
