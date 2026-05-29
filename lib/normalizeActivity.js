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

function buildImageAssets(item) {
  if (Array.isArray(item.imageAssets) && item.imageAssets.length) {
    return item.imageAssets
      .map((asset) => ({
        sourceUrl: asset.sourceUrl || asset.url || null,
        cardUrl: asset.cardUrl || null,
        heroUrl: asset.heroUrl || null,
        galleryUrl: asset.galleryUrl || null,
        isCover: !!asset.isCover,
      }))
      .filter((asset) => asset.sourceUrl || asset.heroUrl || asset.galleryUrl || asset.cardUrl);
  }
  return [];
}

function durationMinutes(item) {
  if (Number(item.durationMinutes) > 0) return num(item.durationMinutes);
  const dur = item.duration;
  if (dur && typeof dur === 'object') {
    let total = 0;
    if (dur.weeks != null) total += Math.round(num(dur.weeks) * 7 * 24 * 60);
    if (dur.days != null) total += Math.round(num(dur.days) * 24 * 60);
    if (dur.hours != null) total += Math.round(num(dur.hours) * 60);
    if (dur.minutes != null) total += Math.round(num(dur.minutes));
    if (total > 0) return total;
  }
  if (item.durationMinutesFromHours) return num(item.durationMinutesFromHours);
  const hours = item.durationHours || (dur && dur.hours);
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
      excerpt: s.excerpt || null,
      description: s.description || null,
      address: s.address || null,
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

function wrapParagraphs(text) {
  const blocks = String(text || '')
    .split(/\n\s*\n+/)
    .map((part) => part.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  return blocks.map((part) => `<p>${part}</p>`).join('');
}

function buildCancellationPolicyHtml(item) {
  const policy = item?.cancellationPolicy;
  if (!policy || typeof policy !== 'object') return '';

  const htmlCandidate = [
    policy.descriptionHtml,
    policy.html,
    policy.bodyHtml,
    policy.contentHtml,
  ].find((value) => typeof value === 'string' && /<[a-z][\s\S]*?>/i.test(value));
  if (htmlCandidate) return htmlCandidate.trim();

  const textCandidate = [
    policy.description,
    policy.body,
    policy.content,
    policy.text,
  ].find((value) => typeof value === 'string' && value.trim());
  if (textCandidate) return wrapParagraphs(textCandidate).trim();

  // Generate from structured penaltyRules using Bókun's own sentence template.
  // Title is intentionally omitted — the UI already renders cancellationPolicyTitle above the HTML.
  const policyType = String(policy.type || policy.policyType || policy.policyTypeEnum || '').toUpperCase();
  if (policyType === 'NON_REFUNDABLE') {
    return '<p>This experience is non-refundable.</p>';
  }
  if (policyType === 'FULL_REFUND') {
    return '<p>Free cancellation — full refund before the experience starts.</p>';
  }
  if (policyType === 'SIMPLE' && Number.isFinite(Number(policy.simpleCutoffHours)) && policy.simpleCutoffHours > 0) {
    const hours = Number(policy.simpleCutoffHours);
    const days = hours % 24 === 0 ? hours / 24 : null;
    const timeStr = days != null
      ? `${days} day${days !== 1 ? 's' : ''}`
      : `${hours} hour${hours !== 1 ? 's' : ''}`;
    return `<p>Free cancellation up to ${timeStr} before the experience starts.</p>`;
  }

  if (Array.isArray(policy.penaltyRules) && policy.penaltyRules.length) {
    const rules = policy.penaltyRules.map((r) => {
      const hours = Number(r.cutoffHours);
      const charge = Number(r.charge ?? r.percentage ?? 0);
      if (!Number.isFinite(hours) || hours <= 0) return null;
      const days = hours % 24 === 0 ? hours / 24 : null;
      const timeStr = days != null
        ? `${days} day${days !== 1 ? 's' : ''}`
        : `${hours} hour${hours !== 1 ? 's' : ''}`;
      return `<li>We will charge a cancellation fee of ${charge}% if booking is cancelled ${timeStr} or less before event</li>`;
    }).filter(Boolean);
    if (!rules.length) return '';
    return `<ul>${rules.join('')}</ul>`;
  }

  return '';
}

function buildBookableExtras(item) {
  if (!Array.isArray(item.bookableExtras)) return [];
  // Pull selectionType / pricedPerPerson from the default rate's extraConfigs so
  // the UI can render OPTIONAL extras as checkboxes (and skip MANDATORY ones).
  const defaultRate = Array.isArray(item.rates) ? item.rates[0] : null;
  const extraConfigById = new Map();
  if (defaultRate && Array.isArray(defaultRate.extraConfigs)) {
    defaultRate.extraConfigs.forEach((cfg) => {
      if (!cfg) return;
      const extraId = cfg.activityExtraId ?? cfg.extra?.id;
      if (extraId != null) extraConfigById.set(String(extraId), cfg);
    });
  }
  return item.bookableExtras.slice(0, 16).map((ex) => {
    const cfg = extraConfigById.get(String(ex.id)) || null;
    const priceNum = Number(ex.price);
    const hasPrice = Number.isFinite(priceNum) && priceNum > 0;
    return {
      id: ex.id,
      title: ex.title,
      information: ex.information || '',
      pricingType: ex.pricingType || null,
      pricingTypeLabel: ex.pricingTypeLabel || null,
      price: hasPrice ? priceNum : null,
      // v2 components omit extra prices → mapExtras sets free:true; clear when price exists.
      free: hasPrice ? false : !!ex.free,
      included: !!ex.included,
      maxPerBooking: ex.maxPerBooking || 0,
      limitByPax: !!ex.limitByPax,
      // From rate.extraConfigs:
      selectionType: (cfg && cfg.selectionType) || ex.selectionType || null,
      ratePricingType: cfg ? (cfg.pricingType || null) : null,    // INCLUDED_IN_PRICE | PRICED_SEPARATELY
      pricedPerPerson: cfg ? !!cfg.pricedPerPerson : (ex.pricingType === 'PER_PERSON'),
      priceCurrency: ex.priceCurrency || null,
    };
  });
}

function buildPickupInfo(item) {
  const embedded = item.pickupInfo && typeof item.pickupInfo === 'object' ? item.pickupInfo : null;
  const placesRaw = Array.isArray(item.pickupPlaces) && item.pickupPlaces.length
    ? item.pickupPlaces
    : (embedded && Array.isArray(embedded.places) ? embedded.places : []);
  const places = placesRaw.map((p) => ({
    id: p.id,
    title: (p.title || '').trim(),
    type: p.type || 'OTHER',
    askForRoomNumber: !!p.askForRoomNumber,
    address: p.location?.address || p.address || '',
    city: p.location?.city || p.city || '',
  })).filter((p) => p.id != null && p.title);

  const defaultRate = Array.isArray(item.rates) ? item.rates[0] : null;
  const ratePickup = defaultRate ? {
    selectionType: defaultRate.pickupSelectionType || null,
    pricingType: defaultRate.pickupPricingType || null,
    pricedPerPerson: !!defaultRate.pickupPricedPerPerson,
  } : null;

  const pickupPlaceGroupIds = Array.isArray(item.pickupPlaceGroupIds)
    ? item.pickupPlaceGroupIds
    : (Array.isArray(embedded?.pickupPlaceGroupIds) ? embedded.pickupPlaceGroupIds : []);
  const enabled = !!(item.pickupService || embedded?.enabled);
  const allPickupPlaceGroups = !!(item.allPickupPlaceGroups || embedded?.allPickupPlaceGroups);
  const selectionAtHostedCheckout = embedded?.selectionAtHostedCheckout === true
    || (enabled && !places.length && (pickupPlaceGroupIds.length > 0 || allPickupPlaceGroups));

  return {
    enabled,
    customAllowed: !!(item.customPickupAllowed || embedded?.customAllowed),
    minutesBefore: Number.isFinite(Number(item.pickupMinutesBefore))
      ? Number(item.pickupMinutesBefore)
      : (embedded?.minutesBefore ?? null),
    timeWindowMinutes: Number.isFinite(Number(item.pickupTimeWindowInMinutes))
      ? Number(item.pickupTimeWindowInMinutes)
      : (embedded?.timeWindowMinutes ?? null),
    noPickupMessage: (item.noPickupMsg && typeof item.noPickupMsg === 'object')
      ? null
      : (typeof item.noPickupMsg === 'string'
        ? item.noPickupMsg
        : (typeof embedded?.noPickupMessage === 'string' ? embedded.noPickupMessage : null)),
    groups: pickupPlaceGroupIds.length || Number(embedded?.groups) || 0,
    pickupPlaceGroupIds,
    allPickupPlaceGroups,
    selectionAtHostedCheckout,
    places,
    rate: ratePickup || embedded?.rate || null,
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
    coverImageOwnedUrl: item.coverImageOwnedUrl || item.coverImageOwned || null,
    coverImageCardUrl: item.coverImageCardUrl || null,
    coverImageHeroUrl: item.coverImageHeroUrl || item.coverImageOwnedUrl || null,
    coverImageGalleryUrl: item.coverImageGalleryUrl || null,
    coverImagePlaceholder: item.coverImagePlaceholder || pickPhotoKey(id),
    photos: item.photos || [],
    photoUrls: buildPhotoUrls(item),
    photoUrlsOwned: Array.isArray(item.photoUrlsOwned) ? item.photoUrlsOwned.filter(Boolean) : [],
    imageAssets: buildImageAssets(item),
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
    // Bókun's "Quick facts" — surfaced in the back office sidebar at the bottom
    // of the product page. We capture the enum codes verbatim and let the UI
    // translate them via BOKUN_TRANSLATIONS so vendor-set values render in the
    // active UI language without round-tripping back to Bókun.
    productCategory: item.productCategory || null,
    activityType: item.activityType || null,
    activityCategories: Array.isArray(item.activityCategories) ? item.activityCategories : [],
    // Bókun ships TWO cutoff representations: a flat `bookingCutoff` (total
    // minutes ─ e.g. 60) AND the modular `bookingCutoffWeeks/Days/Hours/Minutes`
    // breakdown (e.g. weeks=0, days=0, hours=1, minutes=0). We keep both — the
    // modular fields are used by the UI label so we don't double-count minutes.
    bookingCutoffTotalMinutes: Number.isFinite(Number(item.bookingCutoff)) ? Number(item.bookingCutoff) : null,
    bookingCutoffMinutes: Number.isFinite(Number(item.bookingCutoffMinutes)) ? Number(item.bookingCutoffMinutes) : null,
    bookingCutoffHours: Number.isFinite(Number(item.bookingCutoffHours)) ? Number(item.bookingCutoffHours) : null,
    bookingCutoffDays: Number.isFinite(Number(item.bookingCutoffDays)) ? Number(item.bookingCutoffDays) : null,
    bookingCutoffWeeks: Number.isFinite(Number(item.bookingCutoffWeeks)) ? Number(item.bookingCutoffWeeks) : null,
    // guidanceTypes is shaped: [{ guidanceType: 'GUIDED', languages: ['en'], displayLanguages: ['English'] }, …]
    guidanceTypes: Array.isArray(item.guidanceTypes)
      ? item.guidanceTypes.map((g) => ({
          guidanceType: g?.guidanceType || null,
          languages: Array.isArray(g?.languages) ? g.languages : [],
          displayLanguages: Array.isArray(g?.displayLanguages) ? g.displayLanguages : [],
        }))
      : [],
    cancellationFreeHours: deriveCancellationCutoff(item),
    cancellationPolicyTitle: (item.cancellationPolicy && item.cancellationPolicy.title) || null,
    cancellationPolicyHtml: buildCancellationPolicyHtml(item),
    // Preserve raw policy so server-side re-computation can regenerate HTML without re-fetching from Bókun
    cancellationPolicy: item.cancellationPolicy || null,
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
