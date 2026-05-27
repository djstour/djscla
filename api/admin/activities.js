/**
 * GET /api/admin/activities — paged list of activities for the admin console.
 *
 * Differs from /api/catalog/activities in that:
 *   - includes inactive (deactivated) rows by default
 *   - returns trimmed columns (no full bokun_payload) for fast list rendering
 *   - exposes vendor name + sync timestamps for ops triage
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch, getSupabaseConfig } = require('../../lib/supabase');

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function parseInteger(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function countWhere(searchParams) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return 0;
  const headParams = new URLSearchParams(searchParams);
  headParams.set('select', 'id');
  headParams.set('limit', '1');
  const res = await fetch(`${url}/rest/v1/activities?${headParams}`, {
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
  const vendorId = req.query.vendorId && String(req.query.vendorId).trim();
  const status = String(req.query.status || 'all').trim().toLowerCase();
  const q = req.query.q && String(req.query.q).trim();

  const offset = (page - 1) * pageSize;

  // Look up vendors first so we can render names + bokun ids without a join,
  // and so we can filter by vendor numerically when given a Bókun vendor id.
  const vendors = await supabaseRestFetch(
    '/rest/v1/vendors?select=id,bokun_vendor_id,name'
  );
  const vendorByInternalId = new Map();
  const vendorByBokunId = new Map();
  (vendors || []).forEach((v) => {
    vendorByInternalId.set(String(v.id), v);
    if (v.bokun_vendor_id != null) vendorByBokunId.set(String(v.bokun_vendor_id), v);
  });

  const params = new URLSearchParams();
  params.set(
    'select',
    [
      'id',
      'bokun_activity_id',
      'vendor_id',
      'slug',
      'title_en',
      'price_from',
      'currency',
      'is_active',
      'last_synced_at',
      'updated_at',
    ].join(',')
  );
  params.set('order', 'updated_at.desc');
  params.set('limit', String(pageSize));
  params.set('offset', String(offset));

  if (status === 'active') params.append('is_active', 'eq.true');
  else if (status === 'inactive') params.append('is_active', 'eq.false');

  if (vendorId) {
    let internalId = vendorByBokunId.get(vendorId)?.id;
    if (!internalId) internalId = vendorByInternalId.get(vendorId)?.id;
    if (internalId) params.append('vendor_id', `eq.${internalId}`);
    else {
      // Unknown vendor id → return empty result instead of leaking all rows.
      return res.status(200).json({
        page, pageSize, total: 0, rows: [],
        meta: { warning: `Unknown vendorId: ${vendorId}` },
      });
    }
  }

  if (q) {
    // Simple ilike match on the English title; FTS lives in /api/catalog.
    const safe = q.replace(/[,%]/g, '');
    params.append('title_en', `ilike.*${safe}*`);
  }

  try {
    // Count first (without limit/offset) to power pagination UI.
    const countParams = new URLSearchParams(params);
    countParams.delete('limit');
    countParams.delete('offset');
    countParams.delete('order');
    const total = await countWhere(countParams);

    const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);

    const list = (rows || []).map((row) => {
      const vendor = row.vendor_id != null
        ? vendorByInternalId.get(String(row.vendor_id))
        : null;
      return {
        id: row.id,
        bokunActivityId: row.bokun_activity_id,
        slug: row.slug,
        title: row.title_en,
        priceFrom: row.price_from != null ? Number(row.price_from) : null,
        currency: row.currency || 'USD',
        isActive: row.is_active !== false,
        lastSyncedAt: row.last_synced_at,
        updatedAt: row.updated_at,
        vendor: vendor
          ? { id: vendor.id, bokunVendorId: vendor.bokun_vendor_id, name: vendor.name }
          : null,
      };
    });

    return res.status(200).json({
      page,
      pageSize,
      total,
      rows: list,
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'ADMIN_ACTIVITIES_ERROR',
    });
  }
};
