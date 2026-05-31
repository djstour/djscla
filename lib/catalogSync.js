/**
 * Catalog sync — Bókun contract catalog → Supabase mirror.
 *
 * Phase B (Vendor Scale Strategy):
 *   1. One full booking-channel search pass — discover every supplier from row
 *      vendor fields; per-vendor row counts + vendor↔activity membership.
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
const { fetchChannelCatalogForSync } = require('./catalog');
const { supabaseRestFetch, getSupabaseConfig } = require('./supabase');
const { ingestActivityOwnedImages } = require('./ownedImageSync');
const { getActivityById } = require('./bokun');
const { normalizeActivity } = require('./normalizeActivity');
const { auditActivityPayload, hasPlausiblePrice, catalogFromPriceUsd } = require('./catalogQuality');
const {
  isDisplayableCatalogPrice,
  evaluateCatalogPriceTrust,
  verifyActivityPriceDisplay,
  shouldPreserveTrustedDisplay,
} = require('./catalogPriceVerification');
const { shouldPreserveTranslationDisplay } = require('./translationVerification');
const { syncAvailabilityWindowForActivity } = require('./availabilityWindowSync');

const DETAIL_SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SYNC_MS = Number(process.env.CATALOG_SYNC_MAX_MS) || 270_000;
const EST_DETAIL_MS = Number(process.env.CATALOG_SYNC_DETAIL_MS) || 3200;

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
  return catalogFromPriceUsd(activity);
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
    // Length signatures for vendor-authored HTML so meaningful edits trigger
    // a re-write even though the full content lives in bokun_payload.
    contentLengths: {
      included: (activity.includedHtml || '').length,
      excluded: (activity.excludedHtml || '').length,
      requirements: (activity.requirementsHtml || '').length,
      attention: (activity.attentionHtml || '').length,
    },
    cancellation: {
      freeHours: activity.cancellationFreeHours,
      policyTitle: activity.cancellationPolicyTitle,
    },
    difficulty: activity.difficultyLevel,
    minAge: activity.minAge,
    extras: (activity.bookableExtras || []).map((e) => ({ id: e.id, price: e.price })),
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

/** Active catalog rows with completed v2 detail sync (matches Admin Health). */
async function fetchDetailProgress() {
  const rows = await fetchPagedRows(`/rest/v1/${ACTIVITY_TABLE}`, {
    select: 'bokun_activity_id,detail_synced_at,bokun_payload',
    is_active: 'eq.true',
  });
  let complete = 0;
  let missing = 0;
  rows.forEach((row) => {
    const audit = auditActivityPayload(row.bokun_payload || {}, {
      detailSyncedAt: row.detail_synced_at,
    });
    if (audit.missingV2Detail) missing += 1;
    else complete += 1;
  });
  return { total: rows.length, complete, missing };
}

