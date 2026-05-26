const { syncCatalog } = require('../../lib/catalogSync');

/**
 * Vercel Cron entry — mirrors the Bókun contract catalog into Supabase.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel injects on cron invocation)
 *       or CATALOG_SYNC_SECRET as fallback for manual runs.
 *
 * GET  → run sync with default options
 * POST → accepts { uiLang?, deactivateMissing?, syncImages? } in JSON body
 */
function checkCronAuth(req) {
  const secret = (
    process.env.CRON_SECRET
    || process.env.CATALOG_SYNC_SECRET
    || process.env.TRANSLATION_SYNC_SECRET
    || ''
  ).trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkCronAuth(req)) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: 'Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Set CRON_SECRET (or CATALOG_SYNC_SECRET).',
    });
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      body = {};
    }
  }

  try {
    const summary = await syncCatalog({
      uiLang: body.uiLang || 'hant',
      deactivateMissing: body.deactivateMissing !== false,
      syncImages: body.syncImages,
      forceDetail: body.forceDetail === true,
      ...(Number.isFinite(Number(body.maxDetailPerRun)) ? { maxDetailPerRun: Number(body.maxDetailPerRun) } : {}),
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
