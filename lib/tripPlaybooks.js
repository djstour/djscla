/**
 * Trip playbooks — Hero bundles resolved to activity IDs for rank boost.
 */

const { supabaseRestFetch } = require('./supabase');
const {
  readActivityRows,
  rowsToActivities,
  fetchActivitiesByBokunIds,
} = require('./catalogDb');

const TABLE = 'trip_playbooks';

/** Matches seasonFacetHintsFromTripSearch — aurora season ≈ Sep–Apr. */
const PLAYBOOK_FALLBACK_META = {
  'winter-aurora-gc': { seasonWindow: 'winter' },
  'summer-gc-south': { seasonWindow: 'summer' },
  'day-tours-reykjavik': { hubIds: ['reykjavik'] },
};

function monthFromIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const month = new Date(`${iso}T12:00:00`).getUTCMonth() + 1;
  return Number.isFinite(month) ? month : null;
}

function isWinterTripMonth(month) {
  if (month == null) return null;
  return month >= 9 || month <= 4;
}

function playbookMeta(row) {
  const fallback = PLAYBOOK_FALLBACK_META[row.slug] || {};
  const hubIds = Array.isArray(row.hub_ids) && row.hub_ids.length
    ? row.hub_ids.map(String)
    : fallback.hubIds || null;
  return {
    seasonWindow: row.season_window || fallback.seasonWindow || null,
    hubIds,
  };
}

function playbookMatchesTripContext(row, { tripNights = null, tripMonth = null, hubId = null } = {}) {
  const meta = playbookMeta(row);

  if (tripMonth != null) {
    if (meta.seasonWindow === 'winter' && !isWinterTripMonth(tripMonth)) return false;
    if (meta.seasonWindow === 'summer' && isWinterTripMonth(tripMonth)) return false;
  }

  if (meta.hubIds && hubId && !meta.hubIds.includes(String(hubId))) return false;

  const nights = tripNights != null ? Number(tripNights) : null;
  if (nights != null && Number.isFinite(nights)) {
    if (row.min_nights != null && nights < Number(row.min_nights)) return false;
    if (row.max_nights != null && nights > Number(row.max_nights)) return false;
  }

  return true;
}

function playbookFitScore(row, { tripNights = null, hubId = null } = {}) {
  const meta = playbookMeta(row);
  let score = Number(row.sort_order) || 0;

  if (tripNights != null && Number.isFinite(tripNights)) {
    const min = row.min_nights != null ? Number(row.min_nights) : null;
    const max = row.max_nights != null ? Number(row.max_nights) : null;
    if (min != null && max != null) {
      const mid = (min + max) / 2;
      score += 20 - Math.min(Math.abs(tripNights - mid), 20);
    } else if (min != null && tripNights >= min) {
      score += 10;
    }
  }

  if (meta.hubIds && hubId && meta.hubIds.includes(String(hubId))) {
    score += 15;
  }

  return score;
}

function pickLang(row, field, lang) {
  const key = `${field}_${lang === 'hans' ? 'hans' : lang === 'en' ? 'en' : 'hant'}`;
  const v = row[key];
  if (v != null && String(v).trim()) return String(v).trim();
  return String(row[`${field}_en`] || row[`${field}_hant`] || '').trim();
}

function rowToDto(row, lang = 'hant') {
  return {
    slug: row.slug,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
    minNights: row.min_nights != null ? Number(row.min_nights) : null,
    maxNights: row.max_nights != null ? Number(row.max_nights) : null,
    filterType: row.filter_type || 'manual',
    filterValue: row.filter_value || null,
    activityIds: Array.isArray(row.activity_ids) ? row.activity_ids.map(String) : [],
    title: pickLang(row, 'title', lang),
    subtitle: pickLang(row, 'subtitle', lang),
  };
}

