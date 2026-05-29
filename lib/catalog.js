/**
 * Catalog fetch — paginated Bókun search with optional full channel sync.
 * Used by /api/catalog/activities (stable contract for UI + ops).
 *
 * Supplier pill counts use Bókun contract product totals (merged search rows per
 * vendor), not deduped unique ids — matches Marketplace → Contract summary.
 */

const { applyQuoteCurrency, getQuoteCurrency } = require('./bokunClient');
const {
  fetchCatalogPage: fetchV2CatalogPage,
  fetchChannelCatalogForSync: fetchV2ChannelCatalog,
} = require('./bokunV2Catalog');
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
 * Single catalog page (v2 marketplace contracts + experience components).
 */
async function fetchCatalogPage({ uiLang, page = 1, pageSize = 50, vendorId } = {}) {
  void uiLang;
  const { activities, meta } = await fetchV2CatalogPage({ page, pageSize, vendorId });
  let out = applyChipCache(activities);
  if (vendorId && vendorId !== 'all') {
    return {
      activities: out,
      meta: { ...meta, vendorId: String(vendorId), filteredCount: out.length },
    };
  }
  return { activities: out, meta };
}

/**
 * All pages for one vendor — contract row count = merged.length (matches Bókun contract summary).
 */
async function fetchAllCatalogPages({ uiLang, pageSize = 100, maxItems = DEFAULT_ALL_CAP, vendorId } = {}) {
  void uiLang;
  void pageSize;
  const channel = await fetchV2ChannelCatalog({ maxItems });
  let merged = channel.activities;
  if (vendorId != null && vendorId !== '' && vendorId !== 'all') {
    merged = filterByVendorId(merged, vendorId);
  }
  const lastMeta = channel.meta;
  const fetchedPages = 1;

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
  void uiLang;
  void pageSize;
  const channel = await fetchV2ChannelCatalog({ maxItems });
  const activities = applyChipCache(channel.activities);
  const contractTotal = channel.meta.contractProductCount
    || Object.values(channel.meta.vendorContractCounts || {}).reduce((sum, n) => sum + n, 0);

  return {
    activities,
    membership: channel.membership,
    vendors: channel.vendors,
    meta: {
      ...channel.meta,
      contractTotal,
      channelSearchTotal: activities.length,
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
