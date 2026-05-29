/**
 * Catalog discovery via REST v2 Marketplace contracts + experience components.
 * Replaces v1 POST /activity.json/search.
 */

const {
  getSupplierContractIds,
  getContractById,
  getMarketplaceVendor,
  getExperienceComponents,
} = require('./bokunV2');
const { componentsToActivity } = require('./v2ExperienceToActivity');
const { normalizeActivity } = require('./normalizeActivity');
const { applyQuoteCurrency, getQuoteCurrency } = require('./bokunClient');

const DEFAULT_CONCURRENCY = Number(process.env.BOKUN_V2_CATALOG_CONCURRENCY) || 10;
const DEFAULT_CONTRACT_STATUS = 'ACCEPTED';
const DISCOVERY_CACHE_MS = Number(process.env.BOKUN_V2_DISCOVERY_CACHE_MS) || 5 * 60 * 1000;

/** List / catalog cards — avoid componentType=ALL (very slow per product). */
const LIST_COMPONENT_TYPES = [
  'ID',
  'TITLE',
  'SHORT_DESCRIPTION',
  'PHOTOS',
  'PRICING',
  'PRICING_CATEGORIES',
  'RATES',
  'DURATION',
  'BOOKING_TYPE',
  'CATEGORIES',
  'MARKETPLACE',
];

let discoveryCache = { at: 0, entries: null };

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
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function resolveVendor(supplierId, cache) {
  const key = String(supplierId);
  if (cache.has(key)) return cache.get(key);
  let vendor;
  try {
    const mv = await getMarketplaceVendor(supplierId);
    vendor = {
      id: supplierId,
      title: mv.title || mv.name || `Supplier ${supplierId}`,
      titleOriginal: mv.title || mv.name || `Supplier ${supplierId}`,
    };
  } catch {
    vendor = { id: supplierId, title: `Supplier ${supplierId}`, titleOriginal: `Supplier ${supplierId}` };
  }
  cache.set(key, vendor);
  return vendor;
}

/**
 * Discover sellable experience IDs from accepted marketplace supplier contracts.
 */
