/**
 * Translation queue stats — scan Supabase catalog + translations (no OpenAI).
 */

const { supabaseRestFetch } = require('./supabase');
const { extractTranslatableFields } = require('./translationFields');

const ACTIVITY_TABLE = 'activities';
const DEFAULT_LANGS = ['hant', 'hans'];

function activityFromRow(row) {
  const payload = row.bokun_payload;
  if (payload && payload.id != null) return payload;
  return {
    id: row.bokun_activity_id,
    title: row.title_en || `Activity ${row.bokun_activity_id}`,
  };
}

function indexKey(entityId, fieldPath, lang) {
  return `${entityId}:${fieldPath}:${lang}`;
}

async function fetchActiveActivityRows(limit = 500) {
  const params = new URLSearchParams({
    select: 'bokun_activity_id,title_en,bokun_payload,last_synced_at,detail_synced_at',
    is_active: 'eq.true',
    order: 'updated_at.desc',
    limit: String(Math.min(Math.max(limit, 1), 500)),
  });
  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function fetchTranslationIndex(activityIds) {
  const index = new Map();
  if (!activityIds.length) return index;

  const CHUNK = 50;
  for (let i = 0; i < activityIds.length; i += CHUNK) {
    const slice = activityIds.slice(i, i + CHUNK);
    const inList = slice.join(',');
    const params = new URLSearchParams({
      entity_type: 'eq.activity',
      entity_id: `in.(${inList})`,
      select: 'entity_id,field_path,lang,text,meta',
      limit: '2000',
    });
    // eslint-disable-next-line no-await-in-loop
    const rows = await supabaseRestFetch(`/rest/v1/translations?${params}`);
    (rows || []).forEach((r) => {
      index.set(indexKey(r.entity_id, r.field_path, r.lang), r);
    });
  }

  return index;
}

function assessActivity(activity, translationIndex, langs = DEFAULT_LANGS) {
  const id = String(activity.id);
  const fields = extractTranslatableFields(activity);
  let required = 0;
  let complete = 0;
  let missing = 0;
  let stale = 0;
  const missingFields = [];
  const staleFields = [];

  fields.forEach((field) => {
    langs.forEach((lang) => {
      required += 1;
      const row = translationIndex.get(indexKey(id, field.fieldPath, lang));
      if (!row || !String(row.text || '').trim()) {
        missing += 1;
        missingFields.push(`${field.fieldPath}:${lang}`);
        return;
      }
      const storedHash = row.meta && row.meta.sourceHash;
      if (storedHash && storedHash !== field.sourceHash) {
        stale += 1;
        staleFields.push(`${field.fieldPath}:${lang}`);
        return;
      }
      complete += 1;
    });
  });

  const needsWork = missing > 0 || stale > 0;
  const percent = required > 0 ? Math.round((complete / required) * 100) : 100;

  return {
    bokunActivityId: id,
    title: activity.title || activity.title_en || id,
    fieldCount: fields.length,
    required,
    complete,
    missing,
    stale,
    missingFields,
    staleFields,
    percent,
    needsWork,
    priority: missing * 2 + stale,
  };
}

/**
 * Scan active catalog in Supabase for translation coverage / pending queue.
 */
async function scanTranslationQueue({ maxScan = 500, pendingLimit = 40, langs = DEFAULT_LANGS } = {}) {
  const rows = await fetchActiveActivityRows(maxScan);
  const activityIds = rows.map((r) => String(r.bokun_activity_id)).filter(Boolean);
  const translationIndex = await fetchTranslationIndex(activityIds);

  const assessments = rows.map((row) => assessActivity(activityFromRow(row), translationIndex, langs));

  let complete = 0;
  let partial = 0;
  let pending = 0;
  let requiredTotal = 0;
  let completeTotal = 0;

  assessments.forEach((a) => {
    requiredTotal += a.required;
    completeTotal += a.complete;
    if (!a.needsWork) complete += 1;
    else if (a.complete > 0) partial += 1;
    else pending += 1;
  });

  const pendingList = assessments
    .filter((a) => a.needsWork)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, pendingLimit);

  const maxPerRun = Number(process.env.TRANSLATION_CRON_MAX_ACTIVITIES) || 12;
  const queueDepth = assessments.filter((a) => a.needsWork).length;

  return {
    scannedAt: new Date().toISOString(),
    activeActivities: rows.length,
    langs,
    stats: {
      complete,
      partial,
      pending,
      queueDepth,
    },
    coverage: {
      requiredFields: requiredTotal,
      translatedFields: completeTotal,
      percentComplete: requiredTotal > 0
        ? Math.round((completeTotal / requiredTotal) * 100)
        : 100,
    },
    pending: pendingList,
    cron: {
      maxActivitiesPerRun: maxPerRun,
      schedule: 'every 6 hours (Vercel cron)',
      estimatedRunsToClear: queueDepth > 0
        ? Math.ceil(queueDepth / maxPerRun)
        : 0,
    },
  };
}

module.exports = {
  scanTranslationQueue,
  assessActivity,
  DEFAULT_LANGS,
};
