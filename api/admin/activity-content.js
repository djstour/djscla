/**
 * GET /api/admin/activity-content?bokunActivityId=18571
 * PATCH /api/admin/activity-content — editorial fields + translations overlay.
 */

const { applyAdminCors, requireAdmin } = require('../../lib/adminAuth');
const { supabaseRestFetch } = require('../../lib/supabase');
const { fetchActivityTranslationsOverlay } = require('../../lib/supabaseTranslations');
const { upsertTranslations } = require('../../lib/supabaseTranslations');

const TRANSLATION_FIELDS = ['title', 'summary', 'description'];
const LANGS = ['hant', 'hans', 'en'];

function overlayToEditor(overlay) {
  const out = {};
  TRANSLATION_FIELDS.forEach((field) => {
    out[field] = {};
    LANGS.forEach((lang) => {
      const entry = overlay && overlay[field];
      out[field][lang] = (entry && entry[lang]) || '';
    });
  });
  return out;
}

function buildTranslationRows(bokunActivityId, translations) {
  const rows = [];
  if (!translations || typeof translations !== 'object') return rows;

  TRANSLATION_FIELDS.forEach((fieldPath) => {
    const byLang = translations[fieldPath];
    if (!byLang || typeof byLang !== 'object') return;
    LANGS.forEach((lang) => {
      const text = byLang[lang];
      if (text == null || String(text).trim() === '') return;
      rows.push({
        entity_id: String(bokunActivityId),
        field_path: fieldPath,
        lang,
        text: String(text).trim(),
        meta: { provider: 'admin', reviewedAt: new Date().toISOString() },
      });
    });
  });

  return rows;
}

async function loadActivityRow(bokunActivityId) {
  const params = new URLSearchParams({
    select: [
      'id',
      'bokun_activity_id',
      'slug',
      'title_en',
      'summary_en',
      'description_en',
      'cover_image_owned_url',
      'cover_image_url',
      'is_featured',
      'featured_rank',
      'is_active',
      'last_synced_at',
    ].join(','),
    bokun_activity_id: `eq.${bokunActivityId}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const bokunActivityId = String(
    (req.method === 'GET' ? req.query.bokunActivityId : null)
    || '',
  ).trim();

  if (req.method === 'GET') {
    if (!bokunActivityId) {
      return res.status(400).json({ error: 'bokunActivityId required', code: 'MISSING_ID' });
    }
    try {
      const row = await loadActivityRow(bokunActivityId);
      if (!row) {
        return res.status(404).json({ error: 'Activity not found', code: 'NOT_FOUND' });
      }

      const overlay = await fetchActivityTranslationsOverlay([bokunActivityId], LANGS);

      return res.status(200).json({
        bokunActivityId,
        english: {
          title: row.title_en || '',
          summary: row.summary_en || '',
          description: row.description_en || '',
        },
        owned: {
          coverImageOwnedUrl: row.cover_image_owned_url || null,
          coverImageBokunUrl: row.cover_image_url || null,
        },
        featured: {
          isFeatured: row.is_featured === true,
          featuredRank: row.featured_rank != null ? Number(row.featured_rank) : null,
        },
        isActive: row.is_active !== false,
        translations: overlayToEditor(overlay[bokunActivityId]),
      });
    } catch (err) {
      const status = err.code === 'SUPABASE_CONFIG' ? 503 : 500;
      return res.status(status).json({ error: err.message, code: err.code || 'CONTENT_READ_ERROR' });
    }
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const id = String(body.bokunActivityId || bokunActivityId || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'bokunActivityId required', code: 'MISSING_ID' });
  }

  try {
    const existing = await loadActivityRow(id);
    if (!existing) {
      return res.status(404).json({ error: 'Activity not found', code: 'NOT_FOUND' });
    }

    const patch = {};
    if (body.isFeatured !== undefined) patch.is_featured = !!body.isFeatured;
    if (body.featuredRank !== undefined) {
      const rank = body.featuredRank;
      patch.featured_rank = rank === null || rank === '' ? null : Number(rank);
    }
    if (body.coverImageOwnedUrl !== undefined) {
      patch.cover_image_owned_url = body.coverImageOwnedUrl || null;
    }

    let updatedRow = existing;
    if (Object.keys(patch).length) {
      const rows = await supabaseRestFetch(
        `/rest/v1/activities?id=eq.${existing.id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: patch,
        },
      );
      updatedRow = rows[0];
    }

    const translationRows = buildTranslationRows(id, body.translations);
    let translationCount = 0;
    if (translationRows.length) {
      const result = await upsertTranslations(translationRows);
      translationCount = result.count || translationRows.length;
    }

    const overlay = await fetchActivityTranslationsOverlay([id], LANGS);

    return res.status(200).json({
      ok: true,
      bokunActivityId: id,
      translationCount,
      featured: {
        isFeatured: updatedRow.is_featured === true,
        featuredRank: updatedRow.featured_rank != null ? Number(updatedRow.featured_rank) : null,
      },
      owned: {
        coverImageOwnedUrl: updatedRow.cover_image_owned_url || null,
      },
      translations: overlayToEditor(overlay[id]),
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_CONFIG' || err.code === 'SUPABASE_WRITE_DISABLED'
      ? 503
      : 500;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CONTENT_PATCH_ERROR',
    });
  }
}

module.exports = handler;
