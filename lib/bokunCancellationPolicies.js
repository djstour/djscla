/**
 * Resolve Bókun v2 cancellation policies by ID (rate.cancellationPolicyId).
 * @see GET /restapi/v2.0/cancellation/policies
 */

const { getCancellationPolicies } = require('./bokunV2');

const CACHE_MS = Number(process.env.BOKUN_V2_CANCELLATION_CACHE_MS) || 30 * 60 * 1000;
let policyById = null;
let cacheLoadedAt = 0;

function mapPolicyDto(dto) {
  if (!dto || dto.id == null) return null;
  const penaltyRules = (dto.penaltyRules || []).map((r) => ({
    cutoffHours: r.cutoffHours,
    charge: r.charge,
    percentage: r.chargeType === 'PERCENTAGE' ? r.charge : undefined,
    chargeType: r.chargeType,
  }));
  return {
    id: dto.id,
    title: dto.title || null,
    type: dto.type || null,
    defaultPolicy: !!dto.defaultPolicy,
    simpleCutoffHours: dto.simpleCutoffHours ?? null,
    penaltyRules,
  };
}

async function loadPolicyIndex() {
  const now = Date.now();
  if (policyById && now - cacheLoadedAt < CACHE_MS) return policyById;

  const index = new Map();
  let pageNo = 0;
  const pageSize = 100;

  for (;;) {
    const page = await getCancellationPolicies({ pageNo, pageSize });
    const items = page && Array.isArray(page.items) ? page.items : [];
    items.forEach((dto) => {
      const mapped = mapPolicyDto(dto);
      if (mapped) index.set(String(mapped.id), mapped);
    });
    const total = page && page.totalRowCount != null ? Number(page.totalRowCount) : null;
    if (!items.length) break;
    if (total != null && (pageNo + 1) * pageSize >= total) break;
    if (items.length < pageSize) break;
    pageNo += 1;
    if (pageNo > 50) break;
  }

  policyById = index;
  cacheLoadedAt = now;
  return policyById;
}

/**
 * @param {number|string|null|undefined} policyId
 * @returns {Promise<object|null>}
 */
async function resolveCancellationPolicy(policyId) {
  if (policyId == null || policyId === '') return null;
  const index = await loadPolicyIndex();
  return index.get(String(policyId)) || null;
}

/**
 * Attach full cancellation policy when only an ID stub is present.
 * @param {object} activity — v2-shaped activity from componentsToActivity
 */
async function enrichActivityCancellationPolicy(activity) {
  if (!activity || typeof activity !== 'object') return activity;
  const stub = activity.cancellationPolicy;
  const policyId = stub && stub.id != null
    ? stub.id
    : (Array.isArray(activity.rates) && activity.rates[0]?.cancellationPolicyId);
  if (policyId == null) return activity;

  const needsFetch = !stub
    || !stub.title
    || !Array.isArray(stub.penaltyRules)
    || stub.penaltyRules.length === 0;

  if (!needsFetch) return activity;

  try {
    const resolved = await resolveCancellationPolicy(policyId);
    if (resolved) activity.cancellationPolicy = resolved;
  } catch (err) {
    console.warn('[bokunCancellationPolicies]', policyId, err.message || err);
  }
  return activity;
}

module.exports = {
  resolveCancellationPolicy,
  enrichActivityCancellationPolicy,
  mapPolicyDto,
};
