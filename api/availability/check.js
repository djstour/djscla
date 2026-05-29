const { getActivityById, getActivityAvailabilities, getQuoteCurrency } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { isDisplayableCatalogPrice } = require('../../lib/catalogPriceVerification');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toIsoDateParts(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  return input;
}

function resolveAmountValue(amount) {
  if (amount == null) return null;
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'object' && amount.amount != null) return Number(amount.amount);
  return Number(amount);
}

function matchAvailability(availabilities, date, startTimeId) {
  const dated = availabilities.filter((row) => {
    const d = row.localDate || row.dateString || row.date;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d === date;
    if (typeof row.date === 'number') return new Date(row.date).toISOString().slice(0, 10) === date;
    return true;
  });

  if (startTimeId == null || startTimeId === '') {
    return dated.find((row) => !row.soldOut && !row.unavailable) || dated[0] || null;
  }

  const wanted = String(startTimeId);
  return dated.find((row) => String(row.startTimeId) === wanted || String(row.id) === wanted) || null;
}

function extractCategoryUnitPrices(activity, availability, currency, { allowCatalogFallback = false } = {}) {
  const categories = Array.isArray(activity.pricingCategories) ? activity.pricingCategories : [];
  const rates = Array.isArray(availability?.pricesByRate) ? availability.pricesByRate : [];
  const defaultRateId = availability?.defaultRateId;
  const priceRow = rates.find((row) => String(row.activityRateId) === String(defaultRateId)) || rates[0] || null;
  const perCategory = priceRow && Array.isArray(priceRow.pricePerCategoryUnit)
    ? priceRow.pricePerCategoryUnit
    : [];
  const unitById = new Map();
  perCategory.forEach((entry) => {
    unitById.set(String(entry.id), {
      unitAmount: resolveAmountValue(entry.amount) || 0,
      currency: entry.amount?.currency || currency,
    });
  });
  if (allowCatalogFallback) {
    (activity.pricing || []).forEach((row) => {
      const key = String(row.pricingCategoryId);
      if (!unitById.has(key) && Number(row.amount) > 0) {
        unitById.set(key, { unitAmount: Number(row.amount), currency: row.currency || currency });
      }
    });
  }

  return categories.map((cat) => {
    const hit = unitById.get(String(cat.id));
    return {
      pricingCategoryId: cat.id,
      label: cat.fullTitle || cat.title || `Category ${cat.id}`,
      unitAmount: hit ? hit.unitAmount : null,
      currency: hit?.currency || currency,
    };
  }).filter((row) => row.unitAmount != null && row.unitAmount > 0);
}

