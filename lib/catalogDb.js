/**
 * Catalog read path backed by Supabase (Phase B).
 *
 * Returns the same shape as lib/catalog.js so the /api/catalog/activities
 * handler can swap between sources via CATALOG_SOURCE=db|bokun.
 *
 * Vendor counts come from public.vendors.contract_product_count (snapshot
 * during sync) so the supplier pills keep matching the Bókun marketplace
 * summary even when an activity is sold by multiple suppliers.
 *
 * Filtering uses GIN-indexed array overlap operators (chip_ids, route_ids,
 * facet_ids) and the generated tsvector search_doc for full-text `q`.
 */

const { supabaseRestFetch } = require('./supabase');
const { applyChipCache } = require('./chipCache');
const { applyQuoteCurrencyAsync, getQuoteCurrency } = require('./bokunClient');

const ACTIVITY_TABLE = 'activities';
const VENDOR_TABLE = 'vendors';
const VENDOR_ACTIVITY_TABLE = 'vendor_activities';

function parseList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pgArrayLiteral(values) {
  if (!values.length) return null;
  const escaped = values.map((v) => `"${String(v).replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

function ftsQuery(value) {
  return String(value)
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `'${word.replace(/'/g, "''")}'`)
    .join(' & ');
}

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

async function activityIdsForVendor(internalVendorId) {
  const params = new URLSearchParams({
    select: 'bokun_activity_id',
    vendor_id: `eq.${internalVendorId}`,
  });
  const rows = await supabaseRestFetch(`/rest/v1/${VENDOR_ACTIVITY_TABLE}?${params}`);
  return (rows || []).map((r) => String(r.bokun_activity_id)).filter(Boolean);
}

async function readActivityRows(filters = {}) {
  const {
    vendorId,
    chips,
    routes,
    facets,
    q,
    limit,
    offset,
    select = 'bokun_activity_id,vendor_id,bokun_payload,is_active,last_synced_at',
    order = 'price_from.asc.nullslast',
    requireActive = true,
    featuredOnly = false,
  } = filters;

  const params = new URLSearchParams();
  params.set('select', select);
  if (requireActive) params.set('is_active', 'eq.true');
  if (featuredOnly) params.set('is_featured', 'eq.true');
  if (order) params.set('order', order);

  if (vendorId && vendorId !== 'all') {
    const internalId = await resolveInternalVendorId(vendorId);
    if (internalId == null) return [];
    const ids = await activityIdsForVendor(internalId);
    if (!ids.length) return [];
    const inList = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
    params.set('bokun_activity_id', `in.(${inList})`);
  }

  const chipLit = pgArrayLiteral(parseList(chips));
  if (chipLit) params.set('chip_ids', `ov.${chipLit}`);

  const routeLit = pgArrayLiteral(parseList(routes));
  if (routeLit) params.set('route_ids', `ov.${routeLit}`);

  const facetLit = pgArrayLiteral(parseList(facets));
  if (facetLit) params.set('facet_ids', `ov.${facetLit}`);

  if (q && String(q).trim()) {
    const fts = ftsQuery(q);
    if (fts) params.set('search_doc', `fts(simple).${fts}`);
  }

  if (Number.isFinite(limit)) params.set('limit', String(limit));
  if (Number.isFinite(offset)) params.set('offset', String(offset));

  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function rowsToActivities(rows) {
  const activities = [];
  rows.forEach((row) => {
    if (!row || !row.bokun_payload) return;
    const a = row.bokun_payload;
    if (a && a.id != null) activities.push(a);
  });
  return applyQuoteCurrencyAsync(applyChipCache(activities), getQuoteCurrency());
}

async function readVendorSummaries() {
  const params = new URLSearchParams({
    select: 'bokun_vendor_id,name,slug,hero_image_url,summary,tags,contract_product_count,unique_product_count,last_synced_at',
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
    bokunVendorId: row.bokun_vendor_id || null,
    title: row.name || `Vendor ${row.bokun_vendor_id}`,
    slug: row.slug || null,
    heroImageUrl: row.hero_image_url || null,
    summary: row.summary || null,
    tags: row.tags || [],
    contractProductCount: row.contract_product_count || 0,
    uniqueProductCount: row.unique_product_count || 0,
    lastSyncedAt: row.last_synced_at || null,
  }));
}

