/**
 * Map Bókun REST v2 ExperienceComponentsDto → shape consumed by normalizeActivity().
 * @see https://api-docs.bokun.dev/rest-v2
 */

const { getQuoteCurrency } = require('./bokunClient');

function inferCurrencyFromComponents(components) {
  const rules = components.pricing?.experiencePriceRules;
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    if (rule.currency) return String(rule.currency).toUpperCase();
  }
  return null;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function moneyAmount(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return num(value, 0);
  if (typeof value === 'string') return num(value, 0);
  if (typeof value === 'object' && value.amount != null) return moneyAmount(value.amount);
  return 0;
}

function durationMinutesFrom(dur) {
  if (!dur || typeof dur !== 'object') return 0;
  if (dur.minutes != null) return num(dur.minutes);
  if (dur.hours != null) return Math.round(num(dur.hours) * 60);
  if (dur.days != null) return Math.round(num(dur.days) * 24 * 60);
  return 0;
}

function enumCode(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.name) return value.name;
  return String(value);
}

function enumList(values) {
  if (!Array.isArray(values)) return [];
  return values.map(enumCode).filter(Boolean);
}

function formatAddress(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const parts = [
    addr.addressLine1,
    addr.addressLine2,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (typeof addr.address === 'string') return addr.address;
  return '';
}

function geoFromAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  if (addr.geoPoint && typeof addr.geoPoint === 'object') return addr.geoPoint;
  if (addr.latitude != null && addr.longitude != null) {
    return { latitude: addr.latitude, longitude: addr.longitude };
  }
  return null;
}

function mapPhotos(photos) {
  return (photos || []).map((p, i) => ({
    id: p.id ?? i + 1,
    originalUrl: p.url || p.originalUrl || null,
    url: p.url || p.originalUrl || null,
    thumbnailUrl: p.url || p.thumbnailUrl || null,
    caption: p.caption || null,
  })).filter((p) => p.url);
}

function dedupePricingByCategoryMin(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const byCat = new Map();
  rows.forEach((row) => {
    if (!row || row.pricingCategoryId == null) return;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const key = String(row.pricingCategoryId);
    const prev = byCat.get(key);
    if (!prev || amount < Number(prev.amount)) {
      byCat.set(key, row);
    }
  });
  return [...byCat.values()];
}

function mapPricingCategories(components) {
  const pc = components.pricingCategories;
  const ids = pc && Array.isArray(pc.ids) ? pc.ids : [];
  const defaultId = pc && pc.defaultId != null ? pc.defaultId : ids[0];
  return ids.map((id, idx) => {
    const isDefault = String(id) === String(defaultId);
    let title = isDefault ? 'Adult' : 'Child';
    if (ids.length > 2) title = isDefault ? 'Adult' : `Category ${id}`;
    return {
      id,
      title,
      fullTitle: title,
      ticketCategory: isDefault ? 'ADULT' : (idx === 1 ? 'CHILD' : null),
      defaultCategory: isDefault,
    };
  });
}

function mapPricingFromRules(components, currency) {
  const rules = components.pricing?.experiencePriceRules;
  if (!Array.isArray(rules) || !rules.length) return [];
  const defaultRateId = components.rates?.rates?.[0]?.id ?? components.rates?.defaultRate?.id ?? components.rates?.[0]?.id ?? null;
  const rows = [];
  rules.forEach((rule) => {
    const amount = moneyAmount(rule.amount);
    if (amount <= 0) return;
    const catId = rule.pricingCategoryId ?? rule.pricingCategory?.id;
    if (catId == null) return;
    const rateId = rule.rate?.id ?? defaultRateId;
    if (defaultRateId != null && rateId != null && String(rateId) !== String(defaultRateId)) return;
    rows.push({
      pricingCategoryId: catId,
      amount,
      currency: rule.currency || currency,
      activityRateId: rateId,
    });
  });
  return dedupePricingByCategoryMin(rows);
}

function mapRates(components) {
  const list = components.rates?.rates ?? components.rates;
  if (!Array.isArray(list)) return [];
  return list.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description || null,
    minPerBooking: r.minPerBooking ?? null,
    maxPerBooking: r.maxPerBooking ?? null,
    pickupSelectionType: r.pickupSelectionType,
    pickupPricingType: r.pickupPricingType,
    pickupPricedPerPerson: r.pickupPricedPerPerson,
    dropoffSelectionType: r.dropoffSelectionType,
    dropoffPricingType: r.dropoffPricingType,
    dropoffPricedPerPerson: r.dropoffPricedPerPerson,
    cancellationPolicyId: r.cancellationPolicyId ?? null,
    extraConfigs: r.extraConfigs || [],
  }));
}

