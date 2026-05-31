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

function activityForTrustAudit(rawPayload) {
  const raw = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  return {
    ...normalizeActivity(raw),
    translationDisplay: raw.translationDisplay || {},
    translationUnverified: raw.translationUnverified === true,
  };
}

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
      const rawPayload = row.bokun_payload || {};
      const activity = activityForTrustAudit(rawPayload);
      const overlay = mergeActivityOverlay({}, overlays[id] || {});

      let translationDisplay;
      if (trusted) {
        const withTrust = applyAdminTranslationTrust(activity, lang, overlay, {
          note,
          reviewedBy: 'admin',
        });
        translationDisplay = buildTranslationDisplaySnapshot(withTrust, overlay);
      } else {
        const audit = evaluateTranslationTrust({ activity, overlay, lang });
        translationDisplay = buildTranslationDisplaySnapshot({
          ...activity,
          translationDisplay: {
            ...(activity.translationDisplay || {}),
            [lang]: { ...audit, trusted: false, source: 'admin_revoked' },
          },
        }, overlay);
      }

      const translationUnverified = !(
        translationDisplay.hant?.trusted || translationDisplay.hans?.trusted
      );

      await supabaseRestFetch(
        `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: {
            bokun_payload: {
              ...rawPayload,
              translationDisplay,
              translationUnverified,
            },
          },
        },
      );

      results.push({
        id,
        ok: true,
        lang,
        trusted: !!translationDisplay?.[lang]?.trusted,
        otherLangTrusted: lang === 'hant'
          ? !!translationDisplay?.hans?.trusted
          : !!translationDisplay?.hant?.trusted,
        reason: translationDisplay?.[lang]?.reason || null,
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
