/**
 * Map Bókun category trees + catalog text → UI filter chip ids.
 * Chips: self-drive | aurora | glacier | hotspring | day | premium
 */

const VALID_CHIP_IDS = new Set([
  'self-drive',
  'aurora',
  'glacier',
  'hotspring',
  'day',
  'premium',
]);

/** Bókun groups used for ops — not experience-type filters. */
const IGNORE_CATEGORY_GROUPS = new Set([
  'Location',
  'Seasons',
  'Website',
]);

/** Exact label → chip (lowercase keys). */
const EXACT_LABEL_TO_CHIP = {
  aurora: 'aurora',
  'northern lights': 'aurora',
  'northern lights tours': 'aurora',
  'northern light': 'aurora',
  'aurora borealis': 'aurora',
  'aurora tours': 'aurora',
  'super jeeps': 'aurora',
  'super jeep tours': 'day',

  glacier: 'glacier',
  'ice cave': 'glacier',
  'ice caves': 'glacier',
  'glacier hike': 'glacier',
  'glacier hiking': 'glacier',
  'into the glacier': 'glacier',

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
  'sightseeing tours': 'day',
  sightseeing: 'day',
  snorkeling: 'day',
  diving: 'day',
  'super jeep': 'day',
  snowmobile: 'day',
  hiking: 'day',
  adventure: 'day',
  'multi-day': 'day',

  premium: 'premium',
  luxury: 'premium',
  private: 'premium',
};

/** Regex rules — first match wins per pattern group; all matching chips are collected. */
const TEXT_CHIP_RULES = [
  { chipId: 'aurora', re: /\b(northern\s*lights?|aurora\s*borealis|aurora\s*tour)\b/i },
  { chipId: 'glacier', re: /\b(glacier|ice\s*cave|langj[oö]kull|vatnaj[oö]kull)\b/i },
  { chipId: 'hotspring', re: /\b(blue\s*lagoon|hot\s*spring|geothermal\s*spa|secret\s*lagoon|sky\s*lagoon)\b/i },
  { chipId: 'self-drive', re: /\b(self[\s-]?drive|rental\s*car|drive\s*it\s*yourself)\b/i },
  { chipId: 'premium', re: /\b(premium|luxury|vip|private\s+tour)\b/i },
  { chipId: 'day', re: /\b(snowmobil|super\s*jeep|golden\s*circle|south\s*coast|snorkel|silfra|whale|day\s*tour|ring\s*road)\b/i },
];

function normLabel(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Flatten Bókun nested category trees (detail API) or string arrays (legacy).
 * @returns {string[]}
 */
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

function chipsFromLabels(labels) {
  const chips = new Set();
  for (const label of labels) {
    const key = normLabel(label);
    const chip = EXACT_LABEL_TO_CHIP[key];
    if (chip && VALID_CHIP_IDS.has(chip)) chips.add(chip);
  }
  return chips;
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

function chipsFromTags(tags) {
  const chips = new Set();
  for (const t of tags || []) {
    if (t === 'premium') chips.add('premium');
  }
  return chips;
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
 * @param {object} activity — normalized activity fields
 * @returns {{ chipIds: string[], categoryLabels: string[] }}
 */
function deriveChipIds(activity) {
  const categoryLabels = activity.categoryLabels
    || flattenBokunCategories(activity.categories || []);

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
    ...chipsFromTags(activity.tags),
    ...chipsFromDuration(activity.durationMinutes),
  ]);

  const chipIds = [...chips].filter((id) => VALID_CHIP_IDS.has(id)).sort();
  return { chipIds, categoryLabels };
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

module.exports = {
  VALID_CHIP_IDS,
  IGNORE_CATEGORY_GROUPS,
  flattenBokunCategories,
  deriveChipIds,
  mergeChipIdSets,
};