async function listPlaybookRows({ activeOnly = true } = {}) {
  const params = new URLSearchParams({
    select: '*',
    order: 'sort_order.asc,id.asc',
  });
  if (activeOnly) params.set('is_active', 'eq.true');
  const rows = await supabaseRestFetch(`/rest/v1/${TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function getPlaybookRow(slug) {
  const params = new URLSearchParams({
    select: '*',
    slug: `eq.${String(slug)}`,
    limit: '1',
  });
  const rows = await supabaseRestFetch(`/rest/v1/${TABLE}?${params}`);
  return rows && rows[0] ? rows[0] : null;
}

async function resolvePlaybookActivityIds(row, { maxItems = 24 } = {}) {
  const max = Math.min(Math.max(Number(maxItems) || 24, 1), 48);
  const type = row.filter_type || 'manual';

  if (type === 'manual') {
    const ids = Array.isArray(row.activity_ids) ? row.activity_ids.map(String).filter(Boolean) : [];
    return ids.slice(0, max);
  }

  if (type === 'route' && row.filter_value) {
    const dbRows = await readActivityRows({
      routes: [row.filter_value],
      limit: max,
      order: 'updated_at.desc',
    });
    const activities = await rowsToActivities(dbRows);
    return activities.map((a) => String(a.id));
  }

  if (type === 'chip' && row.filter_value) {
    const dbRows = await readActivityRows({
      chips: [row.filter_value],
      limit: max,
      order: 'updated_at.desc',
    });
    const activities = await rowsToActivities(dbRows);
    return activities.map((a) => String(a.id));
  }

  return [];
}

async function resolvePlaybookActivities(row, opts = {}) {
  const ids = await resolvePlaybookActivityIds(row, opts);
  if (!ids.length) return [];
  const dbRows = await fetchActivitiesByBokunIds(ids);
  const byId = new Map(dbRows.map((r) => [String(r.bokun_activity_id), r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  return rowsToActivities(ordered);
}

async function fetchTripPlaybooksForHero({
  lang = 'hant',
  tripNights = null,
  startDate = null,
  hubId = null,
  limit = 4,
} = {}) {
  const rows = await listPlaybookRows({ activeOnly: true });
  const tripMonth = monthFromIsoDate(startDate);
  const ctx = {
    tripNights: tripNights != null ? Number(tripNights) : null,
    tripMonth,
    hubId: hubId || null,
  };
  const matched = [];

  for (const row of rows) {
    if (!playbookMatchesTripContext(row, ctx)) continue;
    const dto = rowToDto(row, lang);
    // eslint-disable-next-line no-await-in-loop
    dto.activityIds = await resolvePlaybookActivityIds(row, { maxItems: 24 });
    if (!dto.activityIds.length && dto.filterType === 'manual') continue;
    dto.fitScore = playbookFitScore(row, ctx);
    matched.push(dto);
  }

  matched.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  const cap = Math.min(Math.max(Number(limit) || 4, 1), 8);
  const playbooks = matched.slice(0, cap).map(({ fitScore, ...dto }) => dto);

  return {
    playbooks,
    meta: {
      count: playbooks.length,
      source: 'db',
      tripNights: ctx.tripNights,
      tripMonth,
      hubId: ctx.hubId,
    },
  };
}

async function fetchPlaybookBySlug(slug, { lang = 'hant' } = {}) {
  const row = await getPlaybookRow(slug);
  if (!row || row.is_active === false) return null;
  const dto = rowToDto(row, lang);
  dto.activityIds = await resolvePlaybookActivityIds(row, { maxItems: 48 });
  dto.activities = await resolvePlaybookActivities(row, { maxItems: 24 });
  return dto;
}

module.exports = {
  TABLE,
  PLAYBOOK_FALLBACK_META,
  monthFromIsoDate,
  isWinterTripMonth,
  playbookMeta,
  playbookMatchesTripContext,
  playbookFitScore,
  rowToDto,
  listPlaybookRows,
  getPlaybookRow,
  resolvePlaybookActivityIds,
  resolvePlaybookActivities,
  fetchTripPlaybooksForHero,
  fetchPlaybookBySlug,
};
