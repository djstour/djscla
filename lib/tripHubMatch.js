/**
 * Trip hub → activity matching (shared catalog filter + UI).
 * Non-default hubs require facet/route tag OR title/summary keyword hit.
 */

const TRIP_HUB_MATCH_RULES = {
  reykjavik: {
    facetId: 'reykjavik',
    routeIds: ['golden-circle'],
    keywords: [/reykjav[ií]k|keflav[ií]k|\bkef\b/i],
  },
  akureyri: {
    facetId: 'akureyri',
    routeIds: [],
    keywords: [/akureyri|north\s*iceland|mývatn|myvatn|húsavík|husavik|dettifoss|goðafoss|godafoss/i],
  },
  'south-coast': {
    facetId: null,
    routeIds: ['south-coast'],
    keywords: [/south\s*coast|south\s*iceland|\bv[ií]k\b|skógafoss|skogafoss|seljalandsfoss|jökuls[aá]rl[oó]n|jokulsarlon|diamond\s*beach|vatnajökull/i],
  },
};

function activityTextBlob(activity) {
  return [
    activity.title,
    activity.summary,
    activity.description,
    ...(activity.keywords || []),
  ].filter(Boolean).join(' ');
}

function activityMatchesTripHub(activity, hubId) {
  if (!hubId || hubId === 'reykjavik') return true;
  const rules = TRIP_HUB_MATCH_RULES[hubId];
  if (!rules) return true;
  const facetIds = activity.facetIds || [];
  const routeIds = activity.routeIds || [];
  if (rules.facetId && facetIds.includes(rules.facetId)) return true;
  if (rules.routeIds.some((r) => routeIds.includes(r))) return true;
  const text = activityTextBlob(activity);
  return rules.keywords.some((re) => re.test(text));
}

module.exports = {
  TRIP_HUB_MATCH_RULES,
  activityTextBlob,
  activityMatchesTripHub,
};