async function discoverContractProducts({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && discoveryCache.entries && now - discoveryCache.at < DISCOVERY_CACHE_MS) {
    return discoveryCache.entries;
  }

  const status = process.env.BOKUN_V2_CONTRACT_STATUS || DEFAULT_CONTRACT_STATUS;
  const contractIds = await getSupplierContractIds({ status });
  const vendorCache = new Map();
  const byId = new Map();

  const contracts = await mapPool(
    contractIds || [],
    Math.min(DEFAULT_CONCURRENCY, 8),
    async (contractId) => {
      try {
        return await getContractById(contractId);
      } catch (err) {
        console.warn('[bokunV2Catalog] contract', contractId, err.message);
        return null;
      }
    },
  );

  for (const contract of contracts) {
    if (!contract || !Array.isArray(contract.products) || !contract.products.length) continue;
    const supplierId = contract.supplierId;
    const vendor = await resolveVendor(supplierId, vendorCache);
    contract.products.forEach((experienceId) => {
      byId.set(String(experienceId), {
        experienceId,
        supplierId,
        contractId: contract.id,
        vendor,
      });
    });
  }

  const extra = (process.env.BOKUN_V2_EXTRA_EXPERIENCE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  extra.forEach((id) => {
    if (!byId.has(id)) {
      byId.set(id, {
        experienceId: Number(id) || id,
        supplierId: null,
        contractId: null,
        vendor: { id: 0, title: 'Channel', titleOriginal: 'Channel' },
      });
    }
  });

  const entries = [...byId.values()];
  discoveryCache = { at: now, entries };
  return entries;
}

async function fetchExperienceNormalized(entry, { componentTypes = LIST_COMPONENT_TYPES } = {}) {
  const components = await getExperienceComponents(entry.experienceId, componentTypes);
  const raw = componentsToActivity(components, {
    experienceId: entry.experienceId,
    vendor: entry.vendor,
  });
  return normalizeActivity(raw);
}

function filterEntriesByVendor(entries, vendorId) {
  if (vendorId == null || vendorId === '' || vendorId === 'all') return entries;
  return entries.filter((e) => e.vendor && String(e.vendor.id) === String(vendorId));
}

async function fetchEntriesNormalized(entries, { concurrency, componentTypes, label } = {}) {
  const started = Date.now();
  const slice = entries;
  const normalizedList = await mapPool(
    slice,
    concurrency || DEFAULT_CONCURRENCY,
    (entry) => fetchExperienceNormalized(entry, { componentTypes }).catch((err) => {
      console.warn(`[bokunV2Catalog] ${label || 'experience'}`, entry.experienceId, err.message);
      return null;
    }),
  );
  return {
    activities: normalizedList.filter(Boolean),
    fetchMs: Date.now() - started,
    requested: slice.length,
  };
}

function buildChannelMeta({ activities, entries, membership, vendors, extra }) {
  return {
    page: 1,
    pageSize: activities.length,
    total: activities.length,
    uniqueInChannel: activities.length,
    contractProductCount: entries.length,
    vendorContractCounts: extra.vendorContractCounts,
    vendorUniqueCounts: extra.vendorUniqueCounts,
    catalogFetchComplete: true,
    hasMore: extra.hasMore,
    fetchedPages: 1,
    quoteCurrency: getQuoteCurrency(),
    apiVersion: 'v2',
    contractsScanned: extra.contractsScanned,
    componentProfile: extra.componentProfile,
    catalogFetchMs: extra.catalogFetchMs,
    hint: extra.hint,
  };
}

function tallyVendors(activities) {
  const membership = [];
  const vendorStats = new Map();

  activities.forEach((a) => {
    const v = a.vendor;
    const vendorKey = v && v.id != null ? String(v.id).trim() : '0';
    membership.push({ bokunVendorId: vendorKey, bokunActivityId: String(a.id) });
    if (!vendorStats.has(vendorKey)) {
      vendorStats.set(vendorKey, {
        id: v.id,
        title: v.titleOriginal || v.title,
        contractCount: 0,
        uniqueIds: new Set(),
      });
    }
    const st = vendorStats.get(vendorKey);
    st.contractCount += 1;
    st.uniqueIds.add(String(a.id));
  });

  const vendorContractCounts = Object.create(null);
  const vendorUniqueCounts = Object.create(null);
  const vendors = [...vendorStats.values()].map((st) => {
    const k = String(st.id);
    vendorContractCounts[k] = st.contractCount;
    vendorUniqueCounts[k] = st.uniqueIds.size;
    return {
      id: st.id,
      title: st.title,
      contractProductCount: st.contractCount,
      uniqueProductCount: st.uniqueIds.size,
    };
  });

  return { membership, vendors, vendorContractCounts, vendorUniqueCounts };
}

/**
 * Full channel catalog for sync / ?all=true — uses lightweight list components.
 */
async function fetchChannelCatalogForSync({
  maxItems = 2000,
  concurrency = DEFAULT_CONCURRENCY,
  componentTypes = LIST_COMPONENT_TYPES,
} = {}) {
  const discoverStarted = Date.now();
  const allEntries = await discoverContractProducts();
  const contractsScanned = new Set(allEntries.map((e) => e.contractId).filter(Boolean)).size;
  const slice = allEntries.slice(0, maxItems);
  const { activities: normalized, fetchMs } = await fetchEntriesNormalized(slice, {
    concurrency,
    componentTypes,
    label: 'sync',
  });
  const activities = applyQuoteCurrency(normalized, getQuoteCurrency());
  const { membership, vendors, vendorContractCounts, vendorUniqueCounts } = tallyVendors(activities);

  const catalogFetchMs = Date.now() - discoverStarted;
  const estPerProduct = slice.length ? Math.round(fetchMs / slice.length) : 0;

  return {
    activities,
    membership,
    vendors,
    meta: buildChannelMeta({
      activities,
      entries: slice,
      membership,
      vendors,
      extra: {
        vendorContractCounts,
        vendorUniqueCounts,
        hasMore: allEntries.length > maxItems,
        contractsScanned,
        componentProfile: 'list',
        catalogFetchMs,
        hint: slice.length > 80
          ? `Fetched ${slice.length} products (~${estPerProduct}ms each). Prefer source=db after catalog sync, or use ?all=false&pageSize=24 for faster loads.`
          : undefined,
      },
    }),
  };
}

/**
 * Single page — only fetches components for products on this page (not the whole channel).
 */
async function fetchCatalogPage({ page = 1, pageSize = 50, vendorId } = {}) {
  const ps = Math.min(Math.max(pageSize, 1), 100);
  const p = Math.max(page, 1);
  const allEntries = await discoverContractProducts();
  const filtered = filterEntriesByVendor(allEntries, vendorId);
  const start = (p - 1) * ps;
  const pageEntries = filtered.slice(start, start + ps);

  const { activities: normalized, fetchMs } = await fetchEntriesNormalized(pageEntries, {
    label: `page-${p}`,
  });
  const activities = applyQuoteCurrency(normalized, getQuoteCurrency());

  return {
    activities,
    meta: {
      page: p,
      pageSize: activities.length,
      total: filtered.length,
      hasMore: start + ps < filtered.length,
      quoteCurrency: getQuoteCurrency(),
      apiVersion: 'v2',
      componentProfile: 'list',
      catalogFetchMs: fetchMs,
      productsOnPage: pageEntries.length,
    },
  };
}

module.exports = {
  LIST_COMPONENT_TYPES,
  discoverContractProducts,
  fetchExperienceNormalized,
  fetchChannelCatalogForSync,
  fetchCatalogPage,
};
