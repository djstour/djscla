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

  let existingPayload = {};
  try {
    const rows = await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}&select=bokun_payload&limit=1`,
    );
    existingPayload = (rows && rows[0] && rows[0].bokun_payload) || {};
  } catch (err) {
    console.warn('[persistTranslationDisplay] load existing', id, err.message || err);
  }

  let overlay = {};
  try {
    const map = await fetchActivityTranslationsOverlay([id]);
    overlay = mergeActivityOverlay({}, map[id] || {});
  } catch (err) {
    console.warn('[persistTranslationDisplay]', id, err.message || err);
  }

  const mergedActivity = {
    ...activity,
    translationDisplay: existingPayload.translationDisplay || activity.translationDisplay,
  };
  const translationDisplay = buildTranslationDisplaySnapshot(mergedActivity, overlay);
  await supabaseRestFetch(
    `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        bokun_payload: {
          ...existingPayload,
          translationDisplay,
          translationUnverified: !(translationDisplay.hant?.trusted || translationDisplay.hans?.trusted),
        },
      },
    },
  );

  return {
    ...existingPayload,
    translationDisplay,
    translationUnverified: !(translationDisplay.hant?.trusted || translationDisplay.hans?.trusted),
  };
}

module.exports = {
  persistTranslationDisplay,
};
