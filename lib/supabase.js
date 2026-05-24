function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const key = serviceKey || anonKey;
  return { url, key, serviceKey, anonKey, canWrite: !!serviceKey };
}

function restHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function supabaseRestFetch(path, { method = 'GET', headers = {}, body } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    const err = new Error('SUPABASE_URL and SUPABASE key must be set');
    err.code = 'SUPABASE_CONFIG';
    throw err;
  }

  const res = await fetch(`${url}${path}`, {
    method,
    headers: restHeaders(key, headers),
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(`Supabase ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    err.code = 'SUPABASE_ERROR';
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

async function insertSupabaseRows(table, rows, { returning = 'representation' } = {}) {
  const { canWrite } = getSupabaseConfig();
  if (!canWrite) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY required for writes');
    err.code = 'SUPABASE_WRITE_DISABLED';
    throw err;
  }

  return supabaseRestFetch(`/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      Prefer: `return=${returning}`,
    },
    body: rows,
  });
}

module.exports = {
  getSupabaseConfig,
  restHeaders,
  supabaseRestFetch,
  insertSupabaseRows,
};
