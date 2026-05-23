/**
 * Detail API enrichment — fetch full activity → flatten categories → chipIds → cache.
 */

const { getActivityById } = require('./bokun');
const { normalizeActivity } = require('./normalizeActivity');
const { deriveChipIds, mergeChipIdSets } = require('./chipIds');
const { loadChipCache, saveChipCache } = require('./chipCache');

const DEFAULT_CONCURRENCY = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Fetch one activity detail and return cache entry.
 */
async function enrichOneFromDetail(id, { uiLang = 'en' } = {}) {
  const rawPayload = await getActivityById(id, { uiLang });
  const raw = rawPayload?.activity || rawPayload;
  const activity = normalizeActivity(raw);
  const { chipIds, categoryLabels } = deriveChipIds(activity);
  return {
    chipIds,
    categoryLabels,
    enrichedAt: new Date().toISOString(),
  };
}

/**
 * Enrich catalog activities: rules first, then cache merge, optionally fetch missing from detail.
 */
async function enrichActivitiesChipIds(activities, {
  uiLang = 'en',
  fetchMissing = true,
  concurrency = DEFAULT_CONCURRENCY,
  delayMs = 80,
} = {}) {
  const cache = loadChipCache();
  const byId = { ...(cache.byId || {}) };
  const missing = [];

  for (const activity of activities) {
    const id = String(activity.id);
    const hasCache = byId[id]?.chipIds?.length;
    if (fetchMissing && !hasCache) {
      missing.push(activity);
    }
  }

  if (fetchMissing && missing.length) {
    await mapPool(missing, concurrency, async (activity) => {
      const id = String(activity.id);
      try {
        const entry = await enrichOneFromDetail(id, { uiLang });
        const merged = {
          chipIds: mergeChipIdSets(activity.chipIds, entry.chipIds),
          categoryLabels: entry.categoryLabels?.length
            ? entry.categoryLabels
            : activity.categoryLabels,
          enrichedAt: entry.enrichedAt,
        };
        byId[id] = merged;
      } catch (err) {
        byId[id] = {
          chipIds: activity.chipIds || [],
          categoryLabels: activity.categoryLabels || [],
          enrichedAt: new Date().toISOString(),
          error: err.message,
        };
      }
      if (delayMs > 0) await sleep(delayMs);
    });

    saveChipCache({ byId });
  }

  return activities.map((activity) => {
    const id = String(activity.id);
    const entry = byId[id];
    if (!entry) return activity;
    return {
      ...activity,
      chipIds: mergeChipIdSets(activity.chipIds, entry.chipIds),
      categoryLabels: entry.categoryLabels?.length
        ? entry.categoryLabels
        : activity.categoryLabels,
      chipSource: entry.chipIds?.length ? 'rules+cache' : activity.chipSource,
    };
  });
}

module.exports = {
  enrichOneFromDetail,
  enrichActivitiesChipIds,
};
