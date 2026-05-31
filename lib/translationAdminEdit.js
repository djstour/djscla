/**
 * Admin translation editor — load/save overlay fields without OpenAI.
 */

const { supabaseRestFetch } = require('./supabase');
const { normalizeActivity } = require('./normalizeActivity');
const { extractTranslatableFields } = require('./translationFields');
const { fetchActivityTranslationsOverlay, upsertTranslations } = require('./supabaseTranslations');
const { mergeActivityOverlay } = require('./translationOverlay');
const { persistTranslationDisplay } = require('./persistTranslationDisplay');
const {
  assessLocaleApprovalReadiness,
  evaluateTranslationTrust,
  fieldTranslationLooksBroken,
} = require('./translationVerification');

const ACTIVITY_TABLE = 'activities';
const DEFAULT_LANGS = ['hant', 'hans'];

function truncate(text, max = 240) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function overlayTextForField(overlay, fieldPath, lang) {
  if (!overlay) return '';
  if (fieldPath.startsWith('stop.')) {
    const stopId = fieldPath.slice(5);
    const entry = overlay.stops?.[stopId];
    return entry && entry[lang] != null ? String(entry[lang]).trim() : '';
  }
  const entry = overlay[fieldPath];
  return entry && entry[lang] != null ? String(entry[lang]).trim() : '';
}

function fieldPathsForEditor(activity, overlay, langs = DEFAULT_LANGS) {
  const translatable = extractTranslatableFields(activity);
  const byPath = new Map(translatable.map((f) => [f.fieldPath, f]));
  const paths = new Set();

  langs.forEach((lang) => {
    const audit = evaluateTranslationTrust({ activity, overlay, lang });
    (audit.brokenFields || []).forEach((p) => paths.add(p));
    (audit.missingFields || []).forEach((p) => paths.add(p));
    (audit.staleFields || []).forEach((p) => paths.add(p));
  });

  ['title', 'summary'].forEach((p) => {
    if (byPath.has(p)) paths.add(p);
  });

  if (!paths.size) {
    translatable.forEach((f) => paths.add(f.fieldPath));
  }

  return [...paths]
    .filter((p) => byPath.has(p))
    .map((fieldPath) => {
      const field = byPath.get(fieldPath);
      return {
        fieldPath,
        source: field.source,
        sourcePreview: truncate(field.source),
        hant: {
          text: overlayTextForField(overlay, fieldPath, 'hant'),
          broken: fieldTranslationLooksBroken(activity, fieldPath, overlayTextForField(overlay, fieldPath, 'hant')),
        },
        hans: {
          text: overlayTextForField(overlay, fieldPath, 'hans'),
          broken: fieldTranslationLooksBroken(activity, fieldPath, overlayTextForField(overlay, fieldPath, 'hans')),
        },
      };
    });
}

async function loadActivityForEdit(bokunActivityId) {
  const id = String(bokunActivityId).trim();
  const rows = await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}&select=bokun_activity_id,bokun_payload,title_en&limit=1`,
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;

  const rawPayload = row.bokun_payload || {};
  const activity = {
    ...normalizeActivity(rawPayload),
    translationDisplay: rawPayload.translationDisplay || {},
    translationUnverified: rawPayload.translationUnverified === true,
  };

  const overlayMap = await fetchActivityTranslationsOverlay([id]);
  const overlay = mergeActivityOverlay({}, overlayMap[id] || {});

  const approval = {};
  DEFAULT_LANGS.forEach((lang) => {
    approval[lang] = assessLocaleApprovalReadiness(activity, overlay, lang);
  });

  return {
    bokunActivityId: id,
    title: activity.title || row.title_en || '',
    approval,
    fields: fieldPathsForEditor(activity, overlay),
    activity,
    overlay,
  };
}

function validateUpdates(activity, updates) {
  if (!Array.isArray(updates) || !updates.length) {
    const err = new Error('updates array required');
    err.code = 'MISSING_UPDATES';
    throw err;
  }
  const allowed = new Map(
    extractTranslatableFields(activity).map((f) => [f.fieldPath, f]),
  );
  const rows = [];
  updates.forEach((u) => {
    const fieldPath = String(u.fieldPath || '').trim();
    const lang = String(u.lang || '').trim();
    if (!fieldPath || (lang !== 'hant' && lang !== 'hans')) {
      const err = new Error('Each update needs fieldPath and lang (hant|hans)');
      err.code = 'INVALID_UPDATE';
      throw err;
    }
    const field = allowed.get(fieldPath);
    if (!field) {
      const err = new Error(`Unknown field: ${fieldPath}`);
      err.code = 'UNKNOWN_FIELD';
      throw err;
    }
    const text = u.text != null ? String(u.text).trim() : '';
    if (!text) {
      const err = new Error(`Empty text for ${fieldPath}:${lang}`);
      err.code = 'EMPTY_TEXT';
      throw err;
    }
    rows.push({
      entity_id: String(activity.id),
      field_path: fieldPath,
      lang,
      text,
      meta: {
        provider: 'admin',
        sourceHash: field.sourceHash,
        editedAt: new Date().toISOString(),
      },
    });
  });
  return rows;
}

async function saveTranslationEdits(bokunActivityId, updates) {
  const ctx = await loadActivityForEdit(bokunActivityId);
  if (!ctx) {
    const err = new Error('Activity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const rows = validateUpdates(ctx.activity, updates);
  await upsertTranslations(rows);
  await persistTranslationDisplay(ctx.bokunActivityId, ctx.activity);

  return loadActivityForEdit(bokunActivityId);
}

module.exports = {
  loadActivityForEdit,
  saveTranslationEdits,
  fieldPathsForEditor,
};
