const { getActivityById, getQuoteCurrency } = require('../../lib/bokun');
const { enrichActivityCancellationPolicy } = require('../../lib/bokunCancellationPolicies');
const { enrichActivityBookableExtras } = require('../../lib/bokunExtrasV1Fallback');
const { enrichActivityTicketInfo } = require('../../lib/bokunCustomFieldsV1Fallback');
const { enrichPricingCategoriesFromV1 } = require('../../lib/bokunPricingCategoriesV1Fallback');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { fetchActivityFromDb, fetchVendorForBokunActivity } = require('../../lib/catalogDb');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');
const { isDbDetailCacheUsable } = require('../../lib/catalogQuality');
const { isDisplayableCatalogPrice, hydrateCatalogPriceDisplay } = require('../../lib/catalogPriceVerification');
const {
  isDisplayableTranslation,
  getTranslationPublicMeta,
} = require('../../lib/translationVerification');
const {
  isAdminAuthorized,
  isTranslationPreviewQuery,
} = require('../../lib/adminAuth');

const DEFAULT_FRESHNESS_MS = 6 * 60 * 60 * 1000;
const FRESHNESS_MS = Number.isFinite(Number(process.env.CATALOG_DETAIL_TTL_MS))
  && Number(process.env.CATALOG_DETAIL_TTL_MS) > 0
  ? Number(process.env.CATALOG_DETAIL_TTL_MS)
  : DEFAULT_FRESHNESS_MS;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function unwrapActivity(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.id != null || payload.activityId != null) return payload;
  if (payload.activity) return payload.activity;
  return payload;
}

function resolveSource(req) {
  const requested = (req.query.source || process.env.CATALOG_SOURCE || 'db')
    .toString()
    .toLowerCase();
  return requested === 'bokun' ? 'bokun' : 'db';
}

function isFresh(lastSyncedAt) {
  if (!lastSyncedAt) return false;
  const age = Date.now() - new Date(lastSyncedAt).getTime();
  return Number.isFinite(age) && age < FRESHNESS_MS;
}

/**
 * Reject cached payloads that pre-date the BookPanel-required fields
 * (passCapacity, pickupInfo, bookableExtras). Catalog sync hadn't started
 * persisting these until 2026-05-25, so older `bokun_payload` rows lack the
 * pricingCategory ages / pickup config / extras the booking UI needs.
 */
function hasBookingFields(activity) {
  if (!activity) return false;
  if (activity.pickupInfo === undefined) return false;
  if (activity.bookableExtras === undefined) return false;
  return true;
}

function stripUnverifiedCatalogPricing(activity) {
  if (!activity || isDisplayableCatalogPrice(activity)) return activity;
  return {
    ...activity,
    pricing: [],
    nextDefaultPrice: null,
    fromPrice: null,
    priceUnverified: true,
  };
}

function hasUsablePricing(pricing) {
  return Array.isArray(pricing)
    && pricing.some((row) => Number.isFinite(Number(row && row.amount)) && Number(row.amount) > 0);
}

function isPlaceholderVendor(v) {
  if (!v || typeof v !== 'object') return true;
  const t = String(v.titleOriginal || v.title || '').trim();
  return !t || t === 'Supplier' || /^Supplier \d+$/.test(t);
}

async function graftCatalogVendor(activity, bokunId) {
  if (!activity || !isPlaceholderVendor(activity.vendor)) return activity;
  try {
    const vendor = await fetchVendorForBokunActivity(bokunId);
    if (vendor) return { ...activity, vendor };
  } catch (err) {
    console.warn('[activity] vendor graft failed:', err.message);
  }
  return activity;
}

/** Keep admin translation trust from Supabase when detail falls back to live Bókun. */
function mergeDbTrustOverlay(activity, dbOverlay) {
  if (!activity || !dbOverlay) return activity;
  if (!dbOverlay.translationDisplay || typeof dbOverlay.translationDisplay !== 'object') {
    return activity;
  }
  return {
    ...activity,
    translationDisplay: dbOverlay.translationDisplay,
    translationUnverified: dbOverlay.translationUnverified === true,
  };
}

async function fetchFromBokun(id, uiLang) {
  const raw = unwrapActivity(await getActivityById(id, { uiLang }));
  const quoteCurrency = getQuoteCurrency();
  let activity = normalizeActivity(raw);
  activity = await graftCatalogVendor(activity, id);
  return { activity, quoteCurrency, raw };
}