async function fetchExistingActivityHashes() {
  const rows = await fetchPagedRows(`/rest/v1/${ACTIVITY_TABLE}`, {
    select: 'bokun_activity_id,source_hash,is_active,cover_image_owned_url,image_assets,detail_synced_at',
  });
  const map = new Map();
  rows.forEach((r) => {
    map.set(String(r.bokun_activity_id), {
      source_hash: r.source_hash || null,
      is_active: r.is_active === true,
      has_owned_images: !!(r.cover_image_owned_url || (Array.isArray(r.image_assets) && r.image_assets.length)),
      detail_synced_at: r.detail_synced_at || null,
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
    cover_image_owned_url: activity.coverImageOwnedUrl || null,
    photo_urls_owned: Array.isArray(activity.photoUrlsOwned) ? activity.photoUrlsOwned : [],
    image_assets: Array.isArray(activity.imageAssets) ? activity.imageAssets : [],
    price_from: isDisplayableCatalogPrice(activity) ? lowestPriceFrom(activity) : null,
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
    detail_synced_at: null,
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

/** PATCH is_active in chunks (PostgREST in.(…) URL limit). */
async function setActivitiesActive(bokunIds, isActive = true) {
  const ids = [...new Set(bokunIds)].filter(Boolean);
  if (!ids.length) return 0;

  const CHUNK = 80;
  let updated = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const inList = slice.join(',');
    await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { is_active: isActive },
      },
    );
    updated += slice.length;
  }

  return updated;
}

async function deactivateMissing(seenBokunIds, knownIds) {
  const stale = [...knownIds].filter((id) => !seenBokunIds.has(id));
  if (!stale.length) return 0;

  await setActivitiesActive(stale, false);
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

function pricingArrayHasUsableAmount(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.some((row) => {
    const n = Number(row && row.amount);
    return Number.isFinite(n) && n > 0;
  });
}

function moneyHasUsableAmount(money) {
  if (!money) return false;
  const n = Number(money.amount);
  return Number.isFinite(n) && n > 0;
}

/**
 * For each activity in `needsDetail`, fetch the full Bókun detail endpoint,
 * normalize it, preserve owned image URLs from the existing DB row, then PATCH
 * only `bokun_payload` + `detail_synced_at` — leaving `source_hash` untouched
 * so the next channel-list sync sees no spurious change.
 */
async function syncActivityDetails(needsDetail, {
  deadlineAt = null,
  verifyPrices = false,
} = {}) {
  if (!needsDetail.size) {
    return {
      updated: 0, errors: 0, priceWarnings: 0, pickupHostedOnly: 0, truncated: false,
    };
  }

  // Fetch existing payloads in one batch to preserve owned image URLs
  const inList = [...needsDetail].map((id) => `"${id}"`).join(',');
  const existingRows = await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})&select=bokun_activity_id,cover_image_owned_url,photo_urls_owned,image_assets,bokun_payload`,
  );
  const existingByBokunId = new Map();
  (existingRows || []).forEach((row) => {
    existingByBokunId.set(String(row.bokun_activity_id), row);
  });

  let updated = 0;
  let errors = 0;
  let priceWarnings = 0;
  let pickupHostedOnly = 0;
  let truncated = false;

  for (const bokunId of needsDetail) {
    if (deadlineAt && Date.now() >= deadlineAt) {
      truncated = true;
      break;
    }
    try {
      const rawDetail = await getActivityById(bokunId);
      const detailNorm = normalizeActivity(rawDetail);

      const existing = existingByBokunId.get(bokunId) || {};
      const existingPayload = existing.bokun_payload || {};

      // Merge strategy: detail data wins for vendor content (description,
      // included/excluded, pickup, extras, etc.). However Bókun's
      // v2 list components may omit channel "from" pricing —
      // that's only on /activity-search.json. If we blindly take detail's
      // pricing we end up writing [{ amount: 0, pricingCategoryId: 5001 }]
      // (synthesized from nextDefaultPrice=0) and TourCards show "$0".
      // Preserve search-derived pricing from the existing payload whenever
      // the detail-derived numbers are missing or zero. Owned image URLs are
      // set by ownedImageSync and are likewise not known to the detail endpoint.
      const detailPricingUsable = pricingArrayHasUsableAmount(detailNorm.pricing);
      const detailNextUsable = moneyHasUsableAmount(detailNorm.nextDefaultPrice);
      const detailPricePlausible = hasPlausiblePrice(detailNorm);
      const existingPricePlausible = hasPlausiblePrice(existingPayload);

      const mergedPayload = {
        ...detailNorm,
        pricing: (detailPricingUsable && detailPricePlausible)
          ? detailNorm.pricing
          : (existingPricePlausible && Array.isArray(existingPayload.pricing) && existingPayload.pricing.length
            ? existingPayload.pricing
            : detailNorm.pricing),
        nextDefaultPrice: (detailNextUsable && detailPricePlausible)
          ? detailNorm.nextDefaultPrice
          : (existingPricePlausible && existingPayload.nextDefaultPrice
            ? existingPayload.nextDefaultPrice
            : detailNorm.nextDefaultPrice),
        defaultCurrency: detailNorm.defaultCurrency
          || existingPayload.defaultCurrency
          || null,
        fromPrice: detailNorm.fromPrice || existingPayload.fromPrice || null,
        coverImageOwnedUrl: existingPayload.coverImageOwnedUrl || existing.cover_image_owned_url || null,
        coverImageCardUrl: existingPayload.coverImageCardUrl || null,
        coverImageHeroUrl: existingPayload.coverImageHeroUrl || null,
        coverImageGalleryUrl: existingPayload.coverImageGalleryUrl || null,
        photoUrlsOwned: existingPayload.photoUrlsOwned || existing.photo_urls_owned || [],
        imageAssets: existingPayload.imageAssets || (Array.isArray(existing.image_assets) ? existing.image_assets : []),
      };

      let payloadWithPrice = mergedPayload;
      try {
        if (verifyPrices) {
          payloadWithPrice = await verifyActivityPriceDisplay(bokunId, mergedPayload);
        } else if (shouldPreserveTrustedDisplay(mergedPayload.priceDisplay)) {
          payloadWithPrice = mergedPayload;
        } else {
          const priceDisplay = evaluateCatalogPriceTrust({ activity: mergedPayload, commissionPct: null });
          payloadWithPrice = {
            ...mergedPayload,
            priceDisplay,
            priceUnverified: !priceDisplay.trusted,
          };
        }
      } catch (priceErr) {
        console.warn('[catalogSync:price-verify]', bokunId, priceErr.message || priceErr);
      }

      const audit = auditActivityPayload(payloadWithPrice);
      if (audit.priceImplausible || audit.priceUntrusted) priceWarnings += 1;
      if (audit.pickupHostedOnly) pickupHostedOnly += 1;

      const priceFrom = isDisplayableCatalogPrice(payloadWithPrice)
        ? lowestPriceFrom(payloadWithPrice)
        : null;

      await supabaseRestFetch(
        `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${bokunId}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: {
            bokun_payload: payloadWithPrice,
            price_from: priceFrom,
            detail_synced_at: new Date().toISOString(),
          },
        },
      );
      updated += 1;

      if (process.env.AVAILABILITY_WINDOW_SYNC !== '0') {
        try {
          await syncAvailabilityWindowForActivity(bokunId, { uiLang: 'en' });
        } catch (avErr) {
          console.warn('[catalogSync:availability-window]', bokunId, avErr.message || avErr);
        }
      }

      // Avoid hammering the Bókun API — 300 ms between requests
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn('[catalogSync:detail]', bokunId, err.message || err);
      errors += 1;
    }
  }

  return {
    updated, errors, priceWarnings, pickupHostedOnly, truncated,
  };
}

