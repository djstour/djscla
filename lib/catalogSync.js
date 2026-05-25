/**
 * Catalog sync — Bókun contract catalog → Supabase mirror.
 *
 * Phase B (Vendor Scale Strategy):
 *   1. Loop the contract vendor list and pull each vendor's full page set so
 *      we can preserve per-vendor contract counts (which include Bókun search-
 *      row duplicates) AND vendor↔activity membership.
 *   2. Diff each row against public.activities.source_hash → only upsert what
 *      changed; persist the full normalized activity in bokun_payload jsonb.
 *   3. Snapshot vendors.contract_product_count / unique_product_count so the
 *      supplier pills keep matching the Bókun marketplace summary (e.g.
 *      Arctic 123, Adventure Vikings 18, total 141).
 *   4. Maintain public.vendor_activities (M:N) so an activity stocked by two
 *      suppliers shows up under both pills.
 *   5. Mark unseen rows is_active=false so deleted contract products disappear.
 */

const crypto = require('crypto');
const { fetchAllCatalogPages, getContractVendorList } = require('./catalog');
const { supabaseRestFetch, getSupabaseConfig } = require('./supabase');

const VENDOR_TABLE = 'vendors';
const ACTIVITY_TABLE = 'activities';
const VENDOR_ACTIVITY_TABLE = 'vendor_activities';

