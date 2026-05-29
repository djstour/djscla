/**
 * POST /api/admin/sync — trigger Bókun → Supabase catalog sync (Phase 2).
 *
 * Uses ADMIN_PASSWORD auth (not CRON_SECRET). Calls syncCatalog directly on
 * the server so operators never need the cron secret in the browser.
 *
 * Vercel maxDuration is 300s — detail batch is auto-capped to a time budget
 * (see CATALOG_SYNC_MAX_MS) so the handler returns 200 instead of timing out.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { syncCatalog } = require('../../lib/catalogSync');

const ADMIN_DETAIL_CAP_MAX = 50;
const ADMIN_DETAIL_CAP_DEFAULT = 25;

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const maxDetail = Number(body.maxDetailPerRun);
  const maxDetailPerRun = Number.isFinite(maxDetail) && maxDetail > 0
    ? Math.min(maxDetail, ADMIN_DETAIL_CAP_MAX)
    : ADMIN_DETAIL_CAP_DEFAULT;

  const maxSyncMs = Number(process.env.CATALOG_SYNC_MAX_MS);
  const syncMaxMs = Number.isFinite(maxSyncMs) && maxSyncMs > 60_000
    ? maxSyncMs
    : 270_000;

  try {
    const summary = await syncCatalog({
      uiLang: body.uiLang || 'hant',
      deactivateMissing: body.deactivateMissing !== false,
      syncImages: body.syncImages === true,
      forceDetail: body.forceDetail === true,
      maxDetailPerRun,
      maxSyncMs: syncMaxMs,
      verifyDetailPrices: body.verifyDetailPrices === true,
      channelOnly: body.detailOnly === true,
    });

    return res.status(200).json(summary);
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: err.message,
      code: err.code || 'CATALOG_SYNC_ERROR',
      hint: err.code === 'CATALOG_SYNC_ERROR'
        ? 'If this was a timeout, lower detail batch cap (try 25) or use detail-only sync and run multiple times.'
        : undefined,
    });
  }
}

handler.config = { maxDuration: 300 };

module.exports = handler;
