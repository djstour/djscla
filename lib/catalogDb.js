/**
 * Catalog read path backed by Supabase (Phase B).
 *
 * Returns the same shape as lib/catalog.js so the /api/catalog/activities
 * handler can swap between sources via CATALOG_SOURCE=db|bokun.
 *
 * Vendor counts come from public.vendors.contract_product_count (snapshot
 * during sync) so the supplier pills keep matching the Bókun marketplace
 * summary even when an activity is sold by multiple suppliers.
 */

const { supabaseRestFetch } = require('./supabase');
const { applyChipCache } = require('./chipCache');
const { applyQuoteCurrency, getQuoteCurrency } = require('./bokun');

const ACTIVITY_TABLE = 'activities';
const VENDOR_TABLE = 'vendors';
const VENDOR_ACTIVITY_TABLE = 'vendor_activities';

async function resolveInternalVendorId(bokunVendorId) {
  const params = new URLSearchParams({
    select: 'id',
    bokun_vendor_id: `eq.${String(bokunVendorId)}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/${VENDOR_TABLE}?${params}`);
  if (Array.isArray(rows) && rows[0]) return rows[0].id;
  return null;
}

/** bokun_activity_id list for a vendor via the M:N link table. */
async function activityIdsForVendor(internalVendorId) {
  const params = new URLSearchParams({
    select: 'bokun_activity_id',
    vendor_id: `eq.${internalVendorId}`,
  });
  const rows = await supabaseRestFetch(`/rest/v1/${VENDOR_ACTIVITY_TABLE}?${params}`);
  return (rows || []).map((r) => String(r.bokun_activity_id)).filter(Boolean);
}

async function readActivityRows({ vendorId, limit, offset } = {}) {
  const params = new URLSearchParams();
  params.set('select', 'bokun_activity_id,vendor_id,bokun_payload,is_active,last_synced_at');
  params.set('is_active', 'eq.true');
  params.set('order', 'price_from.asc.nullslast');

  if (vendorId && vendorId !== 'all') {
    const internalId = await resolveInternalVendorId(vendorId);
    if (internalId == null) return [];
    const ids = await activityIdsForVendor(internalId);
    if (!ids.length) return [];
    const inList = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
    params.set('bokun_activity_id', `in.(${inList})`);
  }

  if (Number.isFinite(limit)) params.set('limit', String(limit));
  if (Number.isFinite(offset)) params.set('offset', String(offset));

  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

function rowsToActivities(rows) {
  const activities = [];
  rows.forEach((row) => {
    if (!row || !row.bokun_payload) return;
    const a = row.bokun_payload;
    if (a && a.id != null) activities.push(a);
  });
  return applyQuoteCurrency(applyChipCache(activities), getQuoteCurrency());
}

async function readVendorSummaries() {
  const params = new URLSearchParams({
    select: 'bokun_vendor_id,name,contract_product_count,unique_product_count,last_synced_at',
    is_active: 'eq.true',
    order: 'contract_product_count.desc',
  });
  const rows = await supabaseRestFetch(`/rest/v1/${VENDOR_TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

function vendorCountsFromSummaries(summaries) {
  const counts = Object.create(null);
  const uniques = Object.create(null);
  summaries.forEach((row) => {
    if (!row || row.bokun_vendor_id == null) return;
    counts[String(row.bokun_vendor_id)] = row.contract_product_count || 0;
    uniques[String(row.bokun_vendor_id)] = row.unique_product_count || 0;
  });
  return { vendorContractCounts: counts, vendorUniqueCounts: uniques };
}

function summarizeVendors(summaries) {
  return summaries.map((row) => ({
    id: row.bokun_vendor_id ? Number(row.bokun_vendor_id) : null,
    title: row.name || `Vendor ${row.bokun_vendor_id}`,
    contractProductCount: row.contract_product_count || 0,
    uniqueProductCount: row.unique_product_count || 0,
    lastSyncedAt: row.last_synced_at || null,
  }));
}

/**
 * Single page from Supabase (mirror of fetchCatalogPage in lib/catalog.js).
 */
async function fetchCatalogPageFromDb({ page = 1, pageSize = 50, vendorId } = {}) {
  const offset = (page - 1) * pageSize;
  const rows = await readActivityRows({ vendorId, limit: pageSize + 1, offset });
  const hasMore = rows.length > pageSize;
  const slice = rows.slice(0, pageSize);
  const activities = rowsToActivities(slice);

  return {
    activities,
    meta: {
      page,
      pageSize: activities.length,
      total: null,
      hasMore,
      quoteCurrency: getQuoteCurrency(),
      source: 'db',
      ...(vendorId && vendorId !== 'all'
        ? { vendorId: String(vendorId), filteredCount: activities.length }
        : {}),
    },
  };
}

/**
 * Full channel sync via DB (mirror of fetchChannelContractCatalog in lib/catalog.js).
 */
async function fetchAllCatalogFromDb({ maxItems = 5000, vendorId } = {}) {
  const [rows, vendorSummaries] = await Promise.all([
    readActivityRows({ vendorId, limit: maxItems }),
    readVendorSummaries(),
  ]);

  const activities = rowsToActivities(rows);
  const { vendorContractCounts, vendorUniqueCounts } = vendorCountsFromSummaries(vendorSummaries);

  const vendorKey = vendorId != null && vendorId !== '' && vendorId !== 'all'
    ? String(vendorId).trim()
    : null;

  const total = vendorKey
    ? vendorContractCounts[vendorKey] || activities.length
    : Object.values(vendorContractCounts).reduce((sum, n) => sum + n, 0)
      || activities.length;

  const lastSyncedAt = vendorSummaries.reduce((latest, row) => {
    if (!row.last_synced_at) return latest;
    return !latest || row.last_synced_at > latest ? row.last_synced_at : latest;
  }, null);

  return {
    activities,
    meta: {
      page: 1,
      pageSize: activities.length,
      total,
      uniqueInChannel: activities.length,
      contractProductCount: total,
      vendorContractCounts,
      vendorUniqueCounts,
      vendors: summarizeVendors(vendorSummaries),
      catalogFetchComplete: true,
      hasMore: false,
      quoteCurrency: getQuoteCurrency(),
      source: 'db',
      lastSyncedAt,
      ...(vendorKey ? { vendorId: vendorKey } : {}),
    },
  };
}

module.exports = {
  fetchCatalogPageFromDb,
  fetchAllCatalogFromDb,
};