function slugify(input, fallback) {
  const base = String(input || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function vendorSlugFromActivity(activity, fallbackTitle, bokunVendorId) {
  const v = (activity && activity.vendor) || {};
  if (v.slug) return slugify(v.slug, `vendor-${bokunVendorId}`);
  return slugify(
    v.titleOriginal || v.title || fallbackTitle || `vendor-${bokunVendorId}`,
    `vendor-${bokunVendorId}`,
  );
}

function vendorNameFromActivity(activity, fallbackTitle, bokunVendorId) {
  const v = (activity && activity.vendor) || {};
  return v.titleOriginal || v.title || fallbackTitle || `Supplier ${bokunVendorId}`;
}

/**
 * Bókun externalId/slug is unique per vendor, not globally — two suppliers
 * can share "PSS1". Always suffix with the Bókun activity id so the row is
 * unique by construction across the channel.
 */
function ensureActivitySlug(activity) {
  const id = String(activity.id);
  const base = activity.slug || activity.externalId || activity.title || 'activity';
  const human = slugify(base, 'activity');
  return `${human}-${id}`.slice(0, 120);
}

function lowestPriceFrom(activity) {
  const rows = Array.isArray(activity.pricing) ? activity.pricing : [];
  let lowest = null;
  rows.forEach((r) => {
    const amount = Number(r && r.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (lowest == null || amount < lowest) lowest = amount;
  });
  if (lowest != null) return lowest;
  if (activity.nextDefaultPrice && Number.isFinite(Number(activity.nextDefaultPrice.amount))) {
    return Number(activity.nextDefaultPrice.amount);
  }
  return null;
}

/** Stable hash of the fields that drive list/detail rendering. */
function computeSourceHash(activity) {
  const subset = {
    id: activity.id,
    title: activity.title,
    summary: activity.summary,
    coverImageUrl: activity.coverImageUrl,
    durationMinutes: activity.durationMinutes,
    bookingType: activity.bookingType,
    currency: activity.currency,
    vendorId: activity.vendor && activity.vendor.id,
    pricing: (activity.pricing || []).map((p) => ({
      pricingCategoryId: p.pricingCategoryId,
      amount: Number(p.amount) || 0,
      currency: p.currency,
    })),
    chipIds: [...(activity.chipIds || [])].sort(),
    routeIds: [...(activity.routeIds || [])].sort(),
    facetIds: [...(activity.facetIds || [])].sort(),
    categoryLabels: [...(activity.categoryLabels || [])].sort(),
    tags: [...(activity.tags || [])].sort(),
  };
  return crypto.createHash('md5').update(JSON.stringify(subset)).digest('hex');
}

async function fetchPagedRows(path, baseParams, pageSize = 500) {
  const all = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams(baseParams);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const rows = await supabaseRestFetch(`${path}?${params}`);
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

async function upsertVendors(vendorRows) {
  if (!vendorRows.length) return new Map();

  const data = await supabaseRestFetch(
    `/rest/v1/${VENDOR_TABLE}?on_conflict=bokun_vendor_id`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: vendorRows,
    },
  );

  const map = new Map();
  (data || []).forEach((row) => {
    if (row && row.bokun_vendor_id != null) {
      map.set(String(row.bokun_vendor_id), row.id);
    }
  });
  return map;
}

async function fetchExistingActivityHashes() {
  const rows = await fetchPagedRows(`/rest/v1/${ACTIVITY_TABLE}`, {
    select: 'bokun_activity_id,source_hash,is_active',
  });
  const map = new Map();
  rows.forEach((r) => {
    map.set(String(r.bokun_activity_id), {
      source_hash: r.source_hash || null,
      is_active: r.is_active !== false,
    });
  });
  return map;
}

async function fetchActivityIdMap() {
  const rows = await fetchPagedRows(`/rest/v1/${ACTIVITY_TABLE}`, {
    select: 'id,bokun_activity_id',
  });
  const map = new Map();
  rows.forEach((r) => {
    if (r && r.bokun_activity_id != null) {
      map.set(String(r.bokun_activity_id), r.id);
    }
  });
  return map;
}

function buildActivityRow(activity, primaryVendorMap, hash) {
  const vendorBokunId = activity.vendor && activity.vendor.id != null
    ? String(activity.vendor.id) : null;
  const vendor_id = vendorBokunId ? primaryVendorMap.get(vendorBokunId) || null : null;

  return {
    bokun_activity_id: String(activity.id),
    vendor_id,
    slug: ensureActivitySlug(activity),
    title_en: activity.title || `Activity ${activity.id}`,
    summary_en: activity.summary || null,
    description_en: activity.description || null,
    cover_image_url: activity.coverImageUrl || null,
    price_from: lowestPriceFrom(activity),
    currency: activity.currency || 'USD',
    duration_minutes: activity.durationMinutes || null,
    booking_type: activity.bookingType || 'DATE_AND_TIME',
    categories: activity.categories || [],
    category_labels: activity.categoryLabels || [],
    tags: activity.tags || [],
    chip_ids: activity.chipIds || [],
    route_ids: activity.routeIds || [],
    facet_ids: activity.facetIds || [],
    source_hash: hash,
    bokun_payload: activity,
    is_active: true,
    last_synced_at: new Date().toISOString(),
  };
}

async function upsertActivities(rows) {
  if (!rows.length) return 0;

  const CHUNK = 100;
  let written = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?on_conflict=bokun_activity_id`,
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: slice,
      },
    );
    written += slice.length;
  }

  return written;
}

async function deactivateMissing(seenBokunIds, knownIds) {
  const stale = [...knownIds].filter((id) => !seenBokunIds.has(id));
  if (!stale.length) return 0;

  const inList = stale.map((id) => `"${id}"`).join(',');
  await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { is_active: false },
    },
  );
  return stale.length;
}

/**
 * Sync the M:N vendor↔activity link table:
 *   - membership: target rows from this run, in {bokunVendorId, bokunActivityId}
 *   - vendorMap:  bokun_vendor_id  → internal vendors.id
 *   - activityMap: bokun_activity_id → internal activities.id
 * Implementation reads existing pairs once, computes the delta, then issues
 * batched inserts + targeted deletes (≤ a few hundred rows for now).
 */
async function syncVendorActivities(membership, vendorMap, activityMap) {
  const target = new Map();
  membership.forEach((m) => {
    const v = vendorMap.get(m.bokunVendorId);
    const a = activityMap.get(m.bokunActivityId);
    if (v == null || a == null) return;
    const key = `${v}:${a}`;
    if (target.has(key)) return;
    target.set(key, {
      vendor_id: v,
      activity_id: a,
      bokun_vendor_id: m.bokunVendorId,
      bokun_activity_id: m.bokunActivityId,
    });
  });

  const existingRows = await fetchPagedRows(`/rest/v1/${VENDOR_ACTIVITY_TABLE}`, {
    select: 'vendor_id,activity_id',
  });
  const existing = new Set();
  existingRows.forEach((r) => existing.add(`${r.vendor_id}:${r.activity_id}`));

  const toInsert = [];
  target.forEach((row, key) => {
    if (!existing.has(key)) toInsert.push(row);
  });

  const toDelete = [];
  existing.forEach((key) => {
    if (!target.has(key)) toDelete.push(key);
  });

  if (toInsert.length) {
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      await supabaseRestFetch(`/rest/v1/${VENDOR_ACTIVITY_TABLE}`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: toInsert.slice(i, i + CHUNK),
      });
    }
  }

  for (const key of toDelete) {
    const [vid, aid] = key.split(':');
    await supabaseRestFetch(
      `/rest/v1/${VENDOR_ACTIVITY_TABLE}?vendor_id=eq.${vid}&activity_id=eq.${aid}`,
      { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
    );
  }

  return {
    total: target.size,
    added: toInsert.length,
    removed: toDelete.length,
  };
}

/**
 * Run a full Bókun → Supabase catalog sync.
 * @param {{ uiLang?: string, deactivateMissing?: boolean }} [options]
 */
async function syncCatalog(options = {}) {
  const { uiLang = 'hant', deactivateMissing: shouldDeactivate = true } = options;

  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.canWrite) {
    const err = new Error('Supabase write credentials missing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
    err.code = 'SUPABASE_CONFIG';
    throw err;
  }

  const startedAt = Date.now();
  const vendorList = getContractVendorList();
  const allActivities = new Map();
  const membership = [];
  const vendorRows = [];
  const vendorContractCounts = Object.create(null);
  const vendorUniqueCounts = Object.create(null);

  for (const vendor of vendorList) {
    const bokunVendorId = String(vendor.id);
    const { activities: vActivities, meta: vMeta } = await fetchAllCatalogPages({
      uiLang,
      vendorId: vendor.id,
    });
    const contractCount = vMeta.contractProductCount || vActivities.length;
    const uniqueCount = vActivities.length;
    vendorContractCounts[bokunVendorId] = contractCount;
    vendorUniqueCounts[bokunVendorId] = uniqueCount;

    const sample = vActivities[0];
    vendorRows.push({
      bokun_vendor_id: bokunVendorId,
      slug: vendorSlugFromActivity(sample, vendor.title, bokunVendorId),
      name: vendorNameFromActivity(sample, vendor.title, bokunVendorId),
      contract_product_count: contractCount,
      unique_product_count: uniqueCount,
      last_synced_at: new Date().toISOString(),
      is_active: true,
    });

    vActivities.forEach((a) => {
      if (!a || a.id == null) return;
      const id = String(a.id);
      if (!allActivities.has(id)) allActivities.set(id, a);
      membership.push({ bokunVendorId, bokunActivityId: id });
    });
  }

  const fetchedAt = Date.now();

  const vendorMap = await upsertVendors(vendorRows);

  const existing = await fetchExistingActivityHashes();
  const changed = [];
  let unchanged = 0;
  const seen = new Set();

  allActivities.forEach((a, id) => {
    seen.add(id);
    const hash = computeSourceHash(a);
    const prior = existing.get(id);
    if (prior && prior.source_hash === hash && prior.is_active) {
      unchanged += 1;
      return;
    }
    changed.push(buildActivityRow(a, vendorMap, hash));
  });

  const upserted = await upsertActivities(changed);
  const deactivated = shouldDeactivate
    ? await deactivateMissing(seen, new Set(existing.keys()))
    : 0;

  const activityMap = await fetchActivityIdMap();
  const links = await syncVendorActivities(membership, vendorMap, activityMap);

  const finishedAt = Date.now();
  const contractTotal = Object.values(vendorContractCounts).reduce((sum, n) => sum + n, 0);

  return {
    ok: true,
    uiLang,
    counts: {
      contractTotal,
      uniqueInChannel: allActivities.size,
      vendors: vendorList.length,
      upserted,
      unchanged,
      deactivated,
      vendorActivityLinks: links,
    },
    meta: {
      vendorContractCounts,
      vendorUniqueCounts,
    },
    timings: {
      fetchMs: fetchedAt - startedAt,
      writeMs: finishedAt - fetchedAt,
      totalMs: finishedAt - startedAt,
    },
  };
}

module.exports = {
  syncCatalog,
  computeSourceHash,
  buildActivityRow,
};
