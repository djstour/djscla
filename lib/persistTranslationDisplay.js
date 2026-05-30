/**
 * Persist translationDisplay audit on activities.bokun_payload after sync / review.
 */

const { supabaseRestFetch } = require('./supabase');
const { fetchActivityTranslationsOverlay } = require('./supabaseTranslations');
const { mergeActivityOverlay } = require('./translationOverlay');
const { buildTranslationDisplaySnapshot } = require('./translationVerification');

const ACTIVITY_TABLE = 'activities';

async function persistTranslationDisplay(activityId, activity) {
  const id = String(activityId);
  if (!id || !activity) return null;

  let overlay = {};
  try {
    const map = await fetchActivityTranslationsOverlay([id]);
    overlay = mergeActivityOverlay({}, map[id] || {});
  } catch (err) {
    console.warn('[persistTranslationDisplay]', id, err.message || err);
  }

  const translationDisplay = buildTranslationDisplaySnapshot(activity, overlay);
  const payload = {
    ...activity,
    translationDisplay,
    translationUnverified: !(translationDisplay.hant?.trusted || translationDisplay.hans?.trusted),
  };

  await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { bokun_payload: payload },
    },
  );

  return payload;
}

module.exports = {
  persistTranslationDisplay,
};
