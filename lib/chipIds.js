/**
 * Map Bókun category trees + catalog text → UI taxonomy:
 * - chipIds: traveller-facing experience types (8)
 * - routeIds: classic Iceland routes (facets)
 * - facetIds: premium, cancel policy, language, season, departure (facets)
 */

/** Primary experience filters (home strip + filter rail). */
const VALID_CHIP_IDS = new Set([
  'aurora',
  'glacier',
  'hotspring',
  'day',
  'self-drive',
  'water',
  'snow',
  'outdoor',
]);

/** Route / region filters (secondary — not same level as aurora/glacier). */
const VALID_ROUTE_IDS = new Set([
  'golden-circle',
  'south-coast',
]);

/** Orthogonal facets (checkboxes). */
const VALID_FACET_IDS = new Set([
  'premium',
  'free-cancel',
  'mandarin',
  'winter',
  'reykjavik',
  'akureyri',
]);

/** Bókun groups — skip for experience labels; read separately for facets. */
const IGNORE_CATEGORY_GROUPS = new Set([
  'Location',
  'Seasons',
  'Website',
]);

const FACET_CATEGORY_GROUPS = new Set(['Location', 'Seasons']);

/** Bókun leaf label → primary chip (normalized key). */
const EXACT_LABEL_TO_CHIP = {
  aurora: 'aurora',
  'northern lights': 'aurora',
  'northern lights tours': 'aurora',
  'northern light': 'aurora',
  'aurora borealis': 'aurora',
  'aurora tours': 'aurora',
  'northern lights tour': 'aurora',

  glacier: 'glacier',
  'glacier hiking': 'glacier',
  'glacier tours': 'glacier',
  'glacier hike': 'glacier',
  'ice cave': 'glacier',
  'ice caves': 'glacier',
  'ice climbing': 'glacier',

  'hot spring': 'hotspring',
  'hot springs': 'hotspring',
  'blue lagoon': 'hotspring',
  spa: 'hotspring',
  geothermal: 'hotspring',
  bathing: 'hotspring',

  'self-drive': 'self-drive',
  'self drive': 'self-drive',
  'self-drive tours': 'self-drive',
  'rental car': 'self-drive',

  'day trip': 'day',
  'day tours': 'day',
  sightseeing: 'day',
  'sightseeing tours': 'day',
  combo: 'day',
  'other tours': 'day',

  snorkeling: 'water',
  'snorkeling tours': 'water',
  diving: 'water',
  'dive silfra': 'water',

  snowmobile: 'snow',
  'super jeep tours': 'snow',
  'super jeeps': 'snow',
  'super jeep': 'snow',

  hiking: 'outdoor',
  'hiking tours': 'outdoor',
  trekking: 'outdoor',
  'trekking tours': 'outdoor',
  caving: 'outdoor',
  'horse riding': 'outdoor',
  'horseback riding': 'outdoor',
  'atv / quads': 'outdoor',
  atvs: 'outdoor',
};

/** Bókun leaf label → route facet. */
const EXACT_LABEL_TO_ROUTE = {
  'golden circle': 'golden-circle',
  'golden circle tours': 'golden-circle',
  'south coast tours': 'south-coast',
};

const TEXT_CHIP_RULES = [
  { chipId: 'aurora', re: /\b(northern\s*lights?|aurora\s*borealis)\b/i },
  { chipId: 'glacier', re: /\b(glacier|ice\s*cave|langj[oö]kull|vatnaj[oö]kull|skaftafell)\b/i },
  { chipId: 'hotspring', re: /\b(blue\s*lagoon|hot\s*spring|geothermal\s*spa|secret\s*lagoon|sky\s*lagoon)\b/i },
  { chipId: 'self-drive', re: /\b(self[\s-]?drive|rental\s*car|drive\s*it\s*yourself|ring\s*road)\b/i },
  { chipId: 'water', re: /\b(snorkel|silfra|diving|scuba)\b/i },
  { chipId: 'snow', re: /\b(snowmobil|super\s*jeep)\b/i },
  { chipId: 'outdoor', re: /\b(horse\s*back|horse\s*riding|caving|atv|quad|trekking|hike)\b/i },
  { chipId: 'day', re: /\b(day\s*tour|sightseeing|golden\s*circle|south\s*coast|whale)\b/i },
];

