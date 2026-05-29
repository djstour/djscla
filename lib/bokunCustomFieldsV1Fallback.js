/**
 * Ticket / voucher custom fields exist on v1 activity.json but not in v2 components.
 * @see lib/bokunCancellationV1Fallback.js
 */

const { bokunRequest } = require('./bokunClient');

function v1FallbackEnabled() {
  const flag = String(process.env.BOKUN_TICKET_INFO_V1_FALLBACK || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function isTicketCustomField(field) {
  if (!field || typeof field !== 'object') return false;
  const flags = Array.isArray(field.flags) ? field.flags : [];
  if (flags.some((f) => String(f).toLowerCase() === 'ticket')) return true;
  const code = String(field.code || field.title || '').toLowerCase();
  return /voucher|ticket/.test(code);
}

function mapTicketFieldsToHtml(fields) {
  const parts = (fields || [])
    .map((f) => {
      const html = typeof f.value === 'string' ? f.value.trim() : '';
      return html;
    })
    .filter((html) => html && /<[a-z][\s\S]*?>/i.test(html));
  return parts.join('');
}

/**
 * @param {string|number} experienceId
 * @returns {Promise<string>}
 */
async function fetchTicketInfoHtmlFromV1(experienceId) {
  if (!v1FallbackEnabled() || experienceId == null) return '';
  try {
    const payload = await bokunRequest({
      method: 'GET',
      path: `/activity.json/${encodeURIComponent(String(experienceId))}`,
    });
    const ticketFields = (payload.customFields || []).filter(isTicketCustomField);
    return mapTicketFieldsToHtml(ticketFields);
  } catch (err) {
    console.warn('[bokunCustomFieldsV1Fallback]', experienceId, err.message || err);
    return '';
  }
}

/**
 * @param {object} activity
 */
async function enrichActivityTicketInfo(activity) {
  if (!activity || typeof activity !== 'object') return activity;
  if (String(activity.ticketInfoHtml || '').trim()) return activity;

  const html = await fetchTicketInfoHtmlFromV1(activity.id ?? activity.experienceId);
  if (html) activity.ticketInfoHtml = html;
  return activity;
}

module.exports = {
  enrichActivityTicketInfo,
  fetchTicketInfoHtmlFromV1,
  isTicketCustomField,
  v1FallbackEnabled,
};
