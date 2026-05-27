/**
 * POST /api/admin/activity — per-activity ops (Phase 2).
 *
 * Body:
 *   { action: 'resync-detail', bokunActivityId: '18571' }
 *   { action: 'set-active', bokunActivityId: '18571', isActive: true|false }
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');
const { syncActivityDetails } = require('../../lib/catalogSync');

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

  const bokunActivityId = String(body.bokunActivityId || '').trim();
  const action = String(body.action || '').trim();

  if (!bokunActivityId) {
    return res.status(400).json({
      error: 'bokunActivityId is required',
      code: 'MISSING_ACTIVITY_ID',
    });
  }

  if (action === 'resync-detail') {
    try {
      const result = await syncActivityDetails(new Set([bokunActivityId]));
      return res.status(200).json({
        ok: true,
        action,
        bokunActivityId,
        result,
      });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({
        ok: false,
        error: err.message,
        code: err.code || 'RESYNC_DETAIL_ERROR',
      });
    }
  }

  if (action === 'set-active') {
    if (typeof body.isActive !== 'boolean') {
      return res.status(400).json({
        error: 'isActive (boolean) is required for set-active',
        code: 'MISSING_IS_ACTIVE',
      });
    }

    try {
      const rows = await supabaseRestFetch(
        `/rest/v1/activities?bokun_activity_id=eq.${encodeURIComponent(bokunActivityId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { is_active: body.isActive },
        },
      );

      if (!Array.isArray(rows) || !rows.length) {
        return res.status(404).json({
          error: 'Activity not found in database',
          code: 'ACTIVITY_NOT_FOUND',
        });
      }

      return res.status(200).json({
        ok: true,
        action,
        bokunActivityId,
        isActive: rows[0].is_active !== false,
      });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' || err.code === 'SUPABASE_WRITE_DISABLED'
        ? 503
        : 500;
      return res.status(status).json({
        ok: false,
        error: err.message,
        code: err.code || 'SET_ACTIVE_ERROR',
      });
    }
  }

  return res.status(400).json({
    error: 'Unknown action',
    code: 'UNKNOWN_ACTION',
    hint: 'Use action: resync-detail | set-active',
  });
}

handler.config = { maxDuration: 120 };

module.exports = handler;
