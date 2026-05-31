/**
 * Catalog search helpers — CJK translation lookup, duration hints.
 */

const { supabaseRestFetch } = require('./supabase');

function hasCjk(text) {
  return /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/u.test(String(text || ''));
}

function ilikePattern(term) {
  const escaped = String(term || '').trim().replace(/[%_\\*,]/g, '').slice(0, 80);
  if (!escaped) return null;
  return `*${escaped}*`;
}

/**
 * Find activity IDs whose zh title/summary translation matches q.
 * @returns {Promise<string[]>} bokun activity ids
 */
async function searchBokunIdsByTranslation(q, lang) {
  const pattern = ilikePattern(q);
  if (!pattern || (lang !== 'hant' && lang !== 'hans')) return [];

  const params = new URLSearchParams({
    select: 'entity_id',
    entity_type: 'eq.activity',
    lang: `eq.${lang}`,
    field_path: 'in.(title,summary)',
    text: `ilike.${pattern}`,
  });
  params.set('limit', '1000');

  const rows = await supabaseRestFetch(`/rest/v1/translations?${params}`);
  const ids = new Set();
  (rows || []).forEach((row) => {
    if (row && row.entity_id != null) ids.add(String(row.entity_id));
  });
  return [...ids];
}

function tripDurationChipHintFromDates(startDate, endDate) {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const nights = Math.max(0, Math.round((end - start) / 86400000));
  const month = new Date(`${startDate}T12:00:00`).getUTCMonth() + 1;
  const isWinterSeason = month >= 9 || month <= 4;
  if (nights <= 2) return 'day';
  if (nights >= 7) return 'self-drive';
  if (isWinterSeason && nights >= 3) return 'aurora';
  return null;
}

module.exports = {
  hasCjk,
  searchBokunIdsByTranslation,
  tripDurationChipHintFromDates,
};
