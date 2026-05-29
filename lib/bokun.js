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
const { mapV2AvailabilityList } = require('./mapV2Availability');

/**
 * Experience product payload (v1-shaped for normalizeActivity).
 */
async function getActivityById(id, { uiLang } = {}) {
  void uiLang;
  const components = await getExperienceComponents(id, 'ALL');
  const raw = componentsToActivity(components, { experienceId: id });
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
