/**
 * GET /api/admin/health — live service probes + env flags (Phase 5).
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { runAdminHealthChecks } = require('../../lib/adminHealth');

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const includeQueue = req.query.translation !== 'false';

  try {
    const report = await runAdminHealthChecks({ includeTranslationQueue: includeQueue });
    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: err.code || 'HEALTH_CHECK_ERROR',
    });
  }
}

handler.config = { maxDuration: 60 };

module.exports = handler;
