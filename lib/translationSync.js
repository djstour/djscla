const { getActivityById, getQuoteCurrency } = require('./bokun');
const { normalizeActivity } = require('./normalizeActivity');
const { fetchAllCatalogPages } = require('./catalog');
const { scanTranslationQueue, loadCatalogActivitiesFromDb } = require('./translationQueue');
const { extractTranslatableFields } = require('./translationFields');
const { fetchTranslationRow, upsertTranslations } = require('./supabaseTranslations');
const { translateField } = require('./openaiTranslate');

const DEFAULT_LANGS = ['hant', 'hans'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function classifyTranslationError(err) {
  const code = String(err && err.code ? err.code : '');
  const transientByMeta = !!(err && err.meta && err.meta.transient);
  if (transientByMeta) return 'transient';
  if (code === 'LENGTH_SANITY' || code === 'OPENAI_CONFIG' || code === 'OPENAI_EMPTY_TRANSLATION') {
    return 'permanent';
  }
  if (code.startsWith('OPENAI_HTTP_')) {
    const status = Number(code.replace('OPENAI_HTTP_', '')) || 0;
    if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return 'transient';
  }
  if (code === 'OPENAI_INVALID_JSON' || code === 'OPENAI_INVALID_JSON_PAYLOAD') return 'transient';
  return 'permanent';
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
  const {
    langs = DEFAULT_LANGS,
    force = false,
    onProgress,
    maxTranslations = null,
    deadlineAtMs = null,
  } = opts;
  const activityId = String(activity.id);
  const fields = extractTranslatableFields(activity);
  const upsertRows = [];
  const dlqThreshold = Math.min(Math.max(Number(process.env.TRANSLATION_DLQ_THRESHOLD) || 3, 1), 10);
  const failCounts = new Map();
  const stats = {
    translated: 0,
    skipped: 0,
    errors: [],
    hitLimit: false,
    transientErrors: 0,
    permanentErrors: 0,
    dlq: [],
  };

  outer: for (const field of fields) {
    for (const lang of langs) {
      if (deadlineAtMs && Date.now() >= deadlineAtMs) {
        stats.hitLimit = true;
        break outer;
      }
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

        if (maxTranslations != null && stats.translated >= maxTranslations) {
          stats.hitLimit = true;
          break outer;
        }

        await sleep(120);
      } catch (err) {
        const key = `${activityId}:${field.fieldPath}:${lang}`;
        const failCount = (failCounts.get(key) || 0) + 1;
        failCounts.set(key, failCount);
        const type = classifyTranslationError(err);
        if (type === 'transient') stats.transientErrors += 1;
        else stats.permanentErrors += 1;
        const attempts = Number(err && err.meta && err.meta.attempts) || 1;
        const maxAttempts = Number(err && err.meta && err.meta.maxAttempts) || attempts;
        const message = type === 'transient'
          ? `Transient upstream error after ${attempts}/${maxAttempts} attempts`
          : (err.message || 'Translation error');
        stats.errors.push({
          activityId,
          fieldPath: field.fieldPath,
          lang,
          type,
          code: err.code || 'TRANSLATION_ERROR',
          attempts,
          maxAttempts,
          failCount,
          message,
        });
        if (failCount >= dlqThreshold) {
          stats.dlq.push({
            activityId,
            fieldPath: field.fieldPath,
            lang,
            type,
            failCount,
            code: err.code || 'TRANSLATION_ERROR',
            message,
          });
        }
        if (onProgress) onProgress({ activityId, fieldPath: field.fieldPath, lang, status: 'error', error: err.message });
      }
    }
  }

  if (upsertRows.length) {
    await upsertTranslations(upsertRows);
  }

  stats.complete = !(await activityNeedsAnyTranslation(activity, langs, force));
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
    maxTranslations = null,
  } = opts;

  let activities = [];

  if (activityIds && activityIds.length) {
    for (const id of activityIds) {
      try {
        const rawPayload = await getActivityById(id, { uiLang });
        const item = rawPayload && rawPayload.activity ? rawPayload.activity : rawPayload;
        activities.push(normalizeActivity(item));
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
    transientErrors: 0,
    permanentErrors: 0,
    dlq: [],
    complete: true,
  };

  for (const activity of activities) {
    const stats = await syncActivityTranslations(activity, { langs, force, maxTranslations });
    summary.translated += stats.translated;
    summary.skipped += stats.skipped;
    summary.errors.push(...stats.errors);
    summary.transientErrors += stats.transientErrors || 0;
    summary.permanentErrors += stats.permanentErrors || 0;
    summary.dlq.push(...(stats.dlq || []));
    if (!stats.complete) summary.complete = false;
  }

  return summary;
}

/**
 * Auto sync: Supabase catalog queue (aligned with Admin) — translate up to maxActivities
 * with missing/stale fields. Intended for Vercel Cron (small batches per run).
 */
async function runAutoTranslationSync(opts = {}) {
  const {
    maxActivities = 5,
    maxTranslationsPerActivity = null,
    langs = DEFAULT_LANGS,
    force = false,
    maxCatalogItems = 2000,
    deadlineAtMs = null,
  } = opts;

  const maxScan = Math.min(Math.max(maxCatalogItems, 1), 500);
  const queue = await scanTranslationQueue({
    maxScan,
    pendingLimit: maxActivities,
    langs,
  });

  const catalog = await loadCatalogActivitiesFromDb(maxScan);
  const byId = new Map(catalog.map((a) => [String(a.id), a]));

  const pending = [];
  if (force) {
    const need = await findActivitiesNeedingSync(catalog, { langs, force, maxActivities });
    pending.push(...need);
  } else {
    (queue.pending || []).forEach((item) => {
      const activity = byId.get(String(item.bokunActivityId));
      if (activity) pending.push(activity);
    });
  }

  const summary = {
    source: 'supabase',
    catalogSize: queue.activeActivities,
    queueDepth: queue.stats.queueDepth,
    coveragePercent: queue.coverage.percentComplete,
    pendingActivities: pending.length,
    activityIds: pending.map((a) => a.id),
    translated: 0,
    skipped: 0,
    errors: [],
    transientErrors: 0,
    permanentErrors: 0,
    dlq: [],
  };

  for (const activity of pending) {
    if (deadlineAtMs && Date.now() >= deadlineAtMs) break;
    const stats = await syncActivityTranslations(activity, {
      langs,
      force,
      maxTranslations: maxTranslationsPerActivity,
      deadlineAtMs,
    });
    summary.translated += stats.translated;
    summary.skipped += stats.skipped;
    summary.errors.push(...stats.errors);
    summary.transientErrors += stats.transientErrors || 0;
    summary.permanentErrors += stats.permanentErrors || 0;
    summary.dlq.push(...(stats.dlq || []));
  }

  return summary;
}

module.exports = {
  runTranslationSync,
  runAutoTranslationSync,
  syncActivityTranslations,
  findActivitiesNeedingSync,
};
