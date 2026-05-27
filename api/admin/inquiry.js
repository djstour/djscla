/**
 * GET /api/admin/inquiry?id=123
 * PATCH /api/admin/inquiry — follow-up status + internal notes (Phase 4).
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');

const FOLLOW_UP_STATUSES = new Set(['open', 'contacted', 'converted', 'lost', 'spam']);

function toDto(row) {
  return {
    id: row.id,
    status: row.status || 'unknown',
    followUpStatus: row.follow_up_status || 'open',
    adminNotes: row.admin_notes || null,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    lang: row.lang || null,
    travelStartDate: row.travel_start_date,
    travelEndDate: row.travel_end_date,
    pax: row.pax,
    budgetRange: row.budget_range || null,
    notes: row.notes || null,
    selectedTrip: row.selected_trip || [],
    sourcePage: row.source_page || null,
    hostedCheckoutUrl: row.hosted_checkout_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadInquiry(id) {
  const params = new URLSearchParams({
    select: '*',
    id: `eq.${id}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/inquiries?${params}`);
  return rows && rows[0] ? rows[0] : null;
}

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const id = String(req.query.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'id required', code: 'MISSING_ID' });
  }

  if (req.method === 'GET') {
    try {
      const row = await loadInquiry(id);
      if (!row) {
        return res.status(404).json({ error: 'Inquiry not found', code: 'NOT_FOUND' });
      }
      return res.status(200).json({ inquiry: toDto(row) });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'INQUIRY_READ_ERROR' });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  try {
    const existing = await loadInquiry(id);
    if (!existing) {
      return res.status(404).json({ error: 'Inquiry not found', code: 'NOT_FOUND' });
    }

    const patch = {};
    if (body.followUpStatus !== undefined) {
      const next = String(body.followUpStatus).trim();
      if (!FOLLOW_UP_STATUSES.has(next)) {
        return res.status(400).json({ error: 'Invalid followUpStatus', code: 'INVALID_STATUS' });
      }
      patch.follow_up_status = next;
    }
    if (body.adminNotes !== undefined) {
      patch.admin_notes = body.adminNotes ? String(body.adminNotes).trim() : null;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No fields to update', code: 'EMPTY_PATCH' });
    }

    const rows = await supabaseRestFetch(`/rest/v1/inquiries?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: patch,
    });

    return res.status(200).json({ ok: true, inquiry: toDto(rows[0]) });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({ error: err.message, code: err.code || 'INQUIRY_PATCH_ERROR' });
  }
}

module.exports = handler;
