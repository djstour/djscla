/**
 * GET /api/admin/translations/edit?bokunActivityId=123
 * PATCH /api/admin/translations/edit — save admin-edited zh overlay (no OpenAI).
 *
 * Body: { bokunActivityId, updates: [{ fieldPath, lang, text }] }
 */

const { applyAdminCors, requireAdmin } = require('../../../lib/adminAuth');
const { loadActivityForEdit, saveTranslationEdits } = require('../../../lib/translationAdminEdit');

function publicShape(ctx) {
  if (!ctx) return null;
  return {
    bokunActivityId: ctx.bokunActivityId,
    title: ctx.title,
    approval: ctx.approval,
    fields: ctx.fields,
  };
}

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const bokunActivityId = String(req.query.bokunActivityId || '').trim();
    if (!bokunActivityId) {
      return res.status(400).json({ error: 'bokunActivityId required', code: 'MISSING_ID' });
    }
    try {
      const ctx = await loadActivityForEdit(bokunActivityId);
      if (!ctx) {
        return res.status(404).json({ error: 'Activity not found', code: 'NOT_FOUND' });
      }
      return res.status(200).json(publicShape(ctx));
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({
        error: err.message,
        code: err.code || 'TRANSLATION_EDIT_READ_ERROR',
      });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const bokunActivityId = String(body.bokunActivityId || '').trim();
  if (!bokunActivityId) {
    return res.status(400).json({ error: 'bokunActivityId required', code: 'MISSING_ID' });
  }

  try {
    const ctx = await saveTranslationEdits(bokunActivityId, body.updates || []);
    return res.status(200).json({ ok: true, ...publicShape(ctx) });
  } catch (err) {
    const status = err.code === 'NOT_FOUND'
      ? 404
      : (err.code === 'INVALID_UPDATE' || err.code === 'UNKNOWN_FIELD' || err.code === 'EMPTY_TEXT' || err.code === 'MISSING_UPDATES')
        ? 400
        : (err.code === 'SUPABASE_CONFIG' ? 503 : 500);
    return res.status(status).json({
      error: err.message,
      code: err.code || 'TRANSLATION_EDIT_SAVE_ERROR',
    });
  }
};
