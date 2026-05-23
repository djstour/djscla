const crypto = require('crypto');

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sourceHash(text) {
  return crypto.createHash('sha1').update(String(text), 'utf8').digest('hex');
}

/**
 * Fields we send to OpenAI / store in Supabase.
 * @param {object} activity — normalized Bókun activity
 * @returns {Array<{ fieldPath: string, source: string, sourceHash: string }>}
 */
function extractTranslatableFields(activity) {
  const fields = [];
  const seen = new Set();

  function add(fieldPath, source) {
    const text = (source || '').trim();
    if (!text) return;
    const key = `${fieldPath}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ fieldPath, source: text, sourceHash: sourceHash(text) });
  }

  add('title', activity.title);
  add('summary', stripHtml(activity.summary));
  const desc = stripHtml(activity.description);
  const sum = stripHtml(activity.summary);
  if (desc && desc !== sum) add('description', desc);
  else if (desc && !sum) add('summary', desc);

  const mode = Array.isArray(activity.categories) ? activity.categories[0] : activity.categories;
  if (mode) add('mode', String(mode));

  for (const stop of activity.stops || []) {
    const stopId = stop.id != null ? String(stop.id) : null;
    if (!stopId) continue;
    add(`stop.${stopId}`, stop.title || stop.name);
  }

  return fields;
}

module.exports = { stripHtml, sourceHash, extractTranslatableFields };
