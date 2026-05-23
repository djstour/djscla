const { fetchActivityTranslationsOverlay } = require('./supabaseTranslations');

/**
 * Attach Supabase overlays to Bókun API responses (non-fatal if Supabase unavailable).
 * @param {object[]} activities
 * @returns {Promise<Record<string, object>>}
 */
async function loadTranslationsForActivities(activities) {
  const ids = (activities || []).map((a) => a.id).filter((id) => id != null);
  if (!ids.length) return {};

  try {
    return await fetchActivityTranslationsOverlay(ids.map(String));
  } catch (err) {
    console.warn('[Auralis] Supabase translations unavailable:', err.message);
    return {};
  }
}

module.exports = { loadTranslationsForActivities };
