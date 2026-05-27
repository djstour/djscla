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

  const deduped = new Map();
  rows.forEach((r) => {
    const entityId = String(r.entity_id);
    const key = `activity|${entityId}|${r.field_path}|${r.lang}`;
    deduped.set(key, {
      entity_type: 'activity',
      entity_id: entityId,
      field_path: r.field_path,
      lang: r.lang,
      text: r.text,
      meta: r.meta || {},
    });
  });
  const payload = [...deduped.values()];

  const upsertUrl = `${url}/rest/v1/translations?on_conflict=entity_type,entity_id,field_path,lang`;

  async function patchByUniqueKey(row) {
    const params = new URLSearchParams({
      entity_type: `eq.${row.entity_type}`,
      entity_id: `eq.${row.entity_id}`,
      field_path: `eq.${row.field_path}`,
      lang: `eq.${row.lang}`,
    });
    const patchRes = await fetch(`${url}/rest/v1/translations?${params.toString()}`, {
      method: 'PATCH',
      headers: restHeaders(key, {
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({
        text: row.text,
        meta: row.meta || {},
      }),
    });
    if (!patchRes.ok) {
      const patchErr = await patchRes.text();
      throw new Error(`Supabase patch ${patchRes.status}: ${patchErr.slice(0, 400)}`);
    }
    const patched = await patchRes.json();
    return Array.isArray(patched) && patched.length > 0;
  }

  async function upsertSingleWithFallback(row) {
    const single = await fetch(upsertUrl, {
      method: 'POST',
      headers: restHeaders(key, {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([row]),
    });
    if (single.ok) return;

    // If insert/upsert still conflicts, update by unique key directly.
    if (single.status === 409) {
      const updated = await patchByUniqueKey(row);
      if (updated) return;

      // Row may not exist yet (race): try one plain insert, then final patch.
      const insertRes = await fetch(`${url}/rest/v1/translations`, {
        method: 'POST',
        headers: restHeaders(key, {
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify([row]),
      });
      if (insertRes.ok) return;

      if (insertRes.status === 409) {
        const updatedAfterRace = await patchByUniqueKey(row);
        if (updatedAfterRace) return;
      }

      const insertErr = await insertRes.text();
      throw new Error(`Supabase insert(single) ${insertRes.status}: ${insertErr.slice(0, 400)}`);
    }

    const singleErr = await single.text();
    throw new Error(`Supabase upsert(single) ${single.status}: ${singleErr.slice(0, 400)}`);
  }

  const res = await fetch(upsertUrl, {
    method: 'POST',
    headers: restHeaders(key, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Guardrail: if a large batch still trips conflict semantics, retry row-by-row
    // so cron can continue instead of failing the whole run.
    if (res.status === 409 && payload.length > 1) {
      for (const row of payload) {
        // eslint-disable-next-line no-await-in-loop
        await upsertSingleWithFallback(row);
      }
      return { count: payload.length, retriedSingleRows: true };
    }
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
