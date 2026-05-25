/**
 * Catalog sync — Bókun contract catalog → Supabase mirror.
 *
 * Phase B (Vendor Scale Strategy):
 *   1. Pull every contract product via the existing fetchChannelContractCatalog().
 *   2. Diff each row against public.activities.source_hash → only upsert what changed.
 *   3. Persist the full normalized activity in bokun_payload jsonb so list reads
 *      can serve the exact same shape as the live Bókun bridge.
 *   4. Mark unseen rows is_active=false so deleted contract products disappear.
 *
 * Surfaces a single async syncCatalog() helper for both the cron endpoint and
 * any future ad-hoc /api/catalog/sync calls.
 */

const crypto = require('crypto');
const { fetchChannelContractCatalog } = require('./catalog');
const { supabaseRestFetch, getSupabaseConfig } = require('./supabase');

const VENDOR_TABLE = 'vendors';
const ACTIVITY_TABLE = 'activities';

function slugify(input, fallback) {
  const base = String(input || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function ensureVendorSlug(activity) {
  const v = activity.vendor || {};
  if (v.slug) return slugify(v.slug, `vendor-${v.id}`);
  return slugify(v.titleOriginal || v.title || `vendor-${v.id}`, `vendor-${v.id}`);
}

function ensureActivitySlug(activity) {
  if (activity.slug) return slugify(activity.slug, `activity-${activity.id}`);
  if (activity.externalId) return slugify(activity.externalId, `activity-${activity.id}`);
  return slugify(activity.title, `activity-${activity.id}`);
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

function uniqueVendors(activities) {
  const map = new Map();
  activities.forEach((a) => {
    const v = a.vendor;
    if (!v || v.id == null) return;
    const key = String(v.id);
    if (!map.has(key)) {
      map.set(key, {
        bokun_vendor_id: key,
        slug: ensureVendorSlug(a),
        name: v.titleOriginal || v.title || `Supplier ${key}`,
      });
    }
  });
  return [...map.values()];
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

async function upsertVendors(vendors) {
  if (!vendors.length) return new Map();

  const data = await supabaseRestFetch(
    `/rest/v1/${VENDOR_TABLE}?on_conflict=bokun_vendor_id`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: vendors.map((v) => ({ ...v, is_active: true })),
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

function buildActivityRow(activity, vendorMap, hash) {
  const vendorBokunId = activity.vendor && activity.vendor.id != null ? String(activity.vendor.id) : null;
  const vendor_id = vendorBokunId ? vendorMap.get(vendorBokunId) || null : null;

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
  const { activities, meta } = await fetchChannelContractCatalog({ uiLang });
  const fetchedAt = Date.now();

  const vendorList = uniqueVendors(activities);
  const vendorMap = await upsertVendors(vendorList);

  const existing = await fetchExistingActivityHashes();
  const changed = [];
  let unchanged = 0;
  const seen = new Set();

  activities.forEach((a) => {
    const id = String(a.id);
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

  const finishedAt = Date.now();

  return {
    ok: true,
    uiLang,
    counts: {
      contractTotal: meta.contractProductCount,
      uniqueInChannel: activities.length,
      vendors: vendorList.length,
      upserted,
      unchanged,
      deactivated,
    },
    meta: {
      vendorContractCounts: meta.vendorContractCounts,
      vendors: meta.vendors,
      quoteCurrency: meta.quoteCurrency,
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
  uniqueVendors,
};
