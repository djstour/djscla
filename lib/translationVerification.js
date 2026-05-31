/**
 * Translation display trust — zh locales only list when verified.
 *
 * Auto OpenAI output is never trusted until it passes automated checks AND
 * admin approval (same pattern as catalog price trust).
 */

const { extractTranslatableFields, htmlToTranslatableText } = require('./translationFields');

const DEFAULT_LANGS = ['hant', 'hans'];

const DANGLING_ENDINGS = /(?:來自|从|在|和|的|與|或|及|了|着|著|地|得|之|与|为|及|于|到|对|對|为|為)$/u;

const HTML_LIKE_FIELD = (fieldPath) => (
  fieldPath.endsWith('Html') || fieldPath.startsWith('know.')
);

function listPartCountTolerance(fieldPath, expectedParts) {
  if (fieldPath.startsWith('stop.')) return 0;
  if (HTML_LIKE_FIELD(fieldPath)) {
    if (expectedParts >= 10) return 2;
    return 1;
  }
  return 0;
}

function partCountAcceptable(fieldPath, expectedParts, actualParts) {
  if (expectedParts <= 1) return actualParts >= 1;
  const tolerance = listPartCountTolerance(fieldPath, expectedParts);
  return Math.abs(expectedParts - actualParts) <= tolerance;
}

const BLOCKED_REASONS = new Set([
  'missing_required_field',
  'stale_source_hash',
  'broken_fragment',
  'list_structure_mismatch',
  'not_admin_approved',
  'no_translation_overlay',
]);

/** Fields required before a zh locale can appear in catalog or detail. */
const REQUIRED_FIELD_PATHS = ['title', 'summary'];

function countListItemsInHtml(html) {
  const matches = String(html || '').match(/<li[\s>]/gi);
  return matches ? matches.length : 0;
}