const TEXT_ROUTE_RULES = [
  { routeId: 'golden-circle', re: /\bgolden\s*circle\b/i },
  { routeId: 'south-coast', re: /\bsouth\s*coast\b/i },
];

const TEXT_FACET_RULES = [
  { facetId: 'premium', re: /\b(premium|luxury|vip|private\s+tour)\b/i },
  { facetId: 'winter', re: /\b(winter|northern\s*lights?\s*season)\b/i },
  { facetId: 'reykjavik', re: /\b(reykjav[ií]k|from\s*reykjavik)\b/i },
  { facetId: 'akureyri', re: /\b(akureyri|from\s*akureyri|north\s*iceland)\b/i },
];

function normLabel(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function flattenBokunCategories(categories) {
  if (!categories || !categories.length) return [];

  const labels = [];

  function walk(nodes, parentGroup) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (typeof node === 'string') {
        const s = node.trim();
        if (s) labels.push(s);
        continue;
      }
      if (!node || typeof node !== 'object') continue;

      const groupTitle = node.title || parentGroup || '';
      const children = node.categories;

      if (Array.isArray(children) && children.length > 0) {
        if (!IGNORE_CATEGORY_GROUPS.has(groupTitle)) {
          walk(children, groupTitle);
        }
        continue;
      }

      if (node.title && !IGNORE_CATEGORY_GROUPS.has(parentGroup || '')) {
        labels.push(node.title);
      }
    }
  }

  walk(categories, null);
  return [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
}

/**
 * Collect leaf titles under specific Bókun groups (Location, Seasons).
 * @returns {string[]}
 */
function labelsFromCategoryGroups(categories, groupNames) {
  const want = new Set(groupNames);
  const out = [];

  function walk(nodes, parentGroup) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const groupTitle = node.title || parentGroup || '';
      const children = node.categories;

      if (Array.isArray(children) && children.length > 0) {
        walk(children, groupTitle);
        continue;
      }

      if (node.title && want.has(parentGroup || '')) {
        out.push(node.title);
      }
    }
  }

  walk(categories, null);
  return [...new Set(out.map((l) => l.trim()).filter(Boolean))];
}

function chipsFromLabels(labels) {
  const chips = new Set();
  for (const label of labels) {
    const key = normLabel(label);
    const chip = EXACT_LABEL_TO_CHIP[key];
    if (chip && VALID_CHIP_IDS.has(chip)) chips.add(chip);
  }
  return chips;
}

function routesFromLabels(labels) {
  const routes = new Set();
  for (const label of labels) {
    const key = normLabel(label);
    const route = EXACT_LABEL_TO_ROUTE[key];
    if (route && VALID_ROUTE_IDS.has(route)) routes.add(route);
  }
  return routes;
}

function chipsFromText(text) {
  const chips = new Set();
  const blob = text || '';
  if (!blob) return chips;
  for (const { chipId, re } of TEXT_CHIP_RULES) {
    if (re.test(blob)) chips.add(chipId);
  }
  return chips;
}

function routesFromText(text) {
  const routes = new Set();
  const blob = text || '';
  if (!blob) return routes;
  for (const { routeId, re } of TEXT_ROUTE_RULES) {
    if (re.test(blob)) routes.add(routeId);
  }
  return routes;
}

function facetsFromText(text) {
  const facets = new Set();
  const blob = text || '';
  if (!blob) return facets;
  for (const { facetId, re } of TEXT_FACET_RULES) {
    if (re.test(blob)) facets.add(facetId);
  }
  return facets;
}

function facetsFromTags(tags) {
  const facets = new Set();
  for (const t of tags || []) {
    if (t === 'premium') facets.add('premium');
    if (t === 'mandarin_guide') facets.add('mandarin');
  }
  return facets;
}