/** Backfill extra prices when DB cache predates v1 extras fallback. */
async function hydrateExtrasIfNeeded(activity, bokunId) {
  if (!activity || !Array.isArray(activity.bookableExtras) || !activity.bookableExtras.length) {
    return activity;
  }
  const needsRefresh = activity.bookableExtras.some((ex) => {
    if (ex.included) return false;
    const price = Number(ex.price);
    const missingPrice = !Number.isFinite(price) || price <= 0;
    const staleFreeFlag = !!ex.free && Number.isFinite(price) && price > 0;
    return missingPrice || staleFreeFlag;
  });
  if (!needsRefresh) return activity;

  const raw = {
    id: bokunId,
    bookableExtras: activity.bookableExtras,
    rates: activity.rates || [],
  };
  await enrichActivityBookableExtras(raw);
  return { ...activity, bookableExtras: raw.bookableExtras };
}

/** Backfill ticket/voucher HTML from v1 customFields when missing on cache. */
async function hydrateTicketInfoIfNeeded(activity, bokunId) {
  if (!activity || String(activity.ticketInfoHtml || '').trim()) return activity;
  const raw = { id: bokunId, ticketInfoHtml: '' };
  await enrichActivityTicketInfo(raw);
  if (!String(raw.ticketInfoHtml || '').trim()) return activity;
  return { ...activity, ticketInfoHtml: raw.ticketInfoHtml };
}