function plainParts(text) {
  return String(text || '')
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function expectedPlainPartCount(activity, fieldPath) {
  if (fieldPath.endsWith('Html')) {
    const raw = activity[fieldPath] || '';
    const listCount = countListItemsInHtml(raw);
    if (listCount > 0) return listCount;
    return plainParts(htmlToTranslatableText(raw)).length;
  }
  return 1;
}

function lineLooksBroken(line, fieldPath = '') {
  const t = String(line || '').trim();
  if (!t || t.length < 2) return true;

  if (fieldPath.startsWith('stop.')) {
    return t.length < 2;
  }

  // Long HTML / list paragraphs: dangling-particle heuristic false-positives on zh.
  if (HTML_LIKE_FIELD(fieldPath) && t.length >= 12) {
    return false;
  }

  if (DANGLING_ENDINGS.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length >= 2 && words[words.length - 1].length === 1) return true;
  return false;
}

function fieldTranslationLooksBroken(activity, fieldPath, translatedText) {
  const text = String(translatedText || '').trim();
  if (!text) return true;

  const expectedParts = expectedPlainPartCount(activity, fieldPath);
  const parts = plainParts(text);

  if (expectedParts > 1 && !partCountAcceptable(fieldPath, expectedParts, parts.length)) {
    return true;
  }
  if (parts.some((p) => lineLooksBroken(p, fieldPath))) return true;

  if (fieldPath === 'title' && text.length > 120) return true;
  if (fieldPath === 'summary' && parts.length === 1 && lineLooksBroken(parts[0], fieldPath)) return true;

  return false;
}

function overlayEntryForField(overlay, fieldPath) {
  if (!overlay) return null;
  if (fieldPath.startsWith('stop.')) {
    const stopId = fieldPath.slice(5);
    return overlay.stops?.[stopId] || null;
  }
  return overlay[fieldPath] || null;
}

function overlayText(entry, lang) {
  if (!entry || entry[lang] == null) return '';
  return String(entry[lang]).trim();
}

function overlayMeta(entry, lang) {
  if (!entry) return null;
  return entry.meta || entry[`${lang}Meta`] || null;
}

function buildTranslationIndexFromOverlay(overlay, langs = DEFAULT_LANGS) {
  const index = new Map();
  if (!overlay || typeof overlay !== 'object') return index;

  langs.forEach((lang) => {
    Object.keys(overlay).forEach((key) => {
      if (key === 'stops' || key === 'meta') return;
      const entry = overlay[key];
      if (entry && entry[lang]) {
        index.set(`${key}:${lang}`, { text: entry[lang], meta: entry.meta || null });
      }
    });
    if (overlay.stops) {
      Object.entries(overlay.stops).forEach(([stopId, stopEntry]) => {
        if (stopEntry && stopEntry[lang]) {
          index.set(`stop.${stopId}:${lang}`, { text: stopEntry[lang], meta: stopEntry.meta || null });
        }
      });
    }
  });
  return index;
}

function requiredFieldsForActivity(activity) {
  const fields = extractTranslatableFields(activity);
  const paths = new Set(REQUIRED_FIELD_PATHS);
  fields.forEach((f) => {
    if (f.fieldPath.startsWith('stop.')) paths.add(f.fieldPath);
    if (f.fieldPath === 'description' && String(f.source || '').length > 80) {
      paths.add('description');
    }
    if (f.fieldPath.endsWith('Html') && String(f.source || '').trim()) {
      paths.add(f.fieldPath);
    }
  });
  return fields.filter((f) => paths.has(f.fieldPath));
}

/**
 * Automated translation audit for one locale.
 * @param {{ activity: object, overlay?: object, lang: string, adminApproved?: boolean }} opts
 */
function evaluateTranslationTrust({
  activity,
  overlay = null,
  lang,
  adminApproved = false,
}) {
  const checkedAt = new Date().toISOString();
  const base = {
    checkedAt,
    lang,
    verifyPolicy: 'admin_approval_required',
  };

  if (!activity || !lang || lang === 'en') {
    return { ...base, trusted: true, reason: null, message: 'English uses Bókun source' };
  }

  if (!overlay || !Object.keys(overlay).length) {
    return {
      ...base,
      trusted: false,
      reason: 'no_translation_overlay',
      message: 'No translation overlay',
      missingFields: REQUIRED_FIELD_PATHS,
      brokenFields: [],
    };
  }

  const required = requiredFieldsForActivity(activity);
  const missingFields = [];
  const staleFields = [];
  const brokenFields = [];

  required.forEach((field) => {
    const entry = overlayEntryForField(overlay, field.fieldPath);
    const text = overlayText(entry, lang);
    if (!text) {
      missingFields.push(field.fieldPath);
      return;
    }
    const meta = overlayMeta(entry, lang);
    if (meta?.sourceHash && meta.sourceHash !== field.sourceHash) {
      staleFields.push(field.fieldPath);
    }
    if (fieldTranslationLooksBroken(activity, field.fieldPath, text)) {
      brokenFields.push(field.fieldPath);
    }
  });

  if (missingFields.length) {
    return {
      ...base,
      trusted: false,
      reason: 'missing_required_field',
      message: `Missing ${missingFields.join(', ')}`,
      missingFields,
      staleFields,
      brokenFields,
    };
  }

  const stored = activity.translationDisplay?.[lang];
  const isAdminLive = adminApproved || (stored?.trusted === true && stored?.source === 'admin');
  if (isAdminLive) {
    return {
      ...base,
      trusted: true,
      source: 'admin',
      reason: null,
      message: 'Admin approved',
      missingFields,
      staleFields,
      brokenFields,
      reviewedAt: stored?.reviewedAt || checkedAt,
      reviewedBy: stored?.reviewedBy || null,
    };
  }

  if (staleFields.length) {
    return {
      ...base,
      trusted: false,
      reason: 'stale_source_hash',
      message: `Stale ${staleFields.join(', ')}`,
      missingFields,
      staleFields,
      brokenFields,
    };
  }

  if (brokenFields.length) {
    return {
      ...base,
      trusted: false,
      reason: 'broken_fragment',
      message: `Broken ${brokenFields.join(', ')}`,
      missingFields,
      staleFields,
      brokenFields,
    };
  }

  return {
    ...base,
    trusted: false,
    reason: 'not_admin_approved',
    message: 'Awaiting admin translation approval',
    missingFields,
    staleFields,
    brokenFields,
  };
}

function isTranslationDisplayFresh(entry) {
  if (!entry || !entry.checkedAt) return false;
  const ttl = Number(process.env.TRANSLATION_DISPLAY_VERIFY_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
  const age = Date.now() - new Date(entry.checkedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < ttl;
}

function isTranslationPublicModeOpen() {
  return String(process.env.TRANSLATION_PUBLIC_MODE || '').trim().toLowerCase() === 'open';
}

/** Open mode: require at least a translated title (zh UI never falls back to English). */
function hasMinimumTranslationOverlay(overlay, lang) {
  if (!overlay || !lang || lang === 'en') return false;
  const text = overlayText(overlay.title, lang);
  return text.length > 0;
}

function getTranslationPublicMeta() {
  const open = isTranslationPublicModeOpen();
  return {
    translationPublicMode: open ? 'open' : 'admin',
    translationGate: open ? 'overlay_title_required' : 'admin_approved',
  };
}

/**
 * Public gate — zh locale surfaces only when admin-approved and checks pass.
 * TRANSLATION_PUBLIC_MODE=open bypasses admin approval; still requires title overlay.
 */
function isDisplayableTranslation(activity, lang, overlay = null) {
  if (!lang || lang === 'en') return true;
  if (!activity) return false;

  if (isTranslationPublicModeOpen()) {
    return hasMinimumTranslationOverlay(overlay, lang);
  }

  const stored = activity.translationDisplay?.[lang];
  if (isTranslationDisplayFresh(stored) && stored.trusted === true) return true;
  if (isTranslationDisplayFresh(stored) && stored.trusted === false) return false;

  const live = evaluateTranslationTrust({ activity, overlay, lang });
  return live.trusted === true;
}

function applyAdminTranslationTrust(activity, lang, overlay, { note, reviewedBy } = {}) {
  const audit = evaluateTranslationTrust({
    activity,
    overlay,
    lang,
    adminApproved: false,
  });
  if (audit.brokenFields?.length || audit.missingFields?.length || audit.staleFields?.length) {
    const err = new Error(audit.message || 'Translation failed automated checks');
    err.code = 'TRANSLATION_AUDIT_FAILED';
    err.audit = audit;
    throw err;
  }

  const prev = activity.translationDisplay || {};
  return {
    ...activity,
    translationDisplay: {
      ...prev,
      [lang]: {
        ...audit,
        trusted: true,
        source: 'admin',
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewedBy || 'admin',
        note: note || null,
      },
    },
    translationUnverified: false,
  };
}

function buildTranslationDisplaySnapshot(activity, overlay, langs = DEFAULT_LANGS) {
  const out = { ...(activity.translationDisplay || {}) };
  langs.forEach((lang) => {
    const stored = activity.translationDisplay?.[lang];
    const hadAdmin = !!(stored && stored.trusted === true && stored.source === 'admin');
    const audit = evaluateTranslationTrust({
      activity,
      overlay,
      lang,
      adminApproved: hadAdmin,
    });
    if (hadAdmin && audit.trusted === true) {
      out[lang] = {
        ...audit,
        trusted: true,
        source: 'admin',
        reviewedAt: stored.reviewedAt || audit.checkedAt,
        reviewedBy: stored.reviewedBy || null,
        note: stored.note != null ? stored.note : null,
      };
      return;
    }
    out[lang] = audit;
  });
  return out;
}

function assessLocaleApprovalReadiness(activity, overlay, lang) {
  const audit = evaluateTranslationTrust({ activity, overlay, lang });
  const stored = activity.translationDisplay?.[lang];
  const live = !!(stored?.trusted === true && stored?.source === 'admin');
  const missing = audit.missingFields?.length || 0;
  const stale = audit.staleFields?.length || 0;
  const broken = audit.brokenFields?.length || 0;
  const readyToApprove = !live
    && missing === 0
    && stale === 0
    && broken === 0
    && audit.reason !== 'no_translation_overlay';
  return {
    live,
    readyToApprove,
    missing,
    stale,
    broken,
    brokenFields: audit.brokenFields || [],
    reason: audit.reason,
    message: audit.message,
  };
}

function hasAdminTranslationTrust(translationDisplay, lang) {
  const entry = translationDisplay && translationDisplay[lang];
  return !!(entry && entry.trusted === true && entry.source === 'admin');
}

function shouldPreserveTranslationDisplay(payload) {
  const td = payload && payload.translationDisplay;
  if (!td || typeof td !== 'object') return false;
  return hasAdminTranslationTrust(td, 'hant') || hasAdminTranslationTrust(td, 'hans');
}

module.exports = {
  DEFAULT_LANGS,
  BLOCKED_REASONS,
  evaluateTranslationTrust,
  isDisplayableTranslation,
  isTranslationPublicModeOpen,
  hasMinimumTranslationOverlay,
  getTranslationPublicMeta,
  isTranslationDisplayFresh,
  applyAdminTranslationTrust,
  buildTranslationDisplaySnapshot,
  assessLocaleApprovalReadiness,
  hasAdminTranslationTrust,
  shouldPreserveTranslationDisplay,
  fieldTranslationLooksBroken,
  lineLooksBroken,
  partCountAcceptable,
  buildTranslationIndexFromOverlay,
  requiredFieldsForActivity,
};