function mapExtras(components) {
  return (components.extras || []).map((ex) => ({
    id: ex.id,
    title: ex.title,
    information: ex.description || ex.information || '',
    pricingType: ex.pricingType || null,
    price: moneyAmount(ex.price),
    free: moneyAmount(ex.price) === 0,
    included: false,
    maxPerBooking: ex.maxPerBooking || 0,
    limitByPax: !!ex.limitByPax,
  }));
}

function mapMeetingPoint(meetingType) {
  const mt = meetingType || {};
  const type = String(mt.type || '');
  if (!/MEET_ON_LOCATION/i.test(type)) return null;

  const points = mt.meetingPointAddresses || [];
  if (!points.length) return null;

  const p = points[0];
  const address = formatAddress(p.address);
  return {
    id: p.id ?? null,
    title: (p.title || '').trim(),
    name: (p.title || '').trim(),
    address,
    geoPoint: geoFromAddress(p.address),
  };
}

function mapPickup(components, rates) {
  const mt = components.meetingType || {};
  const type = String(mt.type || '');
  const pickupEnabled = type === 'PICK_UP' || type === 'MEET_ON_LOCATION_OR_PICK_UP';
  const places = [];

  if (type === 'PICK_UP' || type === 'MEET_ON_LOCATION_OR_PICK_UP') {
    (mt.meetingPointAddresses || []).forEach((p, i) => {
      places.push({
        id: p.id ?? i + 1,
        title: (p.title || '').trim(),
        type: 'PICKUP',
        askForRoomNumber: false,
        address: formatAddress(p.address),
        city: p.address?.city || '',
      });
    });
  }

  const defaultRate = rates[0] || null;

  return {
    enabled: pickupEnabled,
    customAllowed: !!mt.customPickupAllowed,
    minutesBefore: mt.pickupMinutesBefore ?? null,
    timeWindowMinutes: mt.pickupTimeWindow ?? null,
    noPickupMessage: typeof mt.noPickupMessage === 'string' ? mt.noPickupMessage : null,
    dropoffEnabled: !!mt.dropoffService,
    groups: Array.isArray(mt.pickupPlaceGroupIds) ? mt.pickupPlaceGroupIds.length : 0,
    places,
    rate: defaultRate
      ? {
          selectionType: defaultRate.pickupSelectionType,
          pricingType: defaultRate.pickupPricingType,
          pricedPerPerson: defaultRate.pickupPricedPerPerson,
        }
      : null,
  };
}

function mapGuidanceTypes(components) {
  const g = components.guidanceTypes;
  if (!g) return [];
  if (Array.isArray(g)) return g;
  if (typeof g === 'object') {
    const rows = [];
    Object.entries(g).forEach(([key, val]) => {
      if (key === 'keyType' || key === 'guidedLanguages') return;
      if (!Array.isArray(val)) return;
      rows.push({
        guidanceType: key,
        languages: val,
        displayLanguages: val,
      });
    });
    if (rows.length) return rows;
    if (Array.isArray(g.guidedLanguages)) {
      return [{ guidanceType: 'GUIDED', languages: g.guidedLanguages, displayLanguages: g.guidedLanguages }];
    }
  }
  return [];
}

function mapItinerary(itinerary) {
  return (itinerary || []).map((s, i) => ({
    id: s.id ?? i + 1,
    title: s.title || s.name || `Stop ${i + 1}`,
    excerpt: s.excerpt || '',
    description: s.description || '',
    address: formatAddress(s.address),
    geoPoint: geoFromAddress(s.address) || s.location || null,
    durationMinutes: s.durationMinutes ?? null,
  }));
}

function mapCutoff(cutoff) {
  if (!cutoff || typeof cutoff !== 'object') {
    return {
      bookingCutoffWeeks: null,
      bookingCutoffDays: null,
      bookingCutoffHours: null,
      bookingCutoffMinutes: null,
      bookingCutoffType: null,
    };
  }
  const weeks = Number(cutoff.weeks);
  const days = Number(cutoff.days);
  const hours = Number(cutoff.hours);
  const minutes = Number(cutoff.minutes);
  const totalMinutes = (Number.isFinite(weeks) ? weeks * 7 * 24 * 60 : 0)
    + (Number.isFinite(days) ? days * 24 * 60 : 0)
    + (Number.isFinite(hours) ? hours * 60 : 0)
    + (Number.isFinite(minutes) ? minutes : 0);

  return {
    bookingCutoffWeeks: Number.isFinite(weeks) ? weeks : null,
    bookingCutoffDays: Number.isFinite(days) ? days : null,
    bookingCutoffHours: Number.isFinite(hours) ? hours : null,
    bookingCutoffMinutes: Number.isFinite(minutes) ? minutes : null,
    bookingCutoffType: enumCode(cutoff.type),
    bookingCutoff: totalMinutes > 0 ? totalMinutes : null,
  };
}

