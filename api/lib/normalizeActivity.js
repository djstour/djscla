/**
 * Map Bókun search/detail payloads → shape expected by bokunAdapter.toViewModel().
 * Defensive: search hits are often thinner than our mocks.
 */

const PHOTO_KEYS = ['aurora', 'lagoon', 'sunset', 'glacier', 'city', 'spa'];

function pickPhotoKey(id) {
  const n = Number(id) || 0;
  return PHOTO_KEYS[n % PHOTO_KEYS.length];
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function durationMinutes(item) {
  if (item.durationMinutes) return num(item.durationMinutes);
  if (item.duration && item.duration.minutes) return num(item.duration.minutes);
  if (item.durationMinutesFromHours) return num(item.durationMinutesFromHours);
  const hours = item.durationHours || (item.duration && item.duration.hours);
  if (hours) return Math.round(num(hours) * 60);
  return 0;
}

function buildPricing(item) {
  if (Array.isArray(item.pricing) && item.pricing.length) return item.pricing;

  const rows = [];
  const push = (amount, currency, pricingCategoryId = 5001) => {
    if (amount == null) return;
    rows.push({ pricingCategoryId, amount: num(amount), currency: currency || item.currency || 'ISK' });
  };

  if (item.defaultPrice) {
    push(item.defaultPrice.amount, item.defaultPrice.currency, item.defaultPrice.pricingCategoryId);
  }
  if (item.nextDefaultPrice) {
    push(item.nextDefaultPrice.amount, item.nextDefaultPrice.currency, item.nextDefaultPrice.pricingCategoryId);
  }
  if (item.fromPrice) {
    push(item.fromPrice.amount ?? item.fromPrice, item.fromPrice.currency ?? item.currency);
  }
  if (item.price != null && rows.length === 0) {
    push(item.price, item.currency);
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
  if (item.vendor && typeof item.vendor === 'object') return item.vendor;
  if (item.vendorName || item.vendorId) {
    return {
      id: item.vendorId || item.supplierId || 0,
      title: item.vendorName || item.supplierName || 'Supplier',
    };
  }
  return { id: 0, title: 'Supplier' };
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
      geoPoint: s.geoPoint || null,
      durationMinutes: s.durationMinutes ?? null,
    }));
  }
  return [];
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

  return {
    id,
    externalId: item.externalId || item.productCode || String(id),
    slug: item.slug || item.externalId || `activity-${id}`,
    title: item.title || item.name || 'Untitled activity',
    summary: item.summary || item.excerpt || item.shortDescription || '',
    description: item.description || item.fullDescription || item.summary || '',
    durationText: item.durationText || item.duration || '',
    durationMinutes: durationMinutes(item),
    bookingType: item.bookingType || 'DATE_AND_TIME',
    currency: item.currency || item.defaultCurrency || 'ISK',
    defaultCurrency: item.defaultCurrency || item.currency || 'ISK',
    vendor: buildVendor(item),
    pricingCategories: buildPricingCategories(item),
    pricing: buildPricing(item),
    nextDefaultPrice: item.nextDefaultPrice || null,
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
    categories: item.categories || (item.category ? [item.category] : []),
    keywords: item.keywords || [],
    languages: item.languages || item.guidedLanguages || [],
    coverImageUrl,
    coverImagePlaceholder: item.coverImagePlaceholder || pickPhotoKey(id),
    photos: item.photos || [],
    averageRating: num(item.averageRating ?? item.reviewRating ?? item.rating, 0),
    reviewCount: num(item.reviewCount ?? item.reviewsCount, 0),
    cancellationCutoffMinutes: item.cancellationCutoffMinutes ?? null,
    tags: buildTags(item),
  };
}

function normalizeSearchResponse(payload) {
  const items = extractItems(payload);
  return {
    activities: items.map(normalizeActivity),
    meta: {
      page: payload.page ?? payload.currentPage ?? 1,
      pageSize: payload.pageSize ?? items.length,
      total: payload.totalCount ?? payload.total ?? items.length,
    },
  };
}

module.exports = { normalizeActivity, normalizeSearchResponse, extractItems };
