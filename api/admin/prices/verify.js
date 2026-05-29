/**
 * POST /api/admin/prices/verify
 * Body: { activityIds: string[] } — v2-only audit (no v1). Does not auto-approve display.
 */

const { applyAdminCors, requireAdmin } = require('../../../lib/adminAuth');
const { supabaseRestFetch } = require('../../../lib/supabase');
const { normalizeActivity } = require('../../../lib/normalizeActivity');
const {
  verifyActivityPriceDisplay,
  isDisplayableCatalogPrice,
} = require('../../../lib/catalogPriceVerification');

const ACTIVITY_TABLE = 'activities';

function lowestPriceFrom(activity) {
  const rows = Array.isArray(activity.pricing) ? activity.pricing : [];
  let lowest = null;
  rows.forEach((r) => {
    const amount = Number(r && r.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (lowest == null || amount < lowest) lowest = amount;
  });
  if (lowest != null) return lowest;
  if (activity.nextDefaultPrice && Number.isFinite(Number(activity.nextDefaultPrice.amount))) {
    return Number(activity.nextDefaultPrice.amount);
  }
  return null;
}

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = Array.isArray(body.activityIds)
    ? body.activityIds.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    return res.status(400).json({
      error: 'activityIds array required',
      code: 'INVALID_VERIFY_REQUEST',
    });
  }

  if (ids.length > 50) {
    return res.status(400).json({
      error: 'Maximum 50 activity IDs per request',
      code: 'VERIFY_BATCH_LIMIT',
    });
  }

  const inList = ids.map((id) => `"${id}"`).join(',');
  const rows = await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})&select=bokun_activity_id,bokun_payload`,
  );

  const byId = new Map();
  (rows || []).forEach((row) => {
    if (row && row.bokun_activity_id != null) {
      byId.set(String(row.bokun_activity_id), row);
    }
  });

  const results = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, ok: false, error: 'not_in_db' });
      continue;
    }
    try {
      const base = normalizeActivity(row.bokun_payload || {});
      const verified = await verifyActivityPriceDisplay(id, base);
      const priceFrom = isDisplayableCatalogPrice(verified) ? lowestPriceFrom(verified) : null;

      await supabaseRestFetch(
        `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: {
            bokun_payload: verified,
            price_from: priceFrom,
          },
        },
      );

      results.push({
        id,
        ok: true,
        trusted: !!verified.priceDisplay?.trusted,
        source: verified.priceDisplay?.source || null,
        reason: verified.priceDisplay?.reason || null,
        message: verified.priceDisplay?.message || null,
        catalogMaxUsd: verified.priceDisplay?.catalogMaxUsd ?? null,
        priceFrom,
      });

      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      results.push({ id, ok: false, error: err.message || 'verify_failed' });
    }
  }

  return res.status(200).json({
    ok: true,
    policy: 'v2_only',
    summary: {
      requested: ids.length,
      displayTrusted: results.filter((r) => r.trusted).length,
      auditOnly: results.filter((r) => r.ok && !r.trusted).length,
      failed: results.filter((r) => !r.ok).length,
    },
    results,
  });
};
