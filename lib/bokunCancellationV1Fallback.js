/**
 * Narrow v1 read for marketplace supplier cancellation policies missing from
 * GET /restapi/v2.0/cancellation/policies (vendor-owned list only).
 *
 * Only GET /activity.json/{id} and only the cancellationPolicy field.
 * @see docs/BOKUN_REST_V2.md — cancellation policy gap
 */

const { bokunRequest } = require('./bokunClient');

function mapV1PenaltyRule(r) {
  if (!r || typeof r !== 'object') return null;
  const cutoffHours = Number(r.cutoffHours);
  const charge = Number(r.charge ?? r.percentage ?? 0);
  if (!Number.isFinite(cutoffHours)) return null;
  const chargeType = String(r.chargeType || '').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENTAGE';
  return {
    cutoffHours,
    charge,
    percentage: chargeType === 'PERCENTAGE' ? charge : undefined,
    chargeType,
  };
}

function mapV1CancellationPolicy(dto) {
  if (!dto || dto.id == null) return null;
  const penaltyRules = (dto.penaltyRules || [])
    .map(mapV1PenaltyRule)
    .filter(Boolean);
  const type = dto.policyTypeEnum || dto.policyType || dto.type || null;
  return {
    id: dto.id,
    title: dto.title || null,
    type,
    defaultPolicy: !!dto.defaultPolicy,
    simpleCutoffHours: dto.simpleCutoffHours ?? null,
    penaltyRules,
  };
}

function v1FallbackEnabled() {
  const flag = String(process.env.BOKUN_CANCELLATION_V1_FALLBACK || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

/**
 * @param {string|number} experienceId
 * @returns {Promise<object|null>}
 */
async function fetchCancellationPolicyFromV1ActivityJson(experienceId) {
  if (!v1FallbackEnabled() || experienceId == null || experienceId === '') return null;
  try {
    const payload = await bokunRequest({
      method: 'GET',
      path: `/activity.json/${encodeURIComponent(String(experienceId))}`,
    });
    return mapV1CancellationPolicy(payload && payload.cancellationPolicy);
  } catch (err) {
    console.warn('[bokunCancellationV1Fallback]', experienceId, err.message || err);
    return null;
  }
}

module.exports = {
  fetchCancellationPolicyFromV1ActivityJson,
  mapV1CancellationPolicy,
  v1FallbackEnabled,
};
