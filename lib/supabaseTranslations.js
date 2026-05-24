const { rowsToActivityOverlay } = require('./translationOverlay');
const { getSupabaseConfig, restHeaders } = require('./supabase');

/**
 * @param {string[]} activityIds
 * @param {string[]} [langs]
 * @returns {Promise<Record<string, object>>} map activityId → overlay
 */
async function fetchActivityTranslationsOverlay(activityIds, langs = ['hant', 'hans']) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key || !activityIds.length) return {};

  const ids = [...new Set(activityIds.map(String))];
  const langList = langs.map((l) => `lang.eq.${l}`).join(',');

  const params = new URLSearchParams();
  params.set('entity_type', 'eq.activity');
  params.set('entity_id', `in.(${ids.join(',')})`);
  params.set('or', `(${langList})`);
  params.set('select', 'entity_id,field_path,lang,text,meta');

  const res = await fetch(`${url}/rest/v1/translations?${params}`, {
    headers: restHeaders(key),
  });

  const text = await res.text();
  let rows;
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    throw new Error(`Supabase translations: invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(`Supabase translations ${res.status}: ${text.slice(0, 300)}`);
  }

  return rowsToActivityOverlay(rows);
}

/**
 * @param {Array<{ entity_id: string, field_path: string, lang: string, text: string, meta: object }>} rows
 */
async function upsertTranslations(rows) {
  const { url, key, canWrite } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for writes');
  }
  if (!canWrite) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY required to upsert translations');
  }
  if (!rows.length) return { count: 0 };

  const payload = rows.map((r) => ({
    entity_type: 'activity',
    entity_id: String(r.entity_id),
    field_path: r.field_path,
    lang: r.lang,
    text: r.text,
    meta: r.meta || {},
  }));

  const res = await fetch(`${url}/rest/v1/translations`, {
    method: 'POST',
    headers: restHeaders(key, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase upsert ${res.status}: ${errText.slice(0, 400)}`);
  }

  return { count: payload.length };
}

/**
 * @param {string} activityId
 * @param {string} fieldPath
 * @param {string} lang
 */
async function fetchTranslationRow(activityId, fieldPath, lang) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) return null;

  const params = new URLSearchParams({
    entity_type: 'eq.activity',
    entity_id: `eq.${activityId}`,
    field_path: `eq.${fieldPath}`,
    lang: `eq.${lang}`,
    select: 'text,meta',
  });

  const res = await fetch(`${url}/rest/v1/translations?${params}`, {
    headers: restHeaders(key),
  });

  const data = await res.json();
  if (!res.ok || !Array.isArray(data) || !data[0]) return null;
  return data[0];
}

module.exports = {
  getSupabaseConfig,
  fetchActivityTranslationsOverlay,
  upsertTranslations,
  fetchTranslationRow,
};
