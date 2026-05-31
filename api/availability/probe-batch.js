const { getActivityAvailabilities } = require('../../lib/bokun');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'private, max-age=60');
}

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function extractRowDate(row) {
  if (typeof row.localDate === 'string' && isIsoDate(row.localDate)) return row.localDate;
  if (typeof row.dateString === 'string' && isIsoDate(row.dateString)) return row.dateString;
  const m = String(row.id || '').match(/_(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (typeof row.date === 'number' && Number.isFinite(row.date)) {
    return new Date(row.date).toISOString().slice(0, 10);
  }
  return null;
}

function hasBookableInRange(rows, tripStart, tripEnd) {
  let bookableDays = 0;
  const seen = new Set();
  rows.forEach((row) => {
    const d = extractRowDate(row);
    if (!d || d < tripStart || d > tripEnd) return;
    const soldOut = !!(row.soldOut || row.unavailable);
    if (!soldOut && !seen.has(d)) {
      seen.add(d);
      bookableDays += 1;
    }
  });
  return { hasAvailability: bookableDays > 0, bookableDays };
}

/**
 * GET /api/availability/probe-batch?ids=1,2,3&start=&end=&lang=
 * Live availability probe for Tours rank (max 25 ids).
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const start = req.query.start;
  const end = req.query.end || start;
  const uiLang = req.query.lang || 'hant';
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (!ids.length || !isIsoDate(start) || !isIsoDate(end)) {
    return res.status(400).json({
      error: 'ids, start, end required',
      code: 'INVALID_PROBE_REQUEST',
    });
  }

  const results = Object.create(null);
  let errors = 0;

  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const payload = await getActivityAvailabilities(id, { start, end, uiLang });
      const rows = Array.isArray(payload) ? payload : (payload && payload.availabilities) || [];
      results[id] = hasBookableInRange(rows, start, end);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
    } catch (err) {
      errors += 1;
      results[id] = { hasAvailability: null, bookableDays: 0, error: err.message || 'probe_failed' };
    }
  }

  return res.status(200).json({
    start,
    end,
    probed: ids.length,
    errors,
    results,
    fetchedAt: new Date().toISOString(),
  });
};
