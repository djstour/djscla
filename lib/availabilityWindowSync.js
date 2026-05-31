/**
 * Sync lightweight availability windows into activities.availability_window.
 */

const { getActivityAvailabilities } = require('./bokun');
const { supabaseRestFetch } = require('./supabase');

const ACTIVITY_TABLE = 'activities';
const DEFAULT_WINDOW_DAYS = Number(process.env.AVAILABILITY_WINDOW_DAYS) || 90;

function isoDateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractRowDate(row) {
  if (typeof row.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.localDate)) return row.localDate;
  if (typeof row.dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.dateString)) return row.dateString;
  const m = String(row.id || '').match(/_(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (typeof row.date === 'number' && Number.isFinite(row.date)) {
    return new Date(row.date).toISOString().slice(0, 10);
  }
  return null;
}

function aggregateBookableDates(rows) {
  const byDate = new Map();
  rows.forEach((row) => {
    const d = extractRowDate(row);
    if (!d) return;
    const soldOut = !!(row.soldOut || row.unavailable);
    const cur = byDate.get(d) || { available: 0, slots: 0 };
    cur.slots += 1;
    if (!soldOut) cur.available += 1;
    byDate.set(d, cur);
  });
  return [...byDate.entries()]
    .filter(([, v]) => v.available > 0)
    .map(([date]) => date)
    .sort();
}

/**
 * Fetch availabilities and PATCH activities.availability_window for one SKU.
 */
async function syncAvailabilityWindowForActivity(bokunActivityId, opts = {}) {
  const id = String(bokunActivityId);
  const windowDays = Number(opts.windowDays) || DEFAULT_WINDOW_DAYS;
  const rangeStart = opts.start || isoDateOffset(0);
  const rangeEnd = opts.end || isoDateOffset(windowDays);

  const payload = await getActivityAvailabilities(id, {
    start: rangeStart,
    end: rangeEnd,
    uiLang: opts.uiLang || 'en',
  });
  const rows = Array.isArray(payload) ? payload : (payload && payload.availabilities) || [];
  const bookableDates = aggregateBookableDates(rows);

  const availabilityWindow = {
    syncedAt: new Date().toISOString(),
    rangeStart,
    rangeEnd,
    bookableDates,
    bookableCount: bookableDates.length,
  };

  const params = new URLSearchParams({
    bokun_activity_id: `eq.${id}`,
  });
  await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: { availability_window: availabilityWindow },
  });

  return availabilityWindow;
}

function activityHasAvailabilityInRange(window, tripStart, tripEnd) {
  if (!tripStart || !tripEnd) return null;
  if (!window || !Array.isArray(window.bookableDates) || !window.bookableDates.length) {
    return null;
  }
  return window.bookableDates.some((d) => d >= tripStart && d <= tripEnd);
}

function countAvailabilityInRange(window, tripStart, tripEnd) {
  if (!window?.bookableDates?.length || !tripStart || !tripEnd) return 0;
  return window.bookableDates.filter((d) => d >= tripStart && d <= tripEnd).length;
}

async function syncAvailabilityWindowBatch({ limit = 25, uiLang = 'en' } = {}) {
  const params = new URLSearchParams({
    select: 'bokun_activity_id,detail_synced_at,availability_window',
    is_active: 'eq.true',
    order: 'detail_synced_at.desc.nullslast',
    limit: String(Math.min(Math.max(limit, 1), 60)),
  });
  const rows = await supabaseRestFetch(`/rest/v1/${ACTIVITY_TABLE}?${params}`);
  const list = Array.isArray(rows) ? rows : [];

  let updated = 0;
  let errors = 0;
  for (const row of list) {
    const id = row && row.bokun_activity_id;
    if (!id) continue;
    const window = row.availability_window;
    const stale = !window?.syncedAt
      || (Date.now() - new Date(window.syncedAt).getTime() > 36 * 3600 * 1000);
    if (!stale) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await syncAvailabilityWindowForActivity(id, { uiLang });
      updated += 1;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      errors += 1;
      console.warn('[availability-window]', id, err.message || err);
    }
  }

  return { scanned: list.length, updated, errors };
}

module.exports = {
  syncAvailabilityWindowForActivity,
  activityHasAvailabilityInRange,
  countAvailabilityInRange,
  aggregateBookableDates,
  syncAvailabilityWindowBatch,
};
