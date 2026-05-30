/**
 * Narrow v1 read for reseller channel list prices when v2 components store
 * commission-like amounts. Only POST /activity.json/search — pricing fields only.
 * @see docs/BOKUN_REST_V2.md — list price gap vs Hosted / booking UI
 */

const { bokunRequest } = require('./bokunClient');
const { normalizeActivity } = require('./normalizeActivity');
const { collectDisplayAmounts } = require('./catalogQuality');

function v1SearchPricingEnabled() {
  const flag = String(process.env.BOKUN_PRICING_V1_SEARCH || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function catalogMaxUsd(activity) {
  const amounts = collectDisplayAmounts(activity);
  return amounts.length ? Math.max(...amounts) : 0;
}

/**
 * @param {string|number} experienceId
 * @param {{ currency?: string, lang?: string }} opts
 * @returns {Promise<object|null>} normalized activity shape or null
 */
async function fetchChannelSearchPricingActivity(experienceId, opts = {}) {
  if (!v1SearchPricingEnabled() || experienceId == null || experienceId === '') return null;

  const currency = (opts.currency || process.env.BOKUN_QUOTE_CURRENCY || 'USD').toUpperCase();
  const lang = opts.lang || 'EN';
  const id = Number(experienceId);
  if (!Number.isFinite(id)) return null;

  try {
    const raw = await bokunRequest({
      method: 'POST',
      path: `/activity.json/search?currency=${encodeURIComponent(currency)}&lang=${encodeURIComponent(lang)}`,
      body: {
        page: 1,
        pageSize: 100,
        activityIds: [id],
      },
    });
    const items = raw.items || raw.activities || [];
    const hit = items.find((row) => row && String(row.id) === String(id));
    if (!hit) return null;
    return normalizeActivity(hit);
  } catch (err) {
    console.warn('[bokunChannelSearchPricing]', experienceId, err.message || err);
    return null;
  }
}

module.exports = {
  v1SearchPricingEnabled,
  fetchChannelSearchPricingActivity,
  catalogMaxUsd,
};
