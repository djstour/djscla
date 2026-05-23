/**
 * File-backed chip id cache (detail-enriched). Merged at catalog serve time.
 */

const fs = require('fs');
const path = require('path');
const { mergeChipIdSets } = require('./chipIds');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'chipIdsCache.json');

let memoryCache = null;

function loadChipCache() {
  if (memoryCache) return memoryCache;
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    memoryCache = JSON.parse(raw);
    return memoryCache;
  } catch (e) {
    if (e.code === 'ENOENT') {
      memoryCache = { version: 1, updatedAt: null, byId: {} };
      return memoryCache;
    }
    throw e;
  }
}

function saveChipCache(cache) {
  const next = {
    version: 1,
    updatedAt: new Date().toISOString(),
    byId: cache.byId || {},
  };
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  memoryCache = next;
  return next;
}

/**
 * Merge cached detail chipIds onto normalized activities (rules chips kept).
 */
function applyChipCache(activities) {
  const cache = loadChipCache();
  const byId = cache.byId || {};

  return activities.map((activity) => {
    if (!activity || activity.id == null) return activity;
    const entry = byId[String(activity.id)];
    if (!entry) return activity;

    const chipIds = mergeChipIdSets(activity.chipIds, entry.chipIds);
    const categoryLabels = entry.categoryLabels?.length
      ? entry.categoryLabels
      : activity.categoryLabels;

    return {
      ...activity,
      chipIds,
      categoryLabels: categoryLabels || activity.categoryLabels || [],
      chipSource: entry.chipIds?.length ? 'rules+cache' : activity.chipSource,
    };
  });
}

function getCachePath() {
  return CACHE_PATH;
}

module.exports = {
  loadChipCache,
  saveChipCache,
  applyChipCache,
  getCachePath,
};