function computeLineItems(activity, availability, pax, { allowCatalogFallback = false } = {}) {
  const rates = Array.isArray(availability?.pricesByRate) ? availability.pricesByRate : [];
  const defaultRateId = availability?.defaultRateId;
  const priceRow = rates.find((row) => String(row.activityRateId) === String(defaultRateId)) || rates[0] || null;
  const currency = getQuoteCurrency();

  if (!priceRow) {
    if (!allowCatalogFallback) {
      return { currency, lineItems: [], priceUnverified: true };
    }
    const fallback = Array.isArray(activity.pricing) ? activity.pricing : [];
    const lines = pax.map((row) => {
      const price = fallback.find((p) => String(p.pricingCategoryId) === String(row.pricingCategoryId));
      const unitAmount = Number(price?.amount || 0);
      const quantity = Number(row.quantity) || 0;
      return {
        pricingCategoryId: row.pricingCategoryId,
        label: price?.label || `Category ${row.pricingCategoryId}`,
        quantity,
        unitAmount,
        total: unitAmount * quantity,
        currency,
      };
    });
    return { currency, lineItems: lines };
  }

  const unitMap = new Map();
  const perCategory = Array.isArray(priceRow.pricePerCategoryUnit) ? priceRow.pricePerCategoryUnit : [];
  perCategory.forEach((entry) => {
    unitMap.set(String(entry.id), {
      amount: resolveAmountValue(entry.amount) || 0,
      currency: entry.amount?.currency || currency,
    });
  });

  const bookingAmount = resolveAmountValue(priceRow.pricePerBooking);
  const categories = Array.isArray(activity.pricingCategories) ? activity.pricingCategories : [];
  const lines = pax.map((row, index) => {
    const quantity = Number(row.quantity) || 0;
    const cat = unitMap.get(String(row.pricingCategoryId));
    const unitAmount = cat ? cat.amount : 0;
    const catMeta = categories.find((c) => String(c.id) === String(row.pricingCategoryId));
    return {
      pricingCategoryId: row.pricingCategoryId,
      label: catMeta?.fullTitle || catMeta?.title || `Category ${row.pricingCategoryId}`,
      quantity,
      unitAmount,
      total: unitAmount * quantity,
      currency: cat?.currency || currency,
      isDefaultBookingPrice: bookingAmount != null && index === 0,
    };
  });

  if (bookingAmount != null && !perCategory.length && lines[0]) {
    lines[0].unitAmount = bookingAmount;
    lines[0].total = bookingAmount;
    lines[0].quantity = 1;
  }

  return {
    currency: lines[0]?.currency || currency,
    lineItems: lines,
  };
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const activityId = body.activityId != null ? String(body.activityId) : '';
  const date = toIsoDateParts(body.date);
  const startTimeId = body.startTimeId;
  const pax = Array.isArray(body.pax) ? body.pax : [];
  const uiLang = body.lang || 'hant';

  if (!activityId || !date || !pax.length) {
    return res.status(400).json({
      error: 'activityId, date, and pax are required',
      code: 'INVALID_AVAILABILITY_REQUEST',
    });
  }

  try {
    const [activityPayload, availabilityPayload] = await Promise.all([
      getActivityById(activityId, { uiLang }),
      getActivityAvailabilities(activityId, { start: date, end: date, uiLang }),
    ]);

    const rawActivity = activityPayload?.activity || activityPayload;
    const activity = normalizeActivity(rawActivity);
    const availabilities = Array.isArray(availabilityPayload) ? availabilityPayload : availabilityPayload?.availabilities || [];
    const availability = matchAvailability(availabilities, date, startTimeId);

    if (!availability) {
      return res.status(200).json({
        available: false,
        reason: 'NO_AVAILABILITY',
        bookingType: activity.bookingType,
        currency: getQuoteCurrency(),
        activityId,
        date,
      });
    }

    const soldOut = !!(availability.soldOut || availability.unavailable);
    const capacity = availability.unlimitedAvailability ? null : availability.availabilityCount ?? null;
    const requested = pax.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const minRequired = Number(availability.minParticipantsToBookNow || availability.minParticipants || 1);
    const capacityOk = availability.unlimitedAvailability || capacity == null || requested <= capacity;
    const minOk = requested >= minRequired;
    const allowCatalogFallback = isDisplayableCatalogPrice(activity);
    const pricing = computeLineItems(activity, availability, pax, { allowCatalogFallback });
    const total = pricing.lineItems.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const categoryUnitPrices = extractCategoryUnitPrices(
      activity,
      availability,
      pricing.currency,
      { allowCatalogFallback },
    );

    return res.status(200).json({
      available: !soldOut && capacityOk && minOk,
      activityId,
      bookingType: activity.bookingType,
      currency: pricing.currency,
      total,
      lineItems: pricing.lineItems,
      categoryUnitPrices,
      availability: {
        id: availability.id,
        date,
        startTime: availability.startTime || null,
        startTimeId: availability.startTimeId ?? null,
        capacityRemaining: capacity,
        unlimitedAvailability: !!availability.unlimitedAvailability,
        minParticipantsToBookNow: minRequired,
        soldOut,
      },
      priceUnverified: !!pricing.priceUnverified,
      warnings: [
        !capacityOk && 'Requested passengers exceed remaining capacity.',
        !minOk && `Booking requires at least ${minRequired} participants.`,
        pricing.priceUnverified && 'Catalog price is not verified; complete booking in Bókun for the final fare.',
      ].filter(Boolean),
      raw: {
        rates: availability.rates || [],
      },
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'AVAILABILITY_ERROR',
    });
  }
};