function mapCancellationPolicyStub(components, rates) {
  const policyId = rates[0]?.cancellationPolicyId;
  if (!policyId) return null;
  return { id: policyId, title: null, penaltyRules: [] };
}

function mapCategoryEnums(categories) {
  return enumList(categories);
}

function mapThemeAttributes(themes) {
  return enumList(themes);
}

/**
 * @param {object} components — ExperienceComponentsDto from v2
 * @param {{ experienceId: string|number, vendor?: object }} meta
 */
function componentsToActivity(components, { experienceId, vendor } = {}) {
  const id = experienceId ?? components.id;
  const currency = inferCurrencyFromComponents(components) || getQuoteCurrency();
  const pricing = mapPricingFromRules(components, currency);
  const lowest = pricing.length
    ? Math.min(...pricing.map((p) => p.amount).filter((a) => a > 0))
    : null;

  const photos = mapPhotos(components.photos);
  const cover = photos[0]?.url || null;
  const rates = mapRates(components);
  const pickupInfo = mapPickup(components, rates);
  const cutoffFields = mapCutoff(components.cutoff);
  const activityCategories = mapCategoryEnums(components.categories);
  const themeAttributes = mapThemeAttributes(components.themes);
  const activityAttributes = [
    ...themeAttributes,
    ...(components.privateExperience ? ['PRIVATE'] : []),
  ];

  const defaultRate = rates[0];
  const passCapacity = components.passSettings?.maxPaxPerBooking
    ?? components.passSettings?.capacity
    ?? defaultRate?.maxPerBooking
    ?? null;

  return {
    id,
    externalId: components.externalId || String(id),
    title: components.title || 'Untitled activity',
    shortDescription: components.shortDescription || '',
    summary: components.shortDescription || '',
    description: components.description || components.shortDescription || '',
    durationMinutes: durationMinutesFrom(components.duration),
    durationText: components.duration?.label || '',
    bookingType: components.bookingType || 'DATE_AND_TIME',
    activityType: enumCode(components.type),
    privateExperience: !!components.privateExperience,
    timeZone: components.timeZone || null,
    currency,
    defaultCurrency: currency,
    vendor: vendor || { id: 0, title: 'Supplier', titleOriginal: 'Supplier' },
    pricingCategories: mapPricingCategories(components),
    pricing,
    nextDefaultPrice: lowest != null
      ? { amount: lowest, currency, pricingCategoryId: pricing[0]?.pricingCategoryId }
      : null,
    startTimes: components.startTimes || [],
    stops: mapItinerary(components.itinerary),
    themes: components.themes || [],
    categories: activityCategories,
    activityCategories,
    activityAttributes,
    keywords: components.keywords || [],
    photos,
    keyPhoto: cover ? { url: cover, originalUrl: cover } : null,
    included: components.included || '',
    excluded: components.excluded || '',
    requirements: components.requirements || '',
    attention: components.attention || '',
    knowBeforeYouGoItems: enumList(components.knowBeforeYouGo),
    inclusions: enumList(components.inclusions),
    exclusions: enumList(components.exclusions),
    bookableExtras: mapExtras(components),
    meetingPoint: mapMeetingPoint(components.meetingType),
    meetingType: components.meetingType || null,
    pickupPlaces: pickupInfo.places,
    pickupService: pickupInfo.enabled,
    customPickupAllowed: pickupInfo.customAllowed,
    pickupMinutesBefore: pickupInfo.minutesBefore,
    pickupTimeWindowInMinutes: pickupInfo.timeWindowMinutes,
    noPickupMsg: pickupInfo.noPickupMessage,
    pickupInfo,
    rates,
    guidanceTypes: mapGuidanceTypes(components),
    difficultyLevel: enumCode(components.difficultyLevel),
    minAge: components.minAge ?? null,
    passCapacity: passCapacity != null ? Number(passCapacity) : null,
    cancellationPolicy: mapCancellationPolicyStub(components, rates),
    bookingQuestions: components.bookingQuestions || [],
    location: components.location || null,
    videos: Array.isArray(components.videos) ? components.videos : [],
    ...cutoffFields,
    apiVersion: 'v2',
  };
}

module.exports = {
  componentsToActivity,
};
