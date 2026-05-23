const { getActivityById, applyQuoteCurrency, getQuoteCurrency } = require('./bokun');
const { normalizeActivity } = require('./normalizeActivity');
const { fetchAllCatalogPages } = require('./catalog');
const { extractTranslatableFields } = require('./translationFields');
const { fetchTranslationRow, upsertTranslations } = require('./supabaseTranslations');
const { translateField } = require('./openaiTranslate');

const DEFAULT_LANGS = ['hant', 'hans'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function needsTranslation(activityId, fieldPath, lang, sourceHash, force) {
  if (force) return true;
  const existing = await fetchTranslationRow(activityId, fieldPath, lang);
  if (!existing) return true;
  const storedHash = existing.meta && existing.meta.sourceHash;
  if (storedHash && storedHash !== sourceHash) return true;
  if (!existing.text || !existing.text.trim()) return true;
  return false;
}

async function activityNeedsAnyTranslation(activity, langs, force) {
  const activityId = String(activity.id);
  const fields = extractTranslatableFields(activity);
  for (const field of fields) {
    for (const lang of langs) {
      // eslint-disable-next-line no-await-in-loop
      if (await needsTranslation(activityId, field.fieldPath, lang, field.sourceHash, force)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * First N catalog activities that still need at least one field translated.
 */
async function findActivitiesNeedingSync(activities, { langs = DEFAULT_LANGS, force = false, maxActivities = 5 } = {}) {
  const pending = [];
  for (const activity of activities) {
    // eslint-disable-next-line no-await-in-loop
    if (await activityNeedsAnyTranslation(activity, langs, force)) {
      pending.push(activity);
      if (pending.length >= maxActivities) break;
    }
  }
  return pending;
}

/**
 * Translate one activity's fields and upsert to Supabase.
 */
async function syncActivityTranslations(activity, opts = {}) {
  const { langs = DEFAULT_LANGS, force = false, onProgress } = opts;
  const activityId = String(activity.id);
  const fields = extractTranslatableFields(activity);
  const upsertRows = [];
  const stats = { translated: 0, skipped: 0, errors: [] };

  for (const field of fields) {
    for (const lang of langs) {
      try {
        const should = await needsTranslation(activityId, field.fieldPath, lang, field.sourceHash, force);
        if (!should) {
          stats.skipped += 1;
          continue;
        }

        const fieldType = field.fieldPath.startsWith('stop.') ? 'itinerary stop name' : field.fieldPath;
        const { translation, notes } = await translateField({
          fieldType,
          source: field.source,
          lang,
        });

        upsertRows.push({
          entity_id: activityId,
          field_path: field.fieldPath,
          lang,
          text: translation,
          meta: {
            provider: 'openai',
            sourceHash: field.sourceHash,
            reviewedAt: new Date().toISOString(),
            notes,
          },
        });

        stats.translated += 1;
        if (onProgress) onProgress({ activityId, fieldPath: field.fieldPath, lang, status: 'translated' });

        await sleep(120);
      } catch (err) {
        stats.errors.push({
          activityId,
          fieldPath: field.fieldPath,
          lang,
          message: err.message,
        });
        if (onProgress) onProgress({ activityId, fieldPath: field.fieldPath, lang, status: 'error', error: err.message });
      }
    }
  }

  if (upsertRows.length) {
    await upsertTranslations(upsertRows);
  }

  return stats;
}

/**
 * @param {{ activityIds?: number[], limit?: number, langs?: string[], force?: boolean, uiLang?: string }} opts
 */
async function runTranslationSync(opts = {}) {
  const {
    activityIds,
    limit = 20,
    langs = DEFAULT_LANGS,
    force = false,
    uiLang = 'hant',
  } = opts;

  let activities = [];

  if (activityIds && activityIds.length) {
    const quoteCurrency = getQuoteCurrency();
    for (const id of activityIds) {
      try {
        const rawPayload = await getActivityById(id, { uiLang });
        const item = rawPayload && rawPayload.activity ? rawPayload.activity : rawPayload;
        activities.push(applyQuoteCurrency([normalizeActivity(item)], quoteCurrency)[0]);
      } catch (err) {
        activities.push(null);
      }
    }
    activities = activities.filter(Boolean);
  } else {
    const { activities: normalized } = await fetchAllCatalogPages({
      uiLang,
      pageSize: 100,
      maxItems: Math.min(limit, 2000),
    });
    activities = normalized.slice(0, limit);
  }

  const summary = {
    activities: activities.length,
    translated: 0,
    skipped: 0,
    errors: [],
  };

  for (const activity of activities) {
    const stats = await syncActivityTranslations(activity, { langs, force });
    summary.translated += stats.translated;
    summary.skipped += stats.skipped;
    summary.errors.push(...stats.errors);
  }

  return summary;
}

/**
 * Auto sync: scan full channel catalog, translate up to maxActivities that are incomplete.
 * Intended for Vercel Cron (small batches per run to respect function timeout).
 */
async function runAutoTranslationSync(opts = {}) {
  const {
    maxActivities = 5,
    langs = DEFAULT_LANGS,
    force = false,
    uiLang = 'hant',
    maxCatalogItems = 2000,
  } = opts;

  const { activities: catalog } = await fetchAllCatalogPages({
    uiLang,
    pageSize: 100,
    maxItems: maxCatalogItems,
  });

  const pending = await findActivitiesNeedingSync(catalog, { langs, force, maxActivities });

  const summary = {
    catalogSize: catalog.length,
    pendingActivities: pending.length,
    activityIds: pending.map((a) => a.id),
    translated: 0,
    skipped: 0,
    errors: [],
  };

  for (const activity of pending) {
    const stats = await syncActivityTranslations(activity, { langs, force });
    summary.translated += stats.translated;
    summary.skipped += stats.skipped;
    summary.errors.push(...stats.errors);
  }

  return summary;
}

module.exports = {
  runTranslationSync,
  runAutoTranslationSync,
  syncActivityTranslations,
  findActivitiesNeedingSync,
};
