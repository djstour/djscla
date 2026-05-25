/**
 * Catalog read path backed by Supabase (Phase B).
 *
 * Returns the same shape as lib/catalog.js so the /api/catalog/activities
 * handler can swap between sources via CATALOG_SOURCE=db|bokun.
 *
 * Performance notes:
 * - List read is a single PostgREST query against public.activities (≤ a few KB
 *   per row from bokun_payload).
 * - Filtering and pagination is handled by Postgres, not Bókun, so even at
 *   thousands of products the response stays inside ~200 ms.
 */

const { supabaseRestFetch } = require('./supabase');
const { applyChipCache } = require('./chipCache');
const { applyQuoteCurrency, getQuoteCurrency } = require('./bokun');

const ACTIVITY_TABLE = 'activities';

function arrayLiteral(values) {
  const safe = (values || []).map((v) => `"${String(v).replace(/"/g, '\\"')}"`);
  return `{${safe.join(',')}}`;
}

function vendorContractCountsFromRows(rows) {
  const counts = Object.create(null);
  rows.forEach((row) => {
    const v = row && row.bokun_payload && row.bokun_payload.vendor;
    if (!v || v.id == null) return;
    const key = String(v.id);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

async function resolveInternalVendorId(bokunVendorId) {
  const params = new URLSearchParams({
    select: 'id',
    bokun_vendor_id: `eq.${String(bokunVendorId)}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/vendors?${params}`);
  if (Array.isArray(rows) && rows[0]) return rows[0].id;
  return null;
}

async function readActivityRows({ vendorId, limit, offset } = {}) {
  const params = new URLSearchParams();
  params.set('select', 'bokun_activity_id,vendor_id,bokun_payload,is_active,last_synced_at');
  params.set('is_active', 'eq.true');
  params.set('order', 'price_from.asc.nullslast');

  if (vendorId && vendorId !== 'all') {
    const internalId = await resolveInternalVendorId(vendorId);
    if (internalId == null) return [];
    params.set('vendor_id', `eq.${internalId}`);
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
 * Skips Bókun entirely — vendor counts come from cached rows.
 */
async function fetchAllCatalogFromDb({ maxItems = 5000, vendorId } = {}) {
  const rows = await readActivityRows({ vendorId, limit: maxItems });
  const activities = rowsToActivities(rows);

  const vendorContractCounts = vendorContractCountsFromRows(rows);
  const total = Object.values(vendorContractCounts).reduce((sum, n) => sum + n, 0)
    || activities.length;

  const lastSyncedAt = rows.reduce((latest, row) => {
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
      vendorUniqueCounts: vendorContractCounts,
      catalogFetchComplete: true,
      hasMore: false,
      quoteCurrency: getQuoteCurrency(),
      source: 'db',
      lastSyncedAt,
      ...(vendorId && vendorId !== 'all' ? { vendorId: String(vendorId) } : {}),
    },
  };
}

module.exports = {
  fetchCatalogPageFromDb,
  fetchAllCatalogFromDb,
};
