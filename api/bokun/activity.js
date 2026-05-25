const { getActivityById, getQuoteCurrency, applyQuoteCurrency, bokunRequest } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { fetchActivityFromDb } = require('../../lib/catalogDb');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');

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
  const requested = (req.query.source || process.env.CATALOG_SOURCE || 'bokun')
    .toString()
    .toLowerCase();
  return requested === 'db' ? 'db' : 'bokun';
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

function hasUsablePrice(activity) {
  if (!activity) return false;
  if (hasUsablePricing(activity.pricing)) return true;
  const next = activity.nextDefaultPrice;
  if (next && Number.isFinite(Number(next.amount)) && Number(next.amount) > 0) return true;
  return false;
}

async function fetchPickupPlaces(id) {
  try {
    const r = await bokunRequest({ method: 'GET', path: `/activity.json/${id}/pickup-places` });
    if (r && Array.isArray(r.pickupPlaces)) return r.pickupPlaces;
    if (Array.isArray(r)) return r;
    return [];
  } catch (err) {
    console.warn(`[Auralis] pickup-places fetch failed for ${id}:`, err.message);
    return [];
  }
}

async function fetchFromBokun(id, uiLang) {
  const [rawPayload, pickupPlaces] = await Promise.all([
    getActivityById(id, { uiLang }),
    fetchPickupPlaces(id),
  ]);
  const raw = unwrapActivity(rawPayload);
  if (raw && typeof raw === 'object' && pickupPlaces.length) {
    raw.pickupPlaces = pickupPlaces;
  }
  const quoteCurrency = getQuoteCurrency();
  const [activity] = applyQuoteCurrency([normalizeActivity(raw)], quoteCurrency);
  return { activity, quoteCurrency, raw };
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
        && hasBookingFields(cached.activity)
      ) {
        activity = cached.activity;
        usedSource = 'db';
        lastSyncedAt = cached.lastSyncedAt;
        // Pickup-places aren't part of the search.json firehose that catalog
        // sync uses, so hydrate them on demand here. Cheap (~150ms) and stable.
        const needsPickup = activity.pickupInfo
          && activity.pickupInfo.enabled
          && (!Array.isArray(activity.pickupInfo.places) || activity.pickupInfo.places.length === 0);
        if (needsPickup) {
          const places = await fetchPickupPlaces(id);
          if (places.length) {
            const next = places.map((p) => ({
              id: p.id,
              title: (p.title || '').trim(),
              type: p.type || 'OTHER',
              askForRoomNumber: !!p.askForRoomNumber,
              address: p.location?.address || p.address || '',
              city: p.location?.city || '',
            })).filter((p) => p.id != null && p.title);
            activity = {
              ...activity,
              pickupInfo: { ...activity.pickupInfo, places: next },
            };
          }
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
    }

    // /activity.json/{id} doesn't include the "from" price (Bókun only ships
    // it via the search.json catalog firehose). If the live response lacks a
    // usable price, graft it from the DB-cached pricing[] / nextDefaultPrice
    // so the booking sidebar shows a real number instead of "Price loading".
    if (activity && !hasUsablePrice(activity)) {
      try {
        const cached = await fetchActivityFromDb(id);
        if (cached && cached.activity && hasUsablePrice(cached.activity)) {
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

    if (req.query.debug === 'pickup') {
      const candidates = [
        `/activity.json/${id}/pickup-places`,
        `/activity.json/${id}/pickupPlaces`,
        `/pickup-place.json/activity/${id}`,
        `/pickup-place.json/activity-id/${id}`,
        `/booking-channel.json/activity/${id}/pickup-places`,
      ];
      const results = {};
      for (const p of candidates) {
        try {
          const r = await bokunRequest({ method: 'GET', path: p });
          results[p] = { ok: true, shape: Array.isArray(r) ? `array(${r.length})` : (r && typeof r === 'object' ? Object.keys(r).slice(0, 12) : typeof r), sample: Array.isArray(r) ? r.slice(0, 2) : r };
        } catch (e) {
          results[p] = { ok: false, error: e.message, status: e.status };
        }
      }
      return res.status(200).json({ debug: 'pickup endpoint scan', results });
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
