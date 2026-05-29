/**
 * POST /api/admin/activities/contract-pricing
 * Body: { bokunActivityIds: string[] }
 * Returns marketplace list price, commission %, and estimated net cost per activity.
 */

const { applyAdminCors, requireAdmin } = require('../../../lib/adminAuth');
const { supabaseRestFetch } = require('../../../lib/supabase');
const { enrichRowsWithContractPricing } = require('../../../lib/bokunMarketplacePricing');

const MAX_IDS = 60;

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = [...new Set(
    (Array.isArray(body.bokunActivityIds) ? body.bokunActivityIds : [])
      .map((id) => String(id).trim())
      .filter(Boolean),
  )].slice(0, MAX_IDS);

  if (!ids.length) {
    return res.status(400).json({
      error: 'bokunActivityIds array is required',
      code: 'INVALID_REQUEST',
    });
  }

  try {
    const inList = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
    const params = new URLSearchParams({
      select: 'bokun_activity_id,price_from,currency,bokun_payload',
      bokun_activity_id: `in.(${inList})`,
    });
    const dbRows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
    const byBokunId = new Map();
    (dbRows || []).forEach((row) => {
      byBokunId.set(String(row.bokun_activity_id), row);
    });

    const inputRows = ids.map((bokunActivityId) => {
      const row = byBokunId.get(bokunActivityId);
      return {
        bokunActivityId,
        priceFrom: row && row.price_from != null ? Number(row.price_from) : null,
        currency: row?.currency || 'USD',
        bokunPayload: row?.bokun_payload || null,
      };
    });

    const byId = await enrichRowsWithContractPricing(inputRows);

    return res.status(200).json({
      byId,
      meta: {
        requested: ids.length,
        priced: Object.values(byId).filter((r) => r && r.available).length,
        priceKind: 'catalog_list',
      },
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CONTRACT_PRICING_ERROR',
    });
  }
};
