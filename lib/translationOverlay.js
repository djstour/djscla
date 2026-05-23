/**
 * Convert Supabase translation rows ↔ bokunTranslations ACTIVITIES overlay shape.
 */

function rowsToActivityOverlay(rows) {
  const byActivity = {};

  for (const row of rows || []) {
    const id = String(row.entity_id);
    if (!byActivity[id]) byActivity[id] = {};

    const activity = byActivity[id];
    const { field_path: fieldPath, lang, text, meta } = row;

    if (fieldPath.startsWith('stop.')) {
      const stopId = fieldPath.slice(5);
      if (!activity.stops) activity.stops = {};
      if (!activity.stops[stopId]) activity.stops[stopId] = {};
      activity.stops[stopId][lang] = text;
      if (meta && !activity.stops[stopId].meta) activity.stops[stopId].meta = meta;
    } else {
      if (!activity[fieldPath]) activity[fieldPath] = {};
      activity[fieldPath][lang] = text;
      if (meta) activity[fieldPath].meta = meta;
    }
  }

  return byActivity;
}

function mergeActivityOverlay(staticOverlay, runtimeOverlay) {
  if (!staticOverlay || !Object.keys(staticOverlay).length) {
    return runtimeOverlay ? { ...runtimeOverlay } : {};
  }
  if (!runtimeOverlay || !Object.keys(runtimeOverlay).length) {
    return { ...staticOverlay };
  }

  const out = { ...staticOverlay };

  for (const [key, val] of Object.entries(runtimeOverlay)) {
    if (key === 'stops' && val && typeof val === 'object') {
      out.stops = { ...(out.stops || {}) };
      for (const [stopId, stopEntry] of Object.entries(val)) {
        out.stops[stopId] = { ...(out.stops[stopId] || {}), ...stopEntry };
      }
    } else if (val && typeof val === 'object') {
      out[key] = { ...(out[key] || {}), ...val };
    } else {
      out[key] = val;
    }
  }

  return out;
}

module.exports = { rowsToActivityOverlay, mergeActivityOverlay };
