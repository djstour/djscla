/**
 * POST /api/admin/sync — trigger Bókun → Supabase catalog sync (Phase 2).
 *
 * Uses ADMIN_PASSWORD auth (not CRON_SECRET). Calls syncCatalog directly on
 * the server so operators never need the cron secret in the browser.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { syncCatalog } = require('../../lib/catalogSync');

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
    ? Math.min(maxDetail, 120)
    : 40;

  try {
    const summary = await syncCatalog({
      uiLang: body.uiLang || 'hant',
      deactivateMissing: body.deactivateMissing !== false,
      syncImages: body.syncImages === true,
      forceDetail: body.forceDetail === true,
      maxDetailPerRun,
    });

    return res.status(200).json(summary);
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: err.message,
      code: err.code || 'CATALOG_SYNC_ERROR',
    });
  }
}

handler.config = { maxDuration: 300 };

module.exports = handler;
