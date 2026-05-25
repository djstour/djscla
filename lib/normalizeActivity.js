/**
 * Map Bókun search/detail payloads → shape expected by bokunAdapter.toViewModel().
 * Defensive: search hits are often thinner than our mocks.
 */

const { flattenBokunCategories, deriveChipIds } = require('./chipIds');

const PHOTO_KEYS = ['aurora', 'lagoon', 'sunset', 'glacier', 'city', 'spa'];

function pickPhotoKey(id) {
  const n = Number(id) || 0;
  return PHOTO_KEYS[n % PHOTO_KEYS.length];
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function moneyAmount(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return num(value, fallback);
  if (typeof value === 'string') return num(value, fallback);
  if (typeof value === 'object') {
    if (value.amount != null) return moneyAmount(value.amount, fallback);
    if (value.value != null) return moneyAmount(value.value, fallback);
  }
  return fallback;
}

function extractItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.activities)) return payload.activities;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function imageUrl(item) {
  const photo = item.keyPhoto || item.photo || item.thumbnail || item.mainPhoto;
  if (!photo) return item.coverImageUrl || item.imageUrl || null;
  if (typeof photo === 'string') return photo;
  return photo.originalUrl || photo.url || photo.thumbnailUrl || photo.largeUrl || null;
}

function buildPhotoUrls(item) {
  const urls = [];
  const add = (u) => {
    if (u && typeof u === 'string' && !urls.includes(u)) urls.push(u);
  };
  add(imageUrl(item));
  if (Array.isArray(item.photos)) {
    item.photos.forEach((p) => {
      if (typeof p === 'string') add(p);
      else add(p.originalUrl || p.url || p.thumbnailUrl || p.largeUrl);
    });
  }
  return urls;
}

function durationMinutes(item) {
  if (item.durationMinutes) return num(item.durationMinutes);
  if (item.duration && item.duration.minutes) return num(item.duration.minutes);
  if (item.durationMinutesFromHours) return num(item.durationMinutesFromHours);
  const hours = item.durationHours || (item.duration && item.duration.hours);
  if (hours) return Math.round(num(hours) * 60);
  return 0;
}

function readCurrency(obj, fallback) {
  if (!obj || typeof obj !== 'object') return fallback;
  return obj.currency || obj.currencyCode || obj.isoCurrency || fallback;
}

function productCurrency(item) {
  return (
    item.currency
    || item.defaultCurrency
    || item.currencyCode
    || readCurrency(item.defaultPrice, null)
    || readCurrency(item.nextDefaultPrice, null)
    || readCurrency(item.fromPrice, null)
    || 'ISK'
  );
}

function buildPricing(item) {
  const base = productCurrency(item);

  if (Array.isArray(item.pricing) && item.pricing.length) {
    return item.pricing.map((row) => ({
      ...row,
      amount: moneyAmount(row.amount),
      currency: row.currency || row.currencyCode || base,
    }));
  }

  const rows = [];
  const push = (amount, currency, pricingCategoryId = 5001) => {
    if (amount == null) return;
    rows.push({
      pricingCategoryId,
      amount: num(amount),
      currency: currency || base,
    });
  };

  if (item.defaultPrice) {
    push(
      moneyAmount(item.defaultPrice.amount),
      readCurrency(item.defaultPrice, base),
      item.defaultPrice.pricingCategoryId,
    );
  }
  if (item.nextDefaultPrice) {
    push(
      moneyAmount(item.nextDefaultPrice.amount),
      readCurrency(item.nextDefaultPrice, base),
      item.nextDefaultPrice.pricingCategoryId,
    );
  }
  if (item.fromPrice) {
    const fp = item.fromPrice;
    if (typeof fp === 'object') {
      push(moneyAmount(fp.amount), readCurrency(fp, base));
    } else {
      push(fp, base);
    }
  }
  if (item.price != null && rows.length === 0) {
    push(item.price, item.currency || item.currencyCode || base);
  }

  return rows;
}

