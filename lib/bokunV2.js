/**
 * Bókun REST API v2 — all paths under /restapi/v2.0/
 * @see https://api-docs.bokun.dev/rest-v2.yaml
 */

const { bokunRequest } = require('./bokunClient');

const V2 = '/restapi/v2.0';

function buildQuery(params) {
  const parts = [];
  Object.entries(params).forEach(([key, val]) => {
    if (val == null || val === '') return;
    if (Array.isArray(val)) {
      val.forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

async function getSupplierContractIds(query = {}) {
  const qs = buildQuery({
    country: query.countryCode,
    status: query.status,
    supplierId: query.supplierId,
  });
  return bokunRequest({ method: 'GET', path: `${V2}/marketplace/contracts/supplier${qs}` });
}

async function getContractById(contractId) {
  return bokunRequest({ method: 'GET', path: `${V2}/marketplace/contract/${contractId}` });
}

async function getMarketplaceVendor(vendorId) {
  return bokunRequest({ method: 'GET', path: `${V2}/marketplace/vendor/${vendorId}` });
}

/**
 * @param {string|number} experienceId
 * @param {string[]|string} componentTypes — e.g. 'ALL' or ['TITLE','PHOTOS']
 */
async function getExperienceComponents(experienceId, componentTypes = 'ALL') {
  const types = Array.isArray(componentTypes) ? componentTypes : [componentTypes];
  const qs = buildQuery({ componentType: types });
  return bokunRequest({
    method: 'GET',
    path: `${V2}/experience/${experienceId}/components${qs}`,
  });
}

async function getExperienceAvailability(experienceId, { from, to, showId = false } = {}) {
  if (!from || !to) {
    const err = new Error('getExperienceAvailability: from and to (yyyy-MM-dd) required');
    err.code = 'INVALID_REQUEST';
    throw err;
  }
  const qs = buildQuery({ from, to, showId: showId ? 'true' : null });
  return bokunRequest({
    method: 'GET',
    path: `${V2}/availability/${experienceId}${qs}`,
  });
}

async function getCountries(languageTag) {
  const qs = languageTag ? buildQuery({ languageTag }) : '';
  return bokunRequest({ method: 'GET', path: `${V2}/countries${qs}` });
}

/**
 * Paginated cancellation policies for the authenticated vendor.
 * @param {{ pageNo?: number, pageSize?: number }} query
 */
async function getCancellationPolicies({ pageNo = 0, pageSize = 100 } = {}) {
  const qs = buildQuery({ pageNo, pageSize });
  return bokunRequest({ method: 'GET', path: `${V2}/cancellation/policies${qs}` });
}

module.exports = {
  V2_PREFIX: V2,
  getSupplierContractIds,
  getContractById,
  getMarketplaceVendor,
  getExperienceComponents,
  getExperienceAvailability,
  getCountries,
  getCancellationPolicies,
};
