/**
 * GET /api/admin/translations — translation queue stats (Supabase scan).
 * POST /api/admin/translations — run batch or sync specific activities.
 *
 * Auth: ADMIN_PASSWORD (Bearer).
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { scanTranslationQueue } = require('../../lib/translationQueue');
const { runAutoTranslationSync, runTranslationSync } = require('../../lib/translationSync');

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const maxScan = Math.min(parseInt(req.query.maxScan || '500', 10) || 500, 500);
    const pendingLimit = Math.min(parseInt(req.query.pendingLimit || '40', 10) || 40, 100);
    const approvalLimit = Math.min(parseInt(req.query.approvalLimit || '100', 10) || 100, 200);
    try {
      const queue = await scanTranslationQueue({ maxScan, pendingLimit, approvalLimit });
      return res.status(200).json(queue);
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({
        error: err.message,
        code: err.code || 'TRANSLATION_QUEUE_ERROR',
      });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const action = String(body.action || 'run-batch').trim();

  try {
    if (action === 'run-batch') {
      const maxActivities = Math.min(
        Math.max(parseInt(body.maxActivities || process.env.TRANSLATION_CRON_MAX_ACTIVITIES || '12', 10) || 12, 1),
        30,
      );
      const maxTranslationsPerActivity = Math.min(
        Math.max(parseInt(body.maxTranslationsPerActivity || process.env.TRANSLATION_CRON_MAX_TRANSLATIONS_PER_ACTIVITY || '6', 10) || 6, 1),
        24,
      );
      const budgetMs = Math.min(
        Math.max(parseInt(body.budgetMs || process.env.TRANSLATION_CRON_BUDGET_MS || '255000', 10) || 255000, 30000),
        290000,
      );
      const summary = await runAutoTranslationSync({
        maxActivities,
        maxTranslationsPerActivity,
        deadlineAtMs: Date.now() + budgetMs,
        langs: Array.isArray(body.langs) ? body.langs : ['hant', 'hans'],
        force: body.force === true,
        forceMarker: body.forceMarker != null ? String(body.forceMarker).trim() : null,
        uiLang: body.uiLang || 'hant',
      });
      return res.status(200).json({
        ok: true,
        action,
        maxActivities,
        maxTranslationsPerActivity,
        budgetMs,
        summary,
      });
    }

    if (action === 'sync-activities') {
      const ids = (body.activityIds || body.bokunActivityIds || [])
        .map((id) => Number(id))
        .filter(Number.isFinite);
      if (!ids.length) {
        return res.status(400).json({ error: 'activityIds required', code: 'MISSING_IDS' });
      }
      const summary = await runTranslationSync({
        activityIds: ids.slice(0, 10),
        langs: Array.isArray(body.langs) ? body.langs : ['hant', 'hans'],
        force: body.force === true,
        forceMarker: body.forceMarker != null ? String(body.forceMarker).trim() : null,
        uiLang: body.uiLang || 'hant',
        maxTranslations: body.maxTranslations != null ? Number(body.maxTranslations) : 80,
      });
      return res.status(200).json({ ok: true, action, summary });
    }

    return res.status(400).json({
      error: 'Unknown action',
      code: 'INVALID_ACTION',
      allowed: ['run-batch', 'sync-activities'],
    });
  } catch (err) {
    const status = err.code === 'OPENAI_CONFIG' || err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'TRANSLATION_RUN_ERROR',
    });
  }
}

handler.config = { maxDuration: 300 };

module.exports = handler;