/**
 * Single page from Supabase (mirror of fetchCatalogPage in lib/catalog.js).
 */
async function fetchCatalogPageFromDb({
  page = 1,
  pageSize = 50,
  vendorId,
  chips,
  routes,
  facets,
  q,
} = {}) {
  const offset = (page - 1) * pageSize;
  const rows = await readActivityRows({
    vendorId, chips, routes, facets, q,
    limit: pageSize + 1,
    offset,
  });
  const hasMore = rows.length > pageSize;
  const slice = rows.slice(0, pageSize);
  const activities = await rowsToActivities(slice);

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
async function fetchAllCatalogFromDb({
  maxItems = 5000,
  vendorId,
  chips,
  routes,
  facets,
  q,
} = {}) {
  const [rows, vendorSummaries] = await Promise.all([
    readActivityRows({ vendorId, chips, routes, facets, q, limit: maxItems }),
    readVendorSummaries(),
  ]);

  const activities = await rowsToActivities(rows);
  const { vendorContractCounts, vendorUniqueCounts } = vendorCountsFromSummaries(vendorSummaries);

  const vendorKey = vendorId != null && vendorId !== '' && vendorId !== 'all'
    ? String(vendorId).trim()
    : null;

  const hasFilters = !!(parseList(chips).length || parseList(routes).length
    || parseList(facets).length || (q && String(q).trim()));

  const total = vendorKey
    ? vendorContractCounts[vendorKey] || activities.length
    : hasFilters
      ? activities.length
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
      ...(hasFilters
        ? { filters: { chips: parseList(chips), routes: parseList(routes), facets: parseList(facets), q: q || null } }
        : {}),
    },
  };
}

/**
 * Single activity by Bókun id, served from cache.
 * Returns null if the row is absent or inactive (caller can fall back to live Bókun).
 */
/**
 * Featured homepage rail — admin-curated via is_featured + featured_rank.
 */
async function fetchFeaturedActivitiesFromDb({ limit = 6 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 6, 1), 24);
  const rows = await readActivityRows({
    featuredOnly: true,
    requireActive: true,
    limit: cap,
    order: 'featured_rank.asc.nullslast,updated_at.desc',
    select: 'bokun_activity_id,vendor_id,bokun_payload,is_active,is_featured,featured_rank,last_synced_at',
  });

  const activities = await rowsToActivities(rows);
  const lastSyncedAt = rows.reduce((latest, row) => {
    if (!row.last_synced_at) return latest;
    return !latest || row.last_synced_at > latest ? row.last_synced_at : latest;
  }, null);

  return {
    activities,
    meta: {
      total: activities.length,
      limit: cap,
      source: 'db',
      lastSyncedAt,
    },
  };
}

async function fetchActivitiesByBokunIds(bokunIds, { requireActive = true } = {}) {
  const ids = [...new Set((bokunIds || []).map(String).filter(Boolean))];
  if (!ids.length) return [];

  const inList = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
  const params = new URLSearchParams({
    select: 'bokun_activity_id,vendor_id,bokun_payload,is_active,last_synced_at',
    bokun_activity_id: `in.(${inList})`,
  });
  if (requireActive) params.set('is_active', 'eq.true');

  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchActivityFromDb(bokunActivityId) {
  if (bokunActivityId == null) return null;
  const id = String(bokunActivityId);
  const params = new URLSearchParams({
    select: 'bokun_payload,is_active,last_synced_at',
    bokun_activity_id: `eq.${id}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  if (!Array.isArray(rows) || !rows[0]) return null;
  const row = rows[0];
  if (row.is_active === false) return null;
  if (!row.bokun_payload) return null;

  const [activity] = await applyQuoteCurrencyAsync(applyChipCache([row.bokun_payload]), getQuoteCurrency());
  return {
    activity,
    lastSyncedAt: row.last_synced_at || null,
  };
}

module.exports = {
  fetchCatalogPageFromDb,
  fetchAllCatalogFromDb,
  fetchFeaturedActivitiesFromDb,
  fetchActivitiesByBokunIds,
  fetchActivityFromDb,
  readActivityRows,
  rowsToActivities,
  readVendorSummaries,
  summarizeVendors,
};