/** Backfill cancellation when DB cache predates v1 marketplace policy fallback. */
async function hydrateCancellationIfNeeded(activity, bokunId) {
  if (!activity) return activity;
  if (String(activity.cancellationPolicyHtml || '').trim()) return activity;
  const policy = activity.cancellationPolicy;
  const policyId = (policy && policy.id != null)
    ? policy.id
    : (Array.isArray(activity.rates) && activity.rates[0] && activity.rates[0].cancellationPolicyId);
  if (policyId == null) return activity;
  if (policy && Array.isArray(policy.penaltyRules) && policy.penaltyRules.length) {
    const patch = normalizeActivity({
      cancellationPolicy: policy,
      rates: activity.rates || [{ cancellationPolicyId: policyId }],
    });
    return {
      ...activity,
      cancellationPolicy: patch.cancellationPolicy,
      cancellationPolicyTitle: patch.cancellationPolicyTitle,
      cancellationPolicyHtml: patch.cancellationPolicyHtml,
      cancellationFreeHours: patch.cancellationFreeHours,
    };
  }

  const raw = {
    id: bokunId,
    cancellationPolicy: policy || { id: policyId, title: null, penaltyRules: [] },
    rates: activity.rates || [{ cancellationPolicyId: policyId }],
  };
  await enrichActivityCancellationPolicy(raw);
  const patch = normalizeActivity(raw);
  return {
    ...activity,
    cancellationPolicy: patch.cancellationPolicy,
    cancellationPolicyTitle: patch.cancellationPolicyTitle,
    cancellationPolicyHtml: patch.cancellationPolicyHtml,
    cancellationFreeHours: patch.cancellationFreeHours,
  };
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Missing activity id', code: 'MISSING_ID' });
  }

  const uiLang = req.query.lang || 'hant';
  const source = resolveSource(req);

  let activity = null;
  let usedSource = 'bokun';
  let lastSyncedAt = null;
  let dbTrustOverlay = null;

  if (source === 'db') {
    try {
      const cached = await fetchActivityFromDb(id);
      if (cached && cached.activity) {
        dbTrustOverlay = {
          translationDisplay: cached.activity.translationDisplay,
          translationUnverified: cached.activity.translationUnverified,
        };
        if (
          isFresh(cached.lastSyncedAt)
          && isDbDetailCacheUsable(cached.activity)
        ) {
          activity = cached.activity;
          usedSource = 'db';
          lastSyncedAt = cached.lastSyncedAt;
        }
      }
    } catch (dbErr) {
      console.warn('[Auralis] activity DB read failed, falling back to Bókun:', dbErr.message);
    }
  }

  try {
    let quoteCurrency = getQuoteCurrency();
    let rawUpstream = null;
    if (!activity) {
      const fresh = await fetchFromBokun(id, uiLang);
      activity = fresh.activity;
      quoteCurrency = fresh.quoteCurrency;
      rawUpstream = fresh.raw;
      usedSource = 'bokun';
      activity = mergeDbTrustOverlay(activity, dbTrustOverlay);
    }

    if (activity) {
      activity = hydrateCatalogPriceDisplay(activity);
      activity = stripUnverifiedCatalogPricing(activity);
    }

    if (req.query.debug === 'extras' && rawUpstream) {
      return res.status(200).json({
        debug: 'extras full',
        bookableExtras: rawUpstream.bookableExtras,
        rates: rawUpstream.rates,
        pricingCategories: rawUpstream.pricingCategories,
        passCapacity: rawUpstream.passCapacity,
      });
    }

    if (req.query.debug === 'quickfacts' && rawUpstream) {
      const pick = (k) => rawUpstream[k];
      return res.status(200).json({
        debug: 'quickfacts raw',
        sample: {
          productCategory: pick('productCategory'),
          activityCategories: pick('activityCategories'),
          activityType: pick('activityType'),
          categories: pick('categories'),
          keywords: pick('keywords'),
          tagGroups: pick('tagGroups'),
          activityAttributes: pick('activityAttributes'),
          difficultyLevel: pick('difficultyLevel'),
          durationText: pick('durationText'),
          minAge: pick('minAge'),
          bookingType: pick('bookingType'),
          bookingCutoff: pick('bookingCutoff'),
          bookingCutoffMinutes: pick('bookingCutoffMinutes'),
          bookingCutoffHours: pick('bookingCutoffHours'),
          bookingCutoffDays: pick('bookingCutoffDays'),
          bookingCutoffWeeks: pick('bookingCutoffWeeks'),
          cutoffType: pick('cutoffType'),
          languages: pick('languages'),
          guidanceTypes: pick('guidanceTypes'),
          meetingType: pick('meetingType'),
          knowBeforeYouGoItems: pick('knowBeforeYouGoItems'),
          passCapacity: pick('passCapacity'),
        },
      });
    }

    if (req.query.debug === 'raw' && rawUpstream) {
      const keys = Object.keys(rawUpstream).sort();
      const sizes = {};
      keys.forEach((k) => {
        const v = rawUpstream[k];
        sizes[k] = Array.isArray(v) ? `array(${v.length})` : (v && typeof v === 'object' ? `object(${Object.keys(v).length})` : typeof v);
      });
      return res.status(200).json({
        debug: 'raw upstream keys',
        keys,
        sizes,
        sample: {
          included: rawUpstream.included,
          excluded: rawUpstream.excluded,
          inclusions: rawUpstream.inclusions,
          exclusions: rawUpstream.exclusions,
          requirements: rawUpstream.requirements,
          attention: rawUpstream.attention,
          pickupPlaceGroups: rawUpstream.pickupPlaceGroups,
          pickupTimeByLocations: rawUpstream.pickupTimeByLocations,
          pickupService: rawUpstream.pickupService,
          pickupMinutesBefore: rawUpstream.pickupMinutesBefore,
          customPickupAllowed: rawUpstream.customPickupAllowed,
          noPickupMsg: rawUpstream.noPickupMsg,
          bookableExtras: rawUpstream.bookableExtras,
          difficultyLevel: rawUpstream.difficultyLevel,
          minAge: rawUpstream.minAge,
          knowBeforeYouGoItems: rawUpstream.knowBeforeYouGoItems,
          agendaItems: rawUpstream.agendaItems,
          cancellationPolicy: rawUpstream.cancellationPolicy,
          startPoints: rawUpstream.startPoints,
          startTimes: rawUpstream.startTimes,
          route: rawUpstream.route,
          rates: rawUpstream.rates,
          activityAttributes: rawUpstream.activityAttributes,
        },
      });
    }

    if (activity) {
      activity = await hydrateCancellationIfNeeded(activity, id);
      activity = await hydrateExtrasIfNeeded(activity, id);
      activity = await hydrateTicketInfoIfNeeded(activity, id);
      activity = await enrichPricingCategoriesFromV1(activity);
      activity = await graftCatalogVendor(activity, id);
    }

    const translations = await loadTranslationsForActivities([activity]);
    const overlay = translations[String(activity.id)] || null;
    const previewRequested = isTranslationPreviewQuery(req);
    const translationPreview = previewRequested && isAdminAuthorized(req);

    if (previewRequested && !isAdminAuthorized(req)) {
      return res.status(401).json({
        error: 'Admin authentication required for translation preview.',
        code: 'ADMIN_UNAUTHORIZED',
      });
    }

    if ((uiLang === 'hant' || uiLang === 'hans')
      && !translationPreview
      && !isDisplayableTranslation(activity, uiLang, overlay)) {
      return res.status(404).json({
        error: 'This tour is not yet available in the selected language.',
        code: 'TRANSLATION_NOT_VERIFIED',
      });
    }

    res.setHeader(
      'Cache-Control',
      usedSource === 'db'
        ? 'public, s-maxage=600, stale-while-revalidate=1800'
        : 'public, s-maxage=300, stale-while-revalidate=600',
    );

    return res.status(200).json({
      source: usedSource,
      activity,
      translations,
      meta: {
        quoteCurrency,
        translationPreview,
        translationTrusted: uiLang === 'en' || isDisplayableTranslation(activity, uiLang, overlay),
        ...getTranslationPublicMeta(),
        ...(usedSource === 'db' ? { lastSyncedAt } : {}),
      },
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    const hints = [];
    if (status === 401) {
      hints.push('Check Vercel env: BOKUN_ACCESS_KEY + BOKUN_SECRET_KEY (production keys → https://api.bokun.io).');
    }
    return res.status(status).json({
      error: err.message,
      code: err.code || 'BOKUN_ERROR',
      hints,
    });
  }
};
