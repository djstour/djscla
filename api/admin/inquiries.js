/**
 * GET /api/admin/inquiries — paged list of checkout / concierge inquiries.
 *
 * Surfaces both forms of inquiry rows we already write to Supabase:
 *   - Concierge form leads (status='new')
 *   - Hosted-checkout redirects (status='redirected_to_bokun', has hosted_checkout_url)
 *
 * Read-only for Phase 1; Phase 2 will add status updates and notes.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch, getSupabaseConfig } = require('../../lib/supabase');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseInteger(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function countInquiries(searchParams) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return 0;
  const headParams = new URLSearchParams(searchParams);
  headParams.set('select', 'id');
  headParams.set('limit', '1');
  const res = await fetch(`${url}/rest/v1/inquiries?${headParams}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/').pop());
  return Number.isFinite(total) ? total : 0;
}

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const page = parseInteger(req.query.page, 1);
  const pageSize = Math.min(parseInteger(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const status = req.query.status && String(req.query.status).trim();

  const offset = (page - 1) * pageSize;

  const params = new URLSearchParams();
  params.set(
    'select',
    [
      'id',
      'status',
      'name',
      'email',
      'phone',
      'lang',
      'travel_start_date',
      'travel_end_date',
      'pax',
      'budget_range',
      'notes',
      'selected_trip',
      'source_page',
      'hosted_checkout_url',
      'created_at',
      'updated_at',
    ].join(',')
  );
  params.set('order', 'created_at.desc');
  params.set('limit', String(pageSize));
  params.set('offset', String(offset));

  if (status) params.append('status', `eq.${status}`);

  try {
    const countParams = new URLSearchParams(params);
    countParams.delete('limit');
    countParams.delete('offset');
    countParams.delete('order');
    const total = await countInquiries(countParams);

    const rows = await supabaseRestFetch(`/rest/v1/inquiries?${params}`);

    // Group counts so the UI can show segment filters.
    const segCounts = {};
    if (page === 1) {
      const allParams = new URLSearchParams();
      allParams.set('select', 'status');
      allParams.set('limit', '500');
      const allRows = await supabaseRestFetch(`/rest/v1/inquiries?${allParams}`);
      (allRows || []).forEach((r) => {
        const k = r.status || 'unknown';
        segCounts[k] = (segCounts[k] || 0) + 1;
      });
    }

    const list = (rows || []).map((row) => ({
      id: row.id,
      status: row.status || 'unknown',
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
    }));

    return res.status(200).json({
      page,
      pageSize,
      total,
      rows: list,
      ...(page === 1 ? { statusCounts: segCounts } : {}),
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'ADMIN_INQUIRIES_ERROR',
    });
  }
};
