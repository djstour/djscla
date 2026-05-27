/**
 * GET /api/admin/overview — dashboard summary for the admin console.
 *
 * Aggregates from Supabase only (no Bókun calls); a separate "Trigger sync"
 * action is exposed in Phase 2. Phase 1 is read-only on purpose.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');
const { envHealth } = require('../../lib/adminHealth');

async function countActivities() {
  // PostgREST: HEAD with Prefer: count=exact returns the row count in
  // the Content-Range header. We request a tiny window to keep payload small.
  const { url, key } = require('../../lib/supabase').getSupabaseConfig();
  if (!url || !key) {
    const e = new Error('SUPABASE not configured');
    e.code = 'SUPABASE_CONFIG';
    throw e;
  }
  async function countWhere(filter) {
    const params = new URLSearchParams({ select: 'id', limit: '1' });
    if (filter) params.append(filter.col, filter.expr);
    const res = await fetch(`${url}/rest/v1/activities?${params}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    });
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/').pop());
    return Number.isFinite(total) ? total : 0;
  }

  const total = await countWhere(null);
  const active = await countWhere({ col: 'is_active', expr: 'eq.true' });
  const inactive = total - active;
  return { total, active, inactive };
}

async function vendorBreakdown() {
  const params = new URLSearchParams({
    select: 'id,bokun_vendor_id,name,is_active,last_synced_at,contract_product_count,unique_product_count',
    order: 'name.asc',
  });
  const rows = await supabaseRestFetch(`/rest/v1/vendors?${params}`);
  return (rows || []).map((v) => ({
    id: v.id,
    bokunVendorId: v.bokun_vendor_id,
    name: v.name,
    isActive: v.is_active !== false,
    contractProductCount: v.contract_product_count || 0,
    uniqueProductCount: v.unique_product_count || 0,
    lastSyncedAt: v.last_synced_at || null,
  }));
}

async function lastSyncTime() {
  const params = new URLSearchParams({
    select: 'last_synced_at',
    order: 'last_synced_at.desc.nullslast',
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
  return rows && rows[0] ? rows[0].last_synced_at : null;
}

async function marketingStats() {
  const { url, key } = require('../../lib/supabase').getSupabaseConfig();
  if (!url || !key) return { collections: 0, collectionsActive: 0 };
  async function countTable(table, extra) {
    const params = new URLSearchParams({ select: 'id', limit: '1' });
    if (extra) Object.entries(extra).forEach(([k, v]) => params.append(k, v));
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/').pop());
    return Number.isFinite(total) ? total : 0;
  }
  const collections = await countTable('homepage_collections');
  const collectionsActive = await countTable('homepage_collections', { is_active: 'eq.true' });
  return { collections, collectionsActive };
}

async function inquiryStats() {
  const { url, key } = require('../../lib/supabase').getSupabaseConfig();
  if (!url || !key) return { total: 0, last7d: 0 };
  async function countWhere(extra) {
    const params = new URLSearchParams({ select: 'id', limit: '1' });
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => params.append(k, v));
    }
    const res = await fetch(`${url}/rest/v1/inquiries?${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    const range = res.headers.get('content-range') || '';
    const total = Number(range.split('/').pop());
    return Number.isFinite(total) ? total : 0;
  }
  const total = await countWhere();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const last7d = await countWhere({ created_at: `gte.${sevenDaysAgo}` });
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const abandoned = await countWhere({
    status: 'eq.redirected_to_bokun',
    follow_up_status: 'in.(open,contacted)',
    created_at: `lt.${cutoff}`,
  });
  return { total, last7d, abandoned };
}

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  try {
    const [activities, vendors, lastSync, inquiries, marketing] = await Promise.all([
      countActivities(),
      vendorBreakdown(),
      lastSyncTime(),
      inquiryStats(),
      marketingStats(),
    ]);

    const contractTotal = vendors.reduce((sum, v) => sum + (v.contractProductCount || 0), 0);
    const uniqueTotal = vendors.reduce((sum, v) => sum + (v.uniqueProductCount || 0), 0);

    return res.status(200).json({
      activities,
      vendors,
      totals: {
        contractTotal,
        uniqueTotal,
      },
      lastSyncedAt: lastSync,
      inquiries,
      marketing,
      env: envHealth(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'ADMIN_OVERVIEW_ERROR',
    });
  }
};
