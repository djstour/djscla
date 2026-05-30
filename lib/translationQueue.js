/**
 * Translation queue stats — scan Supabase catalog + translations (no OpenAI).
 */

const { supabaseRestFetch } = require('./supabase');
const { extractTranslatableFields } = require('./translationFields');
const { rowsToActivityOverlay } = require('./translationOverlay');
const { assessLocaleApprovalReadiness } = require('./translationVerification');

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

/** Active catalog rows from Supabase mirror (same source as Admin translation queue). */
async function loadCatalogActivitiesFromDb(limit = 500) {
  const rows = await fetchActiveActivityRows(limit);
  return rows
    .map(activityFromRow)
    .filter((a) => a && a.id != null);
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
  const PAGE = 1000;
  for (let i = 0; i < activityIds.length; i += CHUNK) {
    const slice = activityIds.slice(i, i + CHUNK);
    const inList = slice.join(',');
    let offset = 0;
    // Paginate — a 50-activity chunk can exceed 2000 rows (stops × langs).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        entity_type: 'eq.activity',
        entity_id: `in.(${inList})`,
        select: 'entity_id,field_path,lang,text,meta',
        order: 'entity_id.asc,field_path.asc,lang.asc',
        limit: String(PAGE),
        offset: String(offset),
      });
      // eslint-disable-next-line no-await-in-loop
      const rows = await supabaseRestFetch(`/rest/v1/translations?${params}`);
      const batch = Array.isArray(rows) ? rows : [];
      batch.forEach((r) => {
        index.set(indexKey(r.entity_id, r.field_path, r.lang), r);
      });
      if (batch.length < PAGE) break;
      offset += PAGE;
    }
  }

  return index;
}

function overlayForActivity(activityId, translationIndex) {
  const id = String(activityId);
  const rows = [];
  translationIndex.forEach((row) => {
    if (row && String(row.entity_id) === id) rows.push(row);
  });
  const byActivity = rowsToActivityOverlay(rows);
  return byActivity[id] || {};
}

function enrichAssessment(activity, translationIndex, langs = DEFAULT_LANGS) {
  const base = assessActivity(activity, translationIndex, langs);
  const overlay = overlayForActivity(activity.id, translationIndex);
  const approval = {
    hant: assessLocaleApprovalReadiness(activity, overlay, 'hant'),
    hans: assessLocaleApprovalReadiness(activity, overlay, 'hans'),
  };
  return {
    ...base,
    approval,
    quickApprove: approval.hant.readyToApprove || approval.hans.readyToApprove,
  };
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
async function scanTranslationQueue({
  maxScan = 500,
  pendingLimit = 40,
  approvalLimit = 100,
  langs = DEFAULT_LANGS,
} = {}) {
  const rows = await fetchActiveActivityRows(maxScan);
  const activityIds = rows.map((r) => String(r.bokun_activity_id)).filter(Boolean);
  const translationIndex = await fetchTranslationIndex(activityIds);

  const assessments = rows.map((row) => enrichAssessment(
    activityFromRow(row),
    translationIndex,
    langs,
  ));

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

  const approvalSummary = {
    liveHant: assessments.filter((a) => a.approval.hant.live).length,
    liveHans: assessments.filter((a) => a.approval.hans.live).length,
    readyHant: assessments.filter((a) => a.approval.hant.readyToApprove).length,
    readyHans: assessments.filter((a) => a.approval.hans.readyToApprove).length,
    readyBoth: assessments.filter((a) => (
      a.approval.hant.readyToApprove && a.approval.hans.readyToApprove
    )).length,
  };

  const approvalQueue = assessments
    .filter((a) => a.approval.hant.readyToApprove || a.approval.hans.readyToApprove)
    .sort((a, b) => {
      const score = (x) => (
        (x.approval.hant.readyToApprove ? 2 : 0)
        + (x.approval.hans.readyToApprove ? 2 : 0)
      );
      return score(b) - score(a) || b.priority - a.priority;
    })
    .slice(0, Math.min(Math.max(approvalLimit, 1), 200));

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
    approvalSummary,
    approvalQueue,
    cron: {
      maxActivitiesPerRun: maxPerRun,
      schedule: 'every 15 minutes (Vercel cron, 12h SLA)',
      estimatedRunsToClear: queueDepth > 0
        ? Math.ceil(queueDepth / maxPerRun)
        : 0,
    },
  };
}

/**
 * Flat gap report — missing / stale translations and broken zh copy (blocks approval).
 */
async function scanTranslationGaps({ maxScan = 500, langs = DEFAULT_LANGS } = {}) {
  const rows = await fetchActiveActivityRows(maxScan);
  const activityIds = rows.map((r) => String(r.bokun_activity_id)).filter(Boolean);
  const translationIndex = await fetchTranslationIndex(activityIds);

  const assessments = rows.map((row) => enrichAssessment(
    activityFromRow(row),
    translationIndex,
    langs,
  ));

  const gaps = [];
  const byField = new Map();
  let missingCount = 0;
  let staleCount = 0;
  let brokenCount = 0;

  function bumpField(fieldPath) {
    const key = String(fieldPath).split(':')[0];
    byField.set(key, (byField.get(key) || 0) + 1);
  }

  assessments.forEach((a) => {
    a.missingFields.forEach((field) => {
      missingCount += 1;
      bumpField(field);
      gaps.push({
        bokunActivityId: a.bokunActivityId,
        title: a.title,
        type: 'missing',
        field,
      });
    });
    a.staleFields.forEach((field) => {
      staleCount += 1;
      bumpField(field);
      gaps.push({
        bokunActivityId: a.bokunActivityId,
        title: a.title,
        type: 'stale',
        field,
      });
    });
    langs.forEach((lang) => {
      const ap = a.approval[lang];
      if (!ap || !ap.brokenFields?.length) return;
      ap.brokenFields.forEach((fieldPath) => {
        const field = `${fieldPath}:${lang}`;
        brokenCount += 1;
        bumpField(field);
        gaps.push({
          bokunActivityId: a.bokunActivityId,
          title: a.title,
          type: 'broken',
          field,
        });
      });
    });
  });

  gaps.sort((x, y) => (
    String(x.bokunActivityId).localeCompare(String(y.bokunActivityId))
    || x.type.localeCompare(y.type)
    || x.field.localeCompare(y.field)
  ));

  const activityIdsWithGaps = [...new Set(gaps.map((g) => g.bokunActivityId))];

  return {
    scannedAt: new Date().toISOString(),
    activeActivities: rows.length,
    langs,
    summary: {
      missing: missingCount,
      stale: staleCount,
      broken: brokenCount,
      total: gaps.length,
      activitiesWithGaps: activityIdsWithGaps.length,
    },
    byField: [...byField.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fieldPath, count]) => ({ fieldPath, count })),
    gaps,
    activityIdsWithGaps,
  };
}

module.exports = {
  scanTranslationQueue,
  scanTranslationGaps,
  assessActivity,
  activityFromRow,
  fetchActiveActivityRows,
  loadCatalogActivitiesFromDb,
  DEFAULT_LANGS,
};