function buildPricingCategories(item) {
  if (Array.isArray(item.pricingCategories) && item.pricingCategories.length) {
    return item.pricingCategories;
  }
  return [
    { id: 5001, title: 'Adult', fullTitle: 'Adult', minAge: 16, maxAge: null, defaultCategory: true },
    { id: 5002, title: 'Child', fullTitle: 'Child', minAge: 6, maxAge: 15, defaultCategory: false },
  ];
}

function buildVendor(item) {
  let vendor = null;
  if (item.vendor && typeof item.vendor === 'object') vendor = { ...item.vendor };
  else if (item.vendorName || item.vendorId) {
    vendor = {
      id: item.vendorId || item.supplierId || 0,
      title: item.vendorName || item.supplierName || 'Supplier',
    };
  } else {
    vendor = { id: 0, title: 'Supplier' };
  }
  // Brand name from Bókun — never localized in UI (see bokunAdapter supplier).
  if (vendor.title && !vendor.titleOriginal) {
    vendor.titleOriginal = vendor.title;
  }
  return vendor;
}

function buildStops(item) {
  if (Array.isArray(item.stops) && item.stops.length) {
    return item.stops.map((s, i) => ({
      id: s.id ?? i + 1,
      title: s.title || s.name || `Stop ${i + 1}`,
      geoPoint: s.geoPoint || s.location || null,
      durationMinutes: s.durationMinutes ?? null,
    }));
  }
  const itinerary = item.itinerary || item.agendaItems;
  if (Array.isArray(itinerary)) {
    return itinerary.map((s, i) => ({
      id: s.id ?? i + 1,
      title: s.title || s.name || `Stop ${i + 1}`,
      geoPoint: s.geoPoint
        || (s.location && (s.location.latitude != null || s.location.longitude != null)
          ? { latitude: s.location.latitude, longitude: s.location.longitude }
          : null),
      durationMinutes: s.durationMinutes ?? null,
      excerpt: s.excerpt || s.body || null,
    }));
  }
  return [];
}

/**
 * Convert Bókun's "advanced" cancellation rules into a user-friendly
 * "free up to X hours before" cutoff.
 *
 * Bókun ships an ordered list of { cutoffHours, charge|percentage }. Each
 * rule means: "cancel within `cutoffHours` of start → charge X%". Rules are
 * monotonically non-decreasing in time, so the LATEST you can cancel without
 * penalty is the largest cutoffHours of any rule that still has a charge.
 *
 * Example for the South Coast tour:
 *   [{cutoff:24, charge:100}, {cutoff:8760, charge:0}]  →  free up to 24h before.
 */
function deriveCancellationCutoff(item) {
  const policy = item.cancellationPolicy;
  if (!policy || !Array.isArray(policy.penaltyRules) || policy.penaltyRules.length === 0) {
    return policy?.simpleCutoffHours || null;
  }
  const paidCutoffs = policy.penaltyRules
    .filter((r) => Number(r.charge ?? r.percentage ?? 0) > 0)
    .map((r) => Number(r.cutoffHours))
    .filter((h) => Number.isFinite(h) && h > 0)
    .sort((a, b) => b - a);
  if (paidCutoffs.length) return paidCutoffs[0];
  return policy.simpleCutoffHours || null;
}

function buildBookableExtras(item) {
  if (!Array.isArray(item.bookableExtras)) return [];
  // Pull selectionType / pricedPerPerson from the default rate's extraConfigs so
  // the UI can render OPTIONAL extras as checkboxes (and skip MANDATORY ones).
  const defaultRate = Array.isArray(item.rates) ? item.rates[0] : null;
  const extraConfigById = new Map();
  if (defaultRate && Array.isArray(defaultRate.extraConfigs)) {
    defaultRate.extraConfigs.forEach((cfg) => {
      if (cfg && cfg.activityExtraId != null) {
        extraConfigById.set(cfg.activityExtraId, cfg);
      }
    });
  }
  return item.bookableExtras.slice(0, 16).map((ex) => {
    const cfg = extraConfigById.get(ex.id) || null;
    return {
      id: ex.id,
      title: ex.title,
      information: ex.information || '',
      pricingType: ex.pricingType || null,
      pricingTypeLabel: ex.pricingTypeLabel || null,
      price: Number.isFinite(Number(ex.price)) ? Number(ex.price) : null,
      free: !!ex.free,
      included: !!ex.included,
      maxPerBooking: ex.maxPerBooking || 0,
      limitByPax: !!ex.limitByPax,
      // From rate.extraConfigs:
      selectionType: cfg ? (cfg.selectionType || null) : null,    // OPTIONAL | MANDATORY
      ratePricingType: cfg ? (cfg.pricingType || null) : null,    // INCLUDED_IN_PRICE | PRICED_SEPARATELY
      pricedPerPerson: cfg ? !!cfg.pricedPerPerson : (ex.pricingType === 'PER_PERSON'),
    };
  });
}

