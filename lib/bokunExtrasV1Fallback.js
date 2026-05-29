/**
 * v2 experience components omit extra prices; graft from v1 bookableExtras.
 * @see lib/bokunCancellationV1Fallback.js — same narrow v1 read pattern.
 */

const { bokunRequest, getQuoteCurrency } = require('./bokunClient');

function v1FallbackEnabled() {
  const flag = String(process.env.BOKUN_EXTRAS_V1_FALLBACK || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function extraNeedsRefresh(ex) {
  if (!ex || ex.included) return false;
  const price = Number(ex.price);
  const missingPrice = !Number.isFinite(price) || price <= 0;
  const staleFreeFlag = !!ex.free && Number.isFinite(price) && price > 0;
  return missingPrice || staleFreeFlag;
}

/**
 * @param {string|number} experienceId
 * @returns {Promise<Map<string, object>>}
 */
async function fetchV1ExtrasById(experienceId) {
  const map = new Map();
  if (!v1FallbackEnabled() || experienceId == null) return map;
  try {
    const payload = await bokunRequest({
      method: 'GET',
      path: `/activity.json/${encodeURIComponent(String(experienceId))}`,
    });
    const list = Array.isArray(payload?.bookableExtras) ? payload.bookableExtras : [];
    list.forEach((ex) => {
      if (ex && ex.id != null) map.set(String(ex.id), ex);
    });
  } catch (err) {
    console.warn('[bokunExtrasV1Fallback]', experienceId, err.message || err);
  }
  return map;
}

/**
 * Merge v1 prices / labels onto v2-shaped bookableExtras.
 * @param {object} activity
 */
async function enrichActivityBookableExtras(activity) {
  if (!activity || !Array.isArray(activity.bookableExtras) || !activity.bookableExtras.length) {
    return activity;
  }
  if (!activity.bookableExtras.some(extraNeedsRefresh)) return activity;

  const byId = await fetchV1ExtrasById(activity.id ?? activity.experienceId);
  if (!byId.size) return activity;

  activity.bookableExtras = activity.bookableExtras.map((ex) => {
    let next = ex;
    if (extraNeedsRefresh(ex)) {
      const v1 = byId.get(String(ex.id));
      if (v1) {
        const price = Number(v1.price);
        const quote = getQuoteCurrency();
        next = {
          ...ex,
          price: Number.isFinite(price) && price >= 0 ? price : ex.price,
          priceCurrency: quote,
          free: v1.free != null ? !!v1.free : ex.free,
          pricingType: ex.pricingType || v1.pricingType || null,
          pricingTypeLabel: ex.pricingTypeLabel || v1.pricingTypeLabel || null,
          information: ex.information || v1.information || '',
          selectionType: ex.selectionType || v1.selectionType || null,
        };
      }
    }
    const priceNum = Number(next.price);
    if (Number.isFinite(priceNum) && priceNum > 0) {
      return { ...next, free: false };
    }
    return next;
  });
  return activity;
}

module.exports = {
  enrichActivityBookableExtras,
  fetchV1ExtrasById,
  v1FallbackEnabled,
};