/**
 * Run a full Bókun → Supabase catalog sync.
 * @param {{ uiLang?: string, deactivateMissing?: boolean, syncImages?: boolean, syncDetails?: boolean }} [options]
 */
async function syncCatalog(options = {}) {
  const {
    uiLang = 'hant',
    deactivateMissing: shouldDeactivate = true,
    syncImages = process.env.CATALOG_SYNC_IMAGES === '1',
    syncDetails = true,
    // When true, ignore detail_synced_at TTL and force a re-fetch for every
    // active activity. Use this after extending normalizeActivity so new
    // fields propagate without waiting for the next natural TTL roll-over.
    forceDetail = false,
    maxDetailPerRun = 80,
    maxSyncMs = DEFAULT_MAX_SYNC_MS,
    verifyDetailPrices = false,
    channelOnly = false,
  } = options;

  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.canWrite) {
    const err = new Error('Supabase write credentials missing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
    err.code = 'SUPABASE_CONFIG';
    throw err;
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + Math.max(60_000, maxSyncMs);

  if (channelOnly) {
    const existing = await fetchExistingActivityHashes();
    const needsDetailOrdered = [];
    existing.forEach((prior, id) => {
      if (!prior.is_active) return;
      const neverSynced = !prior.detail_synced_at;
      const stale = prior.detail_synced_at
        && (Date.now() - new Date(prior.detail_synced_at).getTime() > DETAIL_SYNC_TTL_MS);
      if (forceDetail || neverSynced || stale) {
        needsDetailOrdered.push({
          id,
          priority: neverSynced ? 0 : (stale ? 1 : 2),
        });
      }
    });
    needsDetailOrdered.sort((a, b) => a.priority - b.priority || String(a.id).localeCompare(String(b.id)));
    const totalNeedingDetail = needsDetailOrdered.length;
    const detailBudgetMs = Math.max(30_000, deadlineAt - Date.now() - 8000);
    const budgetCap = Math.max(1, Math.floor(detailBudgetMs / EST_DETAIL_MS));
    const effectiveCap = Math.min(maxDetailPerRun, budgetCap);
    const needsDetail = new Set(
      needsDetailOrdered.slice(0, effectiveCap).map((row) => row.id),
    );
    const detailResult = syncDetails
      ? await syncActivityDetails(needsDetail, { deadlineAt, verifyPrices: verifyDetailPrices })
      : { updated: 0, errors: 0, priceWarnings: 0, pickupHostedOnly: 0, truncated: false };

    const finishedAt = Date.now();
    const detailProgress = await fetchDetailProgress();
    return {
      ok: true,
      uiLang,
      mode: 'detail_only',
      detailProgress,
      counts: {
        contractTotal: 0,
        uniqueInChannel: 0,
        vendors: 0,
        upserted: 0,
        unchanged: 0,
        activated: 0,
        imageSynced: 0,
        deactivated: 0,
        componentsFetchFailed: 0,
        vendorActivityLinks: { total: 0, added: 0, removed: 0 },
        detailSynced: detailResult.updated,
        detailErrors: detailResult.errors,
        detailQueued: needsDetail.size,
        detailPending: Math.max(0, totalNeedingDetail - detailResult.updated),
        detailNeedingTotal: totalNeedingDetail,
        detailTruncated: !!detailResult.truncated,
        detailPriceWarnings: detailResult.priceWarnings || 0,
        detailPickupHosted: detailResult.pickupHostedOnly || 0,
      },
      meta: {},
      timings: {
        fetchMs: 0,
        writeMs: finishedAt - startedAt,
        totalMs: finishedAt - startedAt,
        deadlineMs: maxSyncMs,
        detailBudgetCap: effectiveCap,
      },
    };
  }

  const channel = await fetchChannelCatalogForSync({ uiLang });
  const vendorList = channel.vendors;
  const membership = channel.membership;
  const vendorContractCounts = channel.meta.vendorContractCounts;
  const vendorUniqueCounts = channel.meta.vendorUniqueCounts;
  const contractTotal = channel.meta.contractTotal
    || Object.values(vendorContractCounts).reduce((sum, n) => sum + n, 0)
    || 0;

  const allActivities = new Map();
  channel.activities.forEach((a) => {
    if (a && a.id != null) allActivities.set(String(a.id), a);
  });

  if (contractTotal > 0 && allActivities.size === 0) {
    const err = new Error(
      `Bókun returned ${contractTotal} contract products but 0 activities could be loaded. `
      + 'Check server logs for component fetch errors (often MARKETPLACE or rate limits). '
      + 'Uncheck "deactivate missing" and retry after fixing BOKUN_* env.',
    );
    err.code = 'CATALOG_FETCH_EMPTY';
    throw err;
  }

  const vendorRows = vendorList.map((vendor) => {
    const bokunVendorId = String(vendor.id);
    const sample = vendor.sample
      || channel.activities.find((a) => a.vendor && String(a.vendor.id) === bokunVendorId);
    return {
      bokun_vendor_id: bokunVendorId,
      slug: vendorSlugFromActivity(sample, vendor.title, bokunVendorId),
      name: vendorNameFromActivity(sample, vendor.title, bokunVendorId),
      contract_product_count: vendor.contractProductCount
        || vendorContractCounts[bokunVendorId]
        || 0,
      unique_product_count: vendor.uniqueProductCount
        || vendorUniqueCounts[bokunVendorId]
        || 0,
      last_synced_at: new Date().toISOString(),
      is_active: true,
    };
  });

  const fetchedAt = Date.now();

  const vendorMap = await upsertVendors(vendorRows);

  const existing = await fetchExistingActivityHashes();
  const changed = [];
  let unchanged = 0;
  const seen = new Set();
  let imageSynced = 0;

  allActivities.forEach((a, id) => {
    seen.add(id);
    const hash = computeSourceHash(a);
    const prior = existing.get(id);
    const needsOwnedImages = syncImages && (!prior || !prior.has_owned_images);
    if (prior && prior.source_hash === hash && prior.is_active && !needsOwnedImages) {
      unchanged += 1;
      return;
    }
    // Re-activate rows that were deactivated by a failed sync (e.g. empty Bókun fetch).
    if (prior && !prior.is_active && prior.source_hash === hash && !needsOwnedImages) {
      changed.push(buildActivityRow(a, vendorMap, hash));
      return;
    }
    changed.push(buildActivityRow(a, vendorMap, hash));
  });

  if (syncImages && changed.length) {
    for (const row of changed) {
      try {
        const owned = await ingestActivityOwnedImages(row.bokun_payload);
        row.cover_image_owned_url = owned.coverImageOwnedUrl || null;
        row.photo_urls_owned = owned.photoUrlsOwned || [];
        row.image_assets = owned.imageAssets || [];
        row.bokun_payload = {
          ...row.bokun_payload,
          coverImageOwnedUrl: owned.coverImageOwnedUrl || null,
          coverImageCardUrl: owned.coverImageCardUrl || null,
          coverImageHeroUrl: owned.coverImageHeroUrl || null,
          coverImageGalleryUrl: owned.coverImageGalleryUrl || null,
          photoUrlsOwned: owned.photoUrlsOwned || [],
          imageAssets: owned.imageAssets || [],
        };
        imageSynced += 1;
      } catch (err) {
        console.warn('[catalogSync:image]', row.bokun_activity_id, err.message || err);
      }
    }
  }

  const upserted = await upsertActivities(changed);

  // List upsert replaces bokun_payload wholesale — preserve detail-only fields.
  if (changed.length) {
    const preserveIds = changed.map((r) => r.bokun_activity_id).filter(Boolean);
    const inList = preserveIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
    const priorRows = await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})&select=bokun_activity_id,bokun_payload,price_from,detail_synced_at`,
    );
    const priorById = new Map();
    (priorRows || []).forEach((row) => {
      if (row && row.bokun_activity_id != null) priorById.set(String(row.bokun_activity_id), row);
    });

    for (const row of changed) {
      const prior = priorById.get(String(row.bokun_activity_id));
      const priorPayload = prior && prior.bokun_payload;
      if (!priorPayload || typeof priorPayload !== 'object') continue;

      const mergedPayload = { ...row.bokun_payload };
      let touched = false;

      if (shouldPreserveTrustedDisplay(priorPayload.priceDisplay)) {
        mergedPayload.priceDisplay = priorPayload.priceDisplay;
        mergedPayload.priceUnverified = priorPayload.priceUnverified === true;
        touched = true;
      } else if (hasPlausiblePrice(priorPayload) && !hasPlausiblePrice(mergedPayload)) {
        mergedPayload.pricing = priorPayload.pricing;
        mergedPayload.nextDefaultPrice = priorPayload.nextDefaultPrice;
        mergedPayload.fromPrice = priorPayload.fromPrice;
        touched = true;
      }

      if (shouldPreserveTranslationDisplay(priorPayload)) {
        mergedPayload.translationDisplay = priorPayload.translationDisplay;
        mergedPayload.translationUnverified = priorPayload.translationUnverified === true;
        touched = true;
      }

      if (!touched) continue;

      const priceFrom = isDisplayableCatalogPrice(mergedPayload)
        ? lowestPriceFrom(mergedPayload)
        : (prior.price_from != null ? prior.price_from : null);

      await supabaseRestFetch(
        `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${row.bokun_activity_id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: {
            bokun_payload: mergedPayload,
            ...(priceFrom != null ? { price_from: priceFrom } : {}),
            ...(prior.detail_synced_at ? { detail_synced_at: prior.detail_synced_at } : {}),
          },
        },
      );
    }
  }

  // Deactivate only rows removed from marketplace contracts — not rows whose
  // v2 component fetch failed this run (contractTotal can exceed uniqueInChannel).
  const contractChannelIds = new Set(
    (channel.meta.contractExperienceIds || []).map(String).filter(Boolean),
  );
  const channelPresenceIds = contractChannelIds.size > 0 ? contractChannelIds : seen;

  // Re-enable every DB row still listed on a contract (keeps stale payload if fetch failed).
  const reactivateIds = [...existing.keys()].filter((id) => channelPresenceIds.has(id));
  const activated = reactivateIds.length
    ? await setActivitiesActive(reactivateIds, true)
    : await setActivitiesActive([...seen], true);

  const deactivated = shouldDeactivate
    ? await deactivateMissing(channelPresenceIds, new Set(existing.keys()))
    : 0;

  const componentsFetchFailed = Number(channel.meta.componentsFetchFailed)
    || Math.max(0, contractTotal - allActivities.size);

  const activityMap = await fetchActivityIdMap();
  const contractMembership = Array.isArray(channel.meta.contractMembership)
    ? channel.meta.contractMembership
    : [];
  const membershipForLinks = contractMembership.length ? contractMembership : membership;
  const links = await syncVendorActivities(membershipForLinks, vendorMap, activityMap);

  // Detail sync: channel-list re-upserts reset detail_synced_at to null, and
  // activities that have never been detail-synced or are older than TTL are picked up.
  const changedIds = new Set(changed.map((r) => r.bokun_activity_id));
  const now = Date.now();
  const needsDetailOrdered = [];
  if (syncDetails) {
    allActivities.forEach((_, id) => {
      const prior = existing.get(id);
      const neverSynced = !prior || !prior.detail_synced_at;
      const stale = prior && prior.detail_synced_at
        && (now - new Date(prior.detail_synced_at).getTime() > DETAIL_SYNC_TTL_MS);
      const shouldSync = forceDetail || changedIds.has(id) || neverSynced || stale;
      if (!shouldSync) return;
      needsDetailOrdered.push({
        id,
        priority: neverSynced ? 0 : (stale ? 1 : (forceDetail ? 2 : 3)),
      });
    });
  }

  needsDetailOrdered.sort((a, b) => a.priority - b.priority || String(a.id).localeCompare(String(b.id)));
  const totalNeedingDetail = needsDetailOrdered.length;
  const detailBudgetMs = Math.max(30_000, deadlineAt - Date.now() - 8000);
  const budgetCap = Math.max(1, Math.floor(detailBudgetMs / EST_DETAIL_MS));
  const effectiveCap = Math.min(maxDetailPerRun, budgetCap);
  const needsDetail = new Set(
    needsDetailOrdered.slice(0, effectiveCap).map((row) => row.id),
  );

  // Cap per-run to stay within serverless time limit (Vercel maxDuration 300s).
  // Remaining activities are picked up on the next sync run (never-synced first).

  const detailResult = syncDetails
    ? await syncActivityDetails(needsDetail, { deadlineAt, verifyPrices: verifyDetailPrices })
    : {
      updated: 0, errors: 0, priceWarnings: 0, pickupHostedOnly: 0, truncated: false,
    };

  const finishedAt = Date.now();
  const detailProgress = await fetchDetailProgress();

  return {
    ok: true,
    uiLang,
    detailProgress,
    counts: {
      contractTotal,
      uniqueInChannel: allActivities.size,
      vendors: vendorList.length,
      upserted,
      unchanged,
      activated,
      imageSynced,
      deactivated,
      componentsFetchFailed,
      vendorActivityLinks: links,
      detailSynced: detailResult.updated,
      detailErrors: detailResult.errors,
      detailQueued: needsDetail.size,
      detailPending: Math.max(0, totalNeedingDetail - detailResult.updated),
      detailNeedingTotal: totalNeedingDetail,
      detailTruncated: !!detailResult.truncated,
      detailPriceWarnings: detailResult.priceWarnings || 0,
      detailPickupHosted: detailResult.pickupHostedOnly || 0,
    },
    meta: {
      vendorContractCounts,
      vendorUniqueCounts,
    },
    timings: {
      fetchMs: fetchedAt - startedAt,
      writeMs: finishedAt - fetchedAt,
      totalMs: finishedAt - startedAt,
      deadlineMs: maxSyncMs,
      detailBudgetCap: effectiveCap,
    },
  };
}

module.exports = {
  syncCatalog,
  syncActivityDetails,
  fetchDetailProgress,
  setActivitiesActive,
  computeSourceHash,
  buildActivityRow,
};
