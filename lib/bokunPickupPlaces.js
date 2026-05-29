/**
 * Bókun pick-up place resolution (REST v2).
 *
 * ExperienceComponentsDto only exposes pickupPlaceGroupIds — not the bus-stop
 * list shown in Bókun's booking widget. Until Bókun documents a v2 list endpoint,
 * pick-up selection happens on Hosted Checkout (BOKUN_SHOP_URL).
 *
 * @see docs/BOKUN_REST_V2.md — Known gaps
 */

/**
 * Future: resolve place group IDs → [{ id, title, address }].
 * @param {string|number} _experienceId
 * @param {number[]} _groupIds
 * @returns {Promise<object[]>}
 */
async function fetchPickupPlacesForExperience(_experienceId, _groupIds = []) {
  return [];
}

module.exports = {
  fetchPickupPlacesForExperience,
};
