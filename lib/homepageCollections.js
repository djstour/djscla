/**
 * Homepage marketing collections — resolve admin-curated rails to activities.
 */

const { supabaseRestFetch } = require('./supabase');
const {
  readActivityRows,
  rowsToActivities,
  fetchActivitiesByBokunIds,
} = require('./catalogDb');

const TABLE = 'homepage_collections';

function pickLang(row, field, lang) {
  const key = `${field}_${lang === 'hans' ? 'hans' : lang === 'en' ? 'en' : 'hant'}`;
  const v = row[key];
  if (v != null && String(v).trim()) return String(v).trim();
  return String(row[`${field}_en`] || row[`${field}_hant`] || '').trim();
}

function rowToDto(row) {
  return {
    id: row.id,
    slug: row.slug,
    isActive: row.is_active !== false,
    sortOrder: row.sort_order != null ? Number(row.sort_order) : 0,
    maxItems: row.max_items != null ? Number(row.max_items) : 6,
    filterType: row.filter_type || 'chip',
    filterValue: row.filter_value || null,
    activityIds: Array.isArray(row.activity_ids) ? row.activity_ids.map(String) : [],
    titles: {
      hant: row.title_hant || '',
      hans: row.title_hans || '',
      en: row.title_en || '',
    },
    overlines: {
      hant: row.overline_hant || '',
      hans: row.overline_hans || '',
      en: row.overline_en || '',
    },
    ctaLabels: {
      hant: row.cta_label_hant || '',
      hans: row.cta_label_hans || '',
      en: row.cta_label_en || '',
    },
    ctaChipId: row.cta_chip_id || null,
    ctaRouteId: row.cta_route_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dtoToRow(body, existing) {
  const base = existing || {};
  const patch = {};

  if (body.slug !== undefined) patch.slug = String(body.slug).trim();
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
  if (body.maxItems !== undefined) {
    patch.max_items = Math.min(24, Math.max(1, Number(body.maxItems) || 6));
  }
  if (body.filterType !== undefined) patch.filter_type = body.filterType;
  if (body.filterValue !== undefined) patch.filter_value = body.filterValue || null;
  if (body.activityIds !== undefined) {
    patch.activity_ids = Array.isArray(body.activityIds)
      ? body.activityIds.map(String).filter(Boolean)
      : [];
  }

  const setLangField = (prefix, obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.hant !== undefined) patch[`${prefix}_hant`] = obj.hant || '';
    if (obj.hans !== undefined) patch[`${prefix}_hans`] = obj.hans || '';
    if (obj.en !== undefined) patch[`${prefix}_en`] = obj.en || '';
  };

  setLangField('title', body.titles);
  setLangField('overline', body.overlines);
  setLangField('cta_label', body.ctaLabels);

  if (body.ctaChipId !== undefined) patch.cta_chip_id = body.ctaChipId || null;
  if (body.ctaRouteId !== undefined) patch.cta_route_id = body.ctaRouteId || null;

  if (!existing && !patch.slug) {
    throw Object.assign(new Error('slug required'), { code: 'MISSING_SLUG' });
  }

  return { ...base, ...patch };
}

async function listCollectionRows({ activeOnly = false } = {}) {
  const params = new URLSearchParams({
    select: '*',
    order: 'sort_order.asc,id.asc',
  });
  if (activeOnly) params.set('is_active', 'eq.true');
  const rows = await supabaseRestFetch(`/rest/v1/${TABLE}?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function getCollectionRow(idOrSlug) {
  const params = new URLSearchParams({ select: '*', limit: '1' });
  if (/^\d+$/.test(String(idOrSlug))) {
    params.set('id', `eq.${idOrSlug}`);
  } else {
    params.set('slug', `eq.${String(idOrSlug)}`);
  }
  const rows = await supabaseRestFetch(`/rest/v1/${TABLE}?${params}`);
  return rows && rows[0] ? rows[0] : null;
}

async function resolveCollectionActivities(row) {
  const max = Math.min(Math.max(Number(row.max_items) || 6, 1), 24);
  const type = row.filter_type || 'chip';

  if (type === 'manual') {
    const ids = Array.isArray(row.activity_ids) ? row.activity_ids.map(String).filter(Boolean) : [];
    if (!ids.length) return [];
    const rows = await fetchActivitiesByBokunIds(ids.slice(0, max));
    const byId = new Map(rows.map((r) => [String(r.bokun_activity_id), r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
    return rowsToActivities(ordered);
  }

  if (type === 'route' && row.filter_value) {
    const rows = await readActivityRows({
      routes: [row.filter_value],
      limit: max,
      order: 'updated_at.desc',
    });
    return rowsToActivities(rows);
  }

  if (type === 'chip' && row.filter_value) {
    const rows = await readActivityRows({
      chips: [row.filter_value],
      limit: max,
      order: 'updated_at.desc',
    });
    return rowsToActivities(rows);
  }

  return [];
}

async function fetchHomepageCollectionsForSite({ lang = 'hant' } = {}) {
  const rows = await listCollectionRows({ activeOnly: true });
  const collections = [];

  for (const row of rows) {
    const activities = await resolveCollectionActivities(row);
    if (!activities.length) continue;

    collections.push({
      slug: row.slug,
      sortOrder: row.sort_order,
      title: pickLang(row, 'title', lang),
      overline: pickLang(row, 'overline', lang),
      ctaLabel: pickLang(row, 'cta_label', lang),
      ctaChipId: row.cta_chip_id || (row.filter_type === 'chip' ? row.filter_value : null),
      ctaRouteId: row.cta_route_id || (row.filter_type === 'route' ? row.filter_value : null),
      maxItems: row.max_items,
      activities,
    });
  }

  return {
    collections,
    meta: {
      count: collections.length,
      source: 'db',
    },
  };
}

module.exports = {
  TABLE,
  rowToDto,
  dtoToRow,
  pickLang,
  listCollectionRows,
  getCollectionRow,
  resolveCollectionActivities,
  fetchHomepageCollectionsForSite,
};