function buildPickupInfo(item) {
  // `item.pickupPlaces` is populated by the detail endpoint after a separate
  // /activity.json/{id}/pickup-places fetch — keep this resilient when missing
  // (e.g. list view, vendor sync, or DB cache that pre-dated the field).
  const placesRaw = Array.isArray(item.pickupPlaces) ? item.pickupPlaces : [];
  const places = placesRaw.map((p) => ({
    id: p.id,
    title: (p.title || '').trim(),
    type: p.type || 'OTHER',
    askForRoomNumber: !!p.askForRoomNumber,
    address: p.location?.address || p.address || '',
    city: p.location?.city || '',
  })).filter((p) => p.id != null && p.title);

  const defaultRate = Array.isArray(item.rates) ? item.rates[0] : null;
  const ratePickup = defaultRate ? {
    selectionType: defaultRate.pickupSelectionType || null,        // PRESELECTED | OPTIONAL | UNAVAILABLE
    pricingType: defaultRate.pickupPricingType || null,            // INCLUDED_IN_PRICE | PRICED_SEPARATELY
    pricedPerPerson: !!defaultRate.pickupPricedPerPerson,
  } : null;

  return {
    enabled: !!item.pickupService,
    customAllowed: !!item.customPickupAllowed,
    minutesBefore: Number.isFinite(Number(item.pickupMinutesBefore))
      ? Number(item.pickupMinutesBefore)
      : null,
    timeWindowMinutes: Number.isFinite(Number(item.pickupTimeWindowInMinutes))
      ? Number(item.pickupTimeWindowInMinutes)
      : null,
    noPickupMessage: (item.noPickupMsg && typeof item.noPickupMsg === 'object')
      ? null
      : (typeof item.noPickupMsg === 'string' ? item.noPickupMsg : null),
    groups: Array.isArray(item.pickupPlaceGroups) ? item.pickupPlaceGroups.length : 0,
    places,
    rate: ratePickup,
  };
}

function buildTags(item) {
  if (Array.isArray(item.tags)) return item.tags.filter(Boolean);
  const tags = [];
  if (item.bokunTags) tags.push(...item.bokunTags);
  if (item.flags) tags.push(...item.flags);
  if (item.highlight) tags.push('top_pick');
  return [...new Set(tags)].slice(0, 4);
}

/**
 * @param {object} item — raw Bókun activity (search hit or full product)
 */
