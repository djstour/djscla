const { getActivityById, getQuoteCurrency } = require('../../lib/bokun');
const { enrichActivityCancellationPolicy } = require('../../lib/bokunCancellationPolicies');
const { enrichActivityBookableExtras } = require('../../lib/bokunExtrasV1Fallback');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { fetchActivityFromDb, fetchVendorForBokunActivity } = require('../../lib/catalogDb');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');
const {
  hasPlausiblePrice,
  isDbDetailCacheUsable,
} = require('../../lib/catalogQuality');

const DEFAULT_FRESHNESS_MS = 6 * 60 * 60 * 1000;
const FRESHNESS_MS = Number.isFinite(Number(process.env.CATALOG_DETAIL_TTL_MS))
  && Number(process.env.CATALOG_DETAIL_TTL_MS) > 0
  ? Number(process.env.CATALOG_DETAIL_TTL_MS)
  : DEFAULT_FRESHNESS_MS;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  if (source === 'db') {
    try {
      const cached = await fetchActivityFromDb(id);
      if (
        cached
        && cached.activity
        && isFresh(cached.lastSyncedAt)
        && isDbDetailCacheUsable(cached.activity)
      ) {
        activity = cached.activity;
        usedSource = 'db';
        lastSyncedAt = cached.lastSyncedAt;
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
    }

    // v2 components may lack list pricing — graft from DB cache when needed.
    // If the live response lacks a
    // usable price, graft it from the DB-cached pricing[] / nextDefaultPrice
    // so the booking sidebar shows a real number instead of "Price loading".
    if (activity && !hasPlausiblePrice(activity)) {
      try {
        const cached = await fetchActivityFromDb(id);
        if (cached && cached.activity && hasPlausiblePrice(cached.activity)) {
          activity = {
            ...activity,
            pricing: hasUsablePricing(cached.activity.pricing) ? cached.activity.pricing : activity.pricing,
            nextDefaultPrice: cached.activity.nextDefaultPrice || activity.nextDefaultPrice,
            defaultCurrency: cached.activity.defaultCurrency || activity.defaultCurrency,
          };
        }
      } catch (priceErr) {
        console.warn('[Auralis] price hydration failed:', priceErr.message);
      }
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
      activity = await graftCatalogVendor(activity, id);
    }

    const translations = await loadTranslationsForActivities([activity]);

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
