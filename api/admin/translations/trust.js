/**
 * POST /api/admin/translations/trust
 * Body: { activityIds: string[], lang: 'hant'|'hans', trusted?: boolean, note?: string }
 *
 * Approve or revoke public zh copy after automated checks pass.
 */

const { applyAdminCors, requireAdmin } = require('../../../lib/adminAuth');
const { supabaseRestFetch } = require('../../../lib/supabase');
const { normalizeActivity } = require('../../../lib/normalizeActivity');
const { fetchActivityTranslationsOverlay } = require('../../../lib/supabaseTranslations');
const { mergeActivityOverlay } = require('../../../lib/translationOverlay');
const {
  applyAdminTranslationTrust,
  buildTranslationDisplaySnapshot,
  evaluateTranslationTrust,
} = require('../../../lib/translationVerification');

const ACTIVITY_TABLE = 'activities';

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = Array.isArray(body.activityIds)
    ? body.activityIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const lang = String(body.lang || 'hant').trim();
  const trusted = body.trusted !== false;
  const note = body.note != null ? String(body.note).trim() : '';

  if (!ids.length) {
    return res.status(400).json({
      error: 'activityIds array required',
      code: 'INVALID_TRUST_REQUEST',
    });
  }
  if (lang !== 'hant' && lang !== 'hans') {
    return res.status(400).json({
      error: 'lang must be hant or hans',
      code: 'INVALID_LANG',
    });
  }
  if (ids.length > 50) {
    return res.status(400).json({
      error: 'Maximum 50 activity IDs per request',
      code: 'TRUST_BATCH_LIMIT',
    });
  }

  const inList = ids.map((id) => `"${id}"`).join(',');
  const rows = await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=in.(${inList})&select=bokun_activity_id,bokun_payload`,
  );
  const overlays = await fetchActivityTranslationsOverlay(ids);

  const byId = new Map();
  (rows || []).forEach((row) => {
    if (row && row.bokun_activity_id != null) {
      byId.set(String(row.bokun_activity_id), row);
    }
  });

  const results = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      results.push({ id, ok: false, error: 'not_in_db' });
      continue;
    }
    try {
      const base = normalizeActivity(row.bokun_payload || {});
      const overlay = mergeActivityOverlay({}, overlays[id] || {});
      let payload;
      if (trusted) {
        payload = applyAdminTranslationTrust(base, lang, overlay, { note, reviewedBy: 'admin' });
      } else {
        const audit = evaluateTranslationTrust({ activity: base, overlay, lang });
        payload = {
          ...base,
          translationDisplay: {
            ...(base.translationDisplay || {}),
            [lang]: { ...audit, trusted: false, source: 'admin_revoked' },
          },
          translationUnverified: true,
        };
      }

      const snapshot = buildTranslationDisplaySnapshot(payload, overlay);
      payload.translationDisplay = snapshot;
      payload.translationUnverified = !snapshot.hant?.trusted && !snapshot.hans?.trusted;

      await supabaseRestFetch(
        `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { bokun_payload: payload },
        },
      );

      results.push({
        id,
        ok: true,
        lang,
        trusted: !!payload.translationDisplay?.[lang]?.trusted,
        reason: payload.translationDisplay?.[lang]?.reason || null,
      });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err.message || 'trust_failed',
        code: err.code || null,
        audit: err.audit || null,
      });
    }
  }

  return res.status(200).json({
    ok: true,
    lang,
    trusted,
    results,
  });
};