function normalizeActivity(item) {
  const id = item.id ?? item.activityId ?? item.productId;
  const coverImageUrl = imageUrl(item);
  const rawCategories = item.categories || (item.category ? [item.category] : []);
  const categoryLabels = flattenBokunCategories(rawCategories);
  const categories = categoryLabels.length
    ? categoryLabels
    : rawCategories.filter((c) => typeof c === 'string');

  const base = {
    id,
    externalId: item.externalId || item.productCode || String(id),
    slug: item.slug || item.externalId || `activity-${id}`,
    title: item.title || item.name || 'Untitled activity',
    summary: item.summary || item.excerpt || item.shortDescription || '',
    description: item.description || item.fullDescription || item.summary || '',
    durationText: item.durationText || item.duration || '',
    durationMinutes: durationMinutes(item),
    bookingType: item.bookingType || 'DATE_AND_TIME',
    currency: productCurrency(item),
    defaultCurrency: productCurrency(item),
    vendor: buildVendor(item),
    pricingCategories: buildPricingCategories(item),
    pricing: buildPricing(item),
    nextDefaultPrice: item.nextDefaultPrice
      ? {
          ...item.nextDefaultPrice,
          amount: moneyAmount(item.nextDefaultPrice.amount),
          currency: readCurrency(item.nextDefaultPrice, productCurrency(item)),
        }
      : null,
    availability: {
      type: item.availability?.type || 'LIVE',
      bookableNow: item.availability?.bookableNow ?? item.bookable ?? true,
      lastChecked: item.availability?.lastChecked || new Date().toISOString(),
      nextAvailableDates: item.availability?.nextAvailableDates || [],
      capacityRemaining: item.availability?.capacityRemaining ?? null,
      warning: item.availability?.warning || null,
    },
    startTimes: item.startTimes || [],
    meetingType: item.meetingType || null,
    meetingPoint: item.meetingPoint || null,
    stops: buildStops(item),
    themes: item.themes || [],
    categories,
    categoryLabels,
    keywords: item.keywords || [],
    languages: item.languages || item.guidedLanguages || [],
    coverImageUrl,
    coverImagePlaceholder: item.coverImagePlaceholder || pickPhotoKey(id),
    photos: item.photos || [],
    photoUrls: buildPhotoUrls(item),
    averageRating: num(item.averageRating ?? item.reviewRating ?? item.rating, 0),
    reviewCount: num(item.reviewCount ?? item.reviewsCount, 0),
    cancellationCutoffMinutes: item.cancellationCutoffMinutes ?? null,
    tags: buildTags(item),
    // Rich product content (HTML strings authored by the vendor).
    includedHtml: typeof item.included === 'string' ? item.included : '',
    excludedHtml: typeof item.excluded === 'string' ? item.excluded : '',
    requirementsHtml: typeof item.requirements === 'string' ? item.requirements : '',
    attentionHtml: typeof item.attention === 'string' ? item.attention : '',
    // Structured arrays that some vendors fill in addition to the HTML blobs.
    inclusionsList: Array.isArray(item.inclusions) ? item.inclusions : [],
    exclusionsList: Array.isArray(item.exclusions) ? item.exclusions : [],
    knowBeforeYouGoItems: Array.isArray(item.knowBeforeYouGoItems) ? item.knowBeforeYouGoItems : [],
    bookableExtras: buildBookableExtras(item),
    pickupInfo: buildPickupInfo(item),
    // `passCapacity` is the per-booking pax cap surfaced in the Bókun back
    // office (e.g. 10, 92). Used by the booking panel to bound the pax dropdown.
    passCapacity: Number.isFinite(Number(item.passCapacity)) && Number(item.passCapacity) > 0
      ? Number(item.passCapacity)
      : null,
    difficultyLevel: item.difficultyLevel || null,
    minAge: Number.isFinite(Number(item.minAge)) ? Number(item.minAge) : null,
    activityAttributes: Array.isArray(item.activityAttributes) ? item.activityAttributes : [],
    cancellationFreeHours: deriveCancellationCutoff(item),
    cancellationPolicyTitle: (item.cancellationPolicy && item.cancellationPolicy.title) || null,
  };

  const { chipIds, routeIds, facetIds } = deriveChipIds(base);
  return {
    ...base,
    chipIds,
    routeIds,
    facetIds,
    chipSource: categoryLabels.length ? 'rules+detail' : 'rules',
  };
}

/**
 * @param {object} payload — raw Bókun search response
 * @param {{ page?: number, pageSize?: number }} req — request params for meta fallbacks
 */
function normalizeSearchResponse(payload, req = {}) {
  const items = extractItems(payload);
  const page = payload.page ?? payload.currentPage ?? req.page ?? 1;
  const pageSize = payload.pageSize ?? req.pageSize ?? items.length;

  let total = payload.totalCount ?? payload.total ?? payload.totalHits ?? payload.totalItems;
  if (total != null) total = Number(total);
  if (!Number.isFinite(total)) {
    if (items.length < pageSize) {
      total = (page - 1) * pageSize + items.length;
    } else {
      total = null;
    }
  }

  const hasMore = items.length >= pageSize && (total == null || page * pageSize < total);

  return {
    activities: items.map(normalizeActivity),
    meta: {
      page,
      pageSize,
      total: total ?? null,
      hasMore,
    },
  };
}

module.exports = { normalizeActivity, normalizeSearchResponse, extractItems };
