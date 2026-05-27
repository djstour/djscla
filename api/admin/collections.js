/**
 * GET /api/admin/collections — list marketing collections
 * POST /api/admin/collections — create
 * PATCH /api/admin/collections?id=1 or ?slug=aurora-season
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');
const {
  TABLE,
  rowToDto,
  dtoToRow,
  listCollectionRows,
  getCollectionRow,
  resolveCollectionActivities,
} = require('../../lib/homepageCollections');

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const idOrSlug = req.query.id || req.query.slug;

  if (req.method === 'GET') {
    try {
      if (idOrSlug) {
        const row = await getCollectionRow(idOrSlug);
        if (!row) {
          return res.status(404).json({ error: 'Collection not found', code: 'NOT_FOUND' });
        }
        const activities = await resolveCollectionActivities(row);
        return res.status(200).json({
          collection: rowToDto(row),
          previewCount: activities.length,
        });
      }

      const rows = await listCollectionRows();
      return res.status(200).json({
        rows: rows.map(rowToDto),
        total: rows.length,
      });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'COLLECTIONS_READ_ERROR' });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  if (req.method === 'POST') {
    try {
      const row = dtoToRow(body, null);
      const allowedTypes = ['chip', 'route', 'manual'];
      if (!allowedTypes.includes(row.filter_type)) {
        return res.status(400).json({ error: 'Invalid filterType', code: 'INVALID_FILTER' });
      }

      const inserted = await supabaseRestFetch(`/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [row],
      });
      const created = inserted[0];
      return res.status(201).json({ collection: rowToDto(created) });
    } catch (err) {
      const status = err.code === 'MISSING_SLUG' ? 400
        : err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'COLLECTIONS_CREATE_ERROR' });
    }
  }

  if (req.method === 'PATCH' || req.method === 'DELETE') {
    if (!idOrSlug) {
      return res.status(400).json({ error: 'id or slug required', code: 'MISSING_ID' });
    }
    try {
      const existing = await getCollectionRow(idOrSlug);
      if (!existing) {
        return res.status(404).json({ error: 'Collection not found', code: 'NOT_FOUND' });
      }

      if (req.method === 'DELETE') {
        await supabaseRestFetch(`/rest/v1/${TABLE}?id=eq.${existing.id}`, { method: 'DELETE' });
        return res.status(200).json({ ok: true, id: existing.id });
      }

      const patch = dtoToRow(body, existing);
      delete patch.id;
      delete patch.created_at;

      const updated = await supabaseRestFetch(`/rest/v1/${TABLE}?id=eq.${existing.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: patch,
      });
      return res.status(200).json({ collection: rowToDto(updated[0]) });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'COLLECTIONS_WRITE_ERROR' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = handler;
