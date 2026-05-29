/**
 * Bókun server client — REST API v2 only (/restapi/v2.0/*).
 * @see docs/BOKUN_REST_V2.md · https://api-docs.bokun.dev/rest-v2
 */

const {
  bokunRequest,
  getConfig,
  uiLangToBokunLang,
  getQuoteCurrency,
  applyQuoteCurrency,
  applyQuoteCurrencyAsync,
} = require('./bokunClient');
const {
  getExperienceComponents,
  getExperienceAvailability,
  getSupplierContractIds,
  getContractById,
  getMarketplaceVendor,
} = require('./bokunV2');
const { componentsToActivity } = require('./v2ExperienceToActivity');
const { enrichActivityCancellationPolicy } = require('./bokunCancellationPolicies');
const { enrichActivityBookableExtras } = require('./bokunExtrasV1Fallback');
const { mapV2AvailabilityList } = require('./mapV2Availability');
const { fetchActivityFromDb } = require('./catalogDb');

function isPlaceholderVendor(v) {
  if (!v || typeof v !== 'object') return true;
  const t = String(v.titleOriginal || v.title || '').trim();
  return !t || t === 'Supplier' || /^Supplier \d+$/.test(t);
}

/**
 * Experience product payload (v1-shaped for normalizeActivity).
 */
async function getActivityById(id, { uiLang } = {}) {
  void uiLang;
  const components = await getExperienceComponents(id, 'ALL');
  const raw = componentsToActivity(components, { experienceId: id });
  await enrichActivityCancellationPolicy(raw);
  await enrichActivityBookableExtras(raw);

  try {
    const cached = await fetchActivityFromDb(id);
    const c = cached && cached.activity;
    if (c) {
      if (isPlaceholderVendor(raw.vendor) && c.vendor && !isPlaceholderVendor(c.vendor)) {
        raw.vendor = c.vendor;
      }
      if (!String(raw.durationText || '').trim() && String(c.durationText || '').trim()) {
        raw.durationText = c.durationText;
      }
      if ((!Number(raw.durationMinutes) || Number(raw.durationMinutes) <= 0) && Number(c.durationMinutes) > 0) {
        raw.durationMinutes = c.durationMinutes;
      }
    }
  } catch (err) {
    console.warn('[bokun] detail catalog graft failed:', err.message);
  }

  const [activity] = await applyQuoteCurrencyAsync([raw]);
  return activity;
}

async function getActivityAvailabilities(id, { start, end = start, uiLang } = {}) {
  void uiLang;
  const [slots, components] = await Promise.all([
    getExperienceAvailability(id, { from: start, to: end, showId: true }),
    getExperienceComponents(id, ['START_TIMES', 'RATES']).catch(() => ({})),
  ]);
  return mapV2AvailabilityList(slots, { startTimes: components.startTimes });
}

module.exports = {
  bokunRequest,
  getConfig,
  uiLangToBokunLang,
  getQuoteCurrency,
  applyQuoteCurrency,
  applyQuoteCurrencyAsync,
  getActivityById,
  getActivityAvailabilities,
  getExperienceComponents,
  getExperienceAvailability,
  getSupplierContractIds,
  getContractById,
  getMarketplaceVendor,
};
