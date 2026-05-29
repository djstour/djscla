const { getActivityAvailabilities } = require('../../lib/bokun');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');
}

function isIsoDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Bókun availability rows label the local date in different ways depending on
 * the endpoint shape. Prefer an explicit ISO column when present; otherwise
 * parse the embedded YYYYMMDD suffix from the row id (`startTimeId_YYYYMMDD`).
 * Falling back to `row.date` (epoch ms) is a last resort — that field is the
 * UTC midnight for the activity timezone, so it can drift by ±1 day off the
 * actual local date the vendor publishes.
 */
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

/**
 * GET /api/availability/month?activityId=&start=YYYY-MM-DD&end=YYYY-MM-DD&lang=
 *
 * Aggregates Bókun's per-start-time availability rows into a per-day summary so
 * the sidebar calendar can colour each cell as "available" vs "sold out" with
 * a single network round-trip per visible month.
 *
 * Response shape:
 *   {
 *     activityId, start, end, currency, fetchedAt,
 *     days: [{
 *       date: 'YYYY-MM-DD',
 *       hasAvailability: boolean,
 *       soldOut: boolean,
 *       slots: number,
 *       capacityRemaining: number | null,   // null = unlimited / unknown
 *     }]
 *   }
 */
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const activityId = req.query.activityId != null ? String(req.query.activityId) : '';
  const start = req.query.start;
  const end = req.query.end || start;
  const uiLang = req.query.lang || 'hant';

  if (!activityId || !isIsoDate(start) || !isIsoDate(end)) {
    return res.status(400).json({
      error: 'activityId, start (YYYY-MM-DD), end (YYYY-MM-DD) are required',
      code: 'INVALID_MONTH_REQUEST',
    });
  }

  try {
    const payload = await getActivityAvailabilities(activityId, { start, end, uiLang });
    const rows = Array.isArray(payload) ? payload : (payload && payload.availabilities) || [];

    if (req.query.debug === 'raw') {
      return res.status(200).json({
        debug: 'raw upstream',
        rowCount: rows.length,
        sample: rows.slice(0, 3),
        firstKeys: rows[0] ? Object.keys(rows[0]) : null,
      });
    }

    const byDate = new Map();
    rows.forEach((row) => {
      const d = extractRowDate(row);
      if (!d) return;
      const cur = byDate.get(d) || {
        date: d,
        slots: 0,
        available: 0,
        capacityRemaining: null,
        unlimited: false,
        times: [],
      };
      cur.slots += 1;
      const soldOut = !!(row.soldOut || row.unavailable);
      const capacityRaw = row.availabilityCount ?? row.remainingPax;
      const capacity = Number.isFinite(Number(capacityRaw)) ? Number(capacityRaw) : null;
      cur.times.push({
        startTimeId: row.startTimeId != null ? Number(row.startTimeId) : null,
        startTime: row.startTime || null,
        label: row.startTimeLabel || row.startTime || null,
        capacityRemaining: capacity,
        unlimited: !!row.unlimitedAvailability,
        soldOut,
      });
      if (!soldOut) {
        cur.available += 1;
        if (row.unlimitedAvailability) cur.unlimited = true;
        if (capacity != null && capacity >= 0) {
          cur.capacityRemaining = (cur.capacityRemaining == null) ? capacity : cur.capacityRemaining + capacity;
        }
      }
      byDate.set(d, cur);
    });

    const days = [...byDate.values()].map((d) => {
      // Stable sort by startTime when present, else by startTimeId. Lets the
      // sidebar dropdown render times in the order vendors publish.
      d.times.sort((a, b) => {
        if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        return Number(a.startTimeId || 0) - Number(b.startTimeId || 0);
      });
      return {
        date: d.date,
        hasAvailability: d.available > 0,
        soldOut: d.slots > 0 && d.available === 0,
        slots: d.slots,
        capacityRemaining: d.unlimited ? null : d.capacityRemaining,
        times: d.times,
      };
    });
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return res.status(200).json({
      activityId,
      start,
      end,
      days,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG'
      ? 503
      : (err.status >= 400 && err.status < 600 ? err.status : 502);
    return res.status(status).json({
      error: err.message,
      code: err.code || 'AVAILABILITY_MONTH_ERROR',
    });
  }
};
