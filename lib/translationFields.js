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
  const byFieldPath = new Map();

  function add(fieldPath, source) {
    const text = (source || '').trim();
    if (!text) return;
    // Some supplier payloads can repeat the same stop id with variant titles.
    // Keep a single source per field path to avoid duplicate upsert keys.
    const existing = byFieldPath.get(fieldPath);
    if (!existing || text.length > existing.source.length) {
      byFieldPath.set(fieldPath, { fieldPath, source: text, sourceHash: sourceHash(text) });
    }
  }

  add('title', activity.title);
  add('summary', stripHtml(activity.summary));
  const desc = stripHtml(activity.description);
  const sum = stripHtml(activity.summary);
  if (desc && desc !== sum) add('description', desc);
  else if (desc && !sum) add('summary', desc);
  add('includedHtml', stripHtml(activity.includedHtml));
  add('excludedHtml', stripHtml(activity.excludedHtml));
  add('requirementsHtml', stripHtml(activity.requirementsHtml));
  add('attentionHtml', stripHtml(activity.attentionHtml));
  add('cancellationPolicyTitle', stripHtml(activity.cancellationPolicyTitle));
  add('cancellationPolicyHtml', stripHtml(activity.cancellationPolicyHtml));
  add('durationText', stripHtml(activity.durationText));
  (activity.knowBeforeYouGoItems || []).forEach((item, idx) => {
    const text = typeof item === 'string' ? item : (item && (item.text || item.label)) || '';
    add(`know.${idx}`, stripHtml(text));
  });

  // Mode/category: use static CATEGORY map in bokunAdapter (T.CATEGORY), not OpenAI —
  // Bókun values are often long English labels that fail length sanity when translated.
  for (const stop of activity.stops || []) {
    const stopId = stop.id != null ? String(stop.id) : null;
    if (!stopId) continue;
    add(`stop.${stopId}`, stop.title || stop.name);
  }

  byFieldPath.forEach((v) => fields.push(v));
  return sortTranslatableFields(fields);
}

function fieldPriority(fieldPath) {
  if (fieldPath === 'title') return 0;
  if (fieldPath === 'mode') return 1;
  if (fieldPath === 'summary') return 2;
  if (fieldPath.startsWith('stop.')) return 3;
  if (fieldPath === 'includedHtml') return 4;
  if (fieldPath === 'excludedHtml') return 5;
  if (fieldPath === 'requirementsHtml') return 6;
  if (fieldPath === 'attentionHtml') return 7;
  if (fieldPath === 'cancellationPolicyTitle') return 8;
  if (fieldPath === 'cancellationPolicyHtml') return 8;
  if (fieldPath === 'durationText') return 4;
  if (fieldPath.startsWith('know.')) return 7;
  if (fieldPath === 'description') return 9;
  return 5;
}

/** Title and summary before long description / many stops (fits serverless time limits). */
function sortTranslatableFields(fields) {
  return [...fields].sort((a, b) => fieldPriority(a.fieldPath) - fieldPriority(b.fieldPath));
}

module.exports = { stripHtml, sourceHash, extractTranslatableFields, sortTranslatableFields, fieldPriority };