function facetsFromLanguages(languages) {
  const facets = new Set();
  const blob = (languages || []).join(' ').toLowerCase();
  if (/\b(mandarin|chinese|中文|华语|繁体|简体)\b/i.test(blob)) facets.add('mandarin');
  return facets;
}

function facetsFromCancellation(cancellationCutoffMinutes) {
  const facets = new Set();
  const mins = Number(cancellationCutoffMinutes);
  if (Number.isFinite(mins) && mins > 0) facets.add('free-cancel');
  return facets;
}

function facetsFromGroupedLabels(locationLabels, seasonLabels) {
  const facets = new Set();
  const loc = locationLabels.join(' ').toLowerCase();
  const seasons = seasonLabels.join(' ').toLowerCase();
  if (/reykjav[ií]k/.test(loc)) facets.add('reykjavik');
  if (/akureyri|north\s*iceland/.test(loc)) facets.add('akureyri');
  if (/\bwinter\b/.test(seasons)) facets.add('winter');
  return facets;
}

function chipsFromDuration(durationMinutes) {
  const chips = new Set();
  const mins = Number(durationMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return chips;
  if (mins >= 360 && mins <= 14 * 24 * 60) chips.add('self-drive');
  if (mins > 0 && mins <= 12 * 60) chips.add('day');
  return chips;
}

/**
 * @param {object} activity
 * @returns {{ chipIds: string[], routeIds: string[], facetIds: string[], categoryLabels: string[] }}
 */
function deriveChipIds(activity) {
  const categoryLabels = activity.categoryLabels
    || flattenBokunCategories(activity.categories || []);

  const locationLabels = labelsFromCategoryGroups(activity.categories || [], ['Location']);
  const seasonLabels = labelsFromCategoryGroups(activity.categories || [], ['Seasons']);

  const textBlob = [
    activity.title,
    activity.summary,
    activity.description,
    ...(activity.keywords || []),
    ...categoryLabels,
  ].filter(Boolean).join(' ');

  const chips = new Set([
    ...chipsFromLabels(categoryLabels),
    ...chipsFromText(textBlob),
    ...chipsFromDuration(activity.durationMinutes),
  ]);

  const routes = new Set([
    ...routesFromLabels(categoryLabels),
    ...routesFromText(textBlob),
  ]);

  const facets = new Set([
    ...facetsFromTags(activity.tags),
    ...facetsFromText(textBlob),
    ...facetsFromLanguages(activity.languages),
    ...facetsFromCancellation(activity.cancellationCutoffMinutes),
    ...facetsFromGroupedLabels(locationLabels, seasonLabels),
  ]);

  return {
    chipIds: [...chips].filter((id) => VALID_CHIP_IDS.has(id)).sort(),
    routeIds: [...routes].filter((id) => VALID_ROUTE_IDS.has(id)).sort(),
    facetIds: [...facets].filter((id) => VALID_FACET_IDS.has(id)).sort(),
    categoryLabels,
  };
}

function mergeChipIdSets(...lists) {
  const out = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      if (VALID_CHIP_IDS.has(id)) out.add(id);
    }
  }
  return [...out].sort();
}

function mergeRouteIdSets(...lists) {
  const out = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      if (VALID_ROUTE_IDS.has(id)) out.add(id);
    }
  }
  return [...out].sort();
}

function mergeFacetIdSets(...lists) {
  const out = new Set();
  for (const list of lists) {
    for (const id of list || []) {
      if (VALID_FACET_IDS.has(id)) out.add(id);
    }
  }
  return [...out].sort();
}

module.exports = {
  VALID_CHIP_IDS,
  VALID_ROUTE_IDS,
  VALID_FACET_IDS,
  IGNORE_CATEGORY_GROUPS,
  FACET_CATEGORY_GROUPS,
  flattenBokunCategories,
  labelsFromCategoryGroups,
  deriveChipIds,
  mergeChipIdSets,
  mergeRouteIdSets,
  mergeFacetIdSets,
};
