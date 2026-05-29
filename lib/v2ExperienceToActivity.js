/**
 * Map Bókun REST v2 ExperienceComponentsDto → shape consumed by normalizeActivity().
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

function mapPhotos(photos) {
  return (photos || []).map((p, i) => ({
    id: p.id ?? i + 1,
    originalUrl: p.url || p.originalUrl || null,
    url: p.url || p.originalUrl || null,
    thumbnailUrl: p.url || null,
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
    pickupSelectionType: r.pickupSelectionType,
    pickupPricingType: r.pickupPricingType,
    pickupPricedPerPerson: r.pickupPricedPerPerson,
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

function mapPickup(components) {
  const mt = components.meetingType || {};
  const type = mt.type || '';
  const pickupEnabled = /PICK_UP/i.test(String(type));
  const places = [];

  (mt.meetingPointAddresses || []).forEach((p, i) => {
    places.push({
      id: p.id ?? i + 1,
      title: (p.title || '').trim(),
      type: 'MEETING_POINT',
      askForRoomNumber: false,
      address: p.address?.addressLine1 || p.address?.address || '',
      city: p.address?.city || '',
    });
  });

  return {
    enabled: pickupEnabled,
    customAllowed: !!mt.customPickupAllowed,
    minutesBefore: mt.pickupMinutesBefore ?? null,
    timeWindowMinutes: mt.pickupTimeWindow ?? null,
    noPickupMessage: typeof mt.noPickupMessage === 'string' ? mt.noPickupMessage : null,
    groups: Array.isArray(mt.pickupPlaceGroupIds) ? mt.pickupPlaceGroupIds.length : 0,
    places,
    rate: mapRates(components)[0]
      ? {
          selectionType: mapRates(components)[0].pickupSelectionType,
          pricingType: mapRates(components)[0].pickupPricingType,
          pricedPerPerson: mapRates(components)[0].pickupPricedPerPerson,
        }
      : null,
  };
}

function mapGuidanceTypes(components) {
  const g = components.guidanceTypes;
  if (!g) return [];
  if (Array.isArray(g)) return g;
  if (Array.isArray(g.guidedLanguages)) {
    return [{ guidanceType: 'GUIDED', languages: g.guidedLanguages, displayLanguages: g.guidedLanguages }];
  }
  return [];
}

function mapCancellationPolicy(components) {
  const rates = mapRates(components);
  const policyId = rates[0]?.cancellationPolicyId;
  if (!policyId) return null;
  return { id: policyId, title: null, penaltyRules: [] };
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
    currency,
    defaultCurrency: currency,
    vendor: vendor || { id: 0, title: 'Supplier', titleOriginal: 'Supplier' },
    pricingCategories: mapPricingCategories(components),
    pricing,
    nextDefaultPrice: lowest != null
      ? { amount: lowest, currency, pricingCategoryId: pricing[0]?.pricingCategoryId }
      : null,
    startTimes: components.startTimes || [],
    stops: (components.itinerary || []).map((s, i) => ({
      id: s.id ?? i + 1,
      title: s.title || s.name || `Stop ${i + 1}`,
      geoPoint: s.location || null,
      durationMinutes: s.durationMinutes ?? null,
    })),
    themes: components.themes || [],
    categories: (components.categories || []).map((c) => c.name || c.title || c).filter(Boolean),
    keywords: components.keywords || [],
    photos,
    keyPhoto: cover ? { url: cover, originalUrl: cover } : null,
    included: components.included || '',
    excluded: components.excluded || '',
    requirements: components.requirements || '',
    attention: components.attention || '',
    knowBeforeYouGoItems: components.knowBeforeYouGo || [],
    inclusions: components.inclusions || [],
    exclusions: components.exclusions || [],
    bookableExtras: mapExtras(components),
    pickupPlaces: mapPickup(components).places,
    pickupService: mapPickup(components).enabled,
    customPickupAllowed: mapPickup(components).customAllowed,
    pickupMinutesBefore: mapPickup(components).minutesBefore,
    pickupTimeWindowInMinutes: mapPickup(components).timeWindowMinutes,
    noPickupMsg: mapPickup(components).noPickupMessage,
    pickupInfo: mapPickup(components),
    rates: mapRates(components),
    guidanceTypes: mapGuidanceTypes(components),
    difficultyLevel: components.difficultyLevel || null,
    minAge: components.minAge ?? null,
    passCapacity: components.passSettings?.maxPaxPerBooking ?? components.passSettings?.capacity ?? null,
    cancellationPolicy: mapCancellationPolicy(components),
    bookingQuestions: components.bookingQuestions || [],
    apiVersion: 'v2',
  };
}

module.exports = {
  componentsToActivity,
};
