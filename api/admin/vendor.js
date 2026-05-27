/**
 * GET /api/admin/vendor?bokunVendorId=85
 * PATCH /api/admin/vendor — update owned vendor profile fields.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((t) => String(t).trim()).filter(Boolean);
  }
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

async function findVendor(bokunVendorId, internalId) {
  const params = new URLSearchParams({
    select: 'id,bokun_vendor_id,name,slug,summary,hero_image_url,tags,is_active,last_synced_at,contract_product_count,unique_product_count',
    limit: '1',
  });
  if (bokunVendorId) {
    params.set('bokun_vendor_id', `eq.${bokunVendorId}`);
  } else if (internalId) {
    params.set('id', `eq.${internalId}`);
  } else {
    return null;
  }
  const rows = await supabaseRestFetch(`/rest/v1/vendors?${params}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function toDto(row) {
  return {
    id: row.id,
    bokunVendorId: row.bokun_vendor_id,
    name: row.name,
    slug: row.slug,
    summary: row.summary || null,
    heroImageUrl: row.hero_image_url || null,
    tags: row.tags || [],
    isActive: row.is_active !== false,
    contractProductCount: row.contract_product_count || 0,
    uniqueProductCount: row.unique_product_count || 0,
    lastSyncedAt: row.last_synced_at || null,
  };
}

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const bokunVendorId = req.query.bokunVendorId && String(req.query.bokunVendorId).trim();
  const internalId = req.query.id && String(req.query.id).trim();

  if (req.method === 'GET') {
    try {
      const row = await findVendor(bokunVendorId, internalId);
      if (!row) {
        return res.status(404).json({ error: 'Vendor not found', code: 'VENDOR_NOT_FOUND' });
      }
      return res.status(200).json({ vendor: toDto(row) });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'ADMIN_VENDOR_ERROR' });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const targetBokun = String(body.bokunVendorId || bokunVendorId || '').trim();
  const targetInternal = body.id != null ? String(body.id) : internalId;

  try {
    const existing = await findVendor(targetBokun || null, targetInternal || null);
    if (!existing) {
      return res.status(404).json({ error: 'Vendor not found', code: 'VENDOR_NOT_FOUND' });
    }

    const patch = {};
    if (body.summary !== undefined) patch.summary = body.summary || null;
    if (body.heroImageUrl !== undefined) patch.hero_image_url = body.heroImageUrl || null;
    if (body.tags !== undefined) patch.tags = parseTags(body.tags);

    if (!Object.keys(patch).length) {
      return res.status(400).json({
        error: 'No fields to update',
        code: 'EMPTY_PATCH',
        hint: 'Send summary, heroImageUrl, and/or tags',
      });
    }

    const rows = await supabaseRestFetch(
      `/rest/v1/vendors?id=eq.${existing.id}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: patch,
      },
    );

    return res.status(200).json({
      ok: true,
      vendor: toDto(rows[0]),
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' || err.code === 'SUPABASE_WRITE_DISABLED'
      ? 503
      : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'ADMIN_VENDOR_PATCH_ERROR',
    });
  }
}

module.exports = handler;
