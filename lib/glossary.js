/**
 * Brand glossary for OpenAI localisation (see data/README.md §4).
 */

const GLOSSARY_HANT = {
  'local operator': '在地嚮導',
  itinerary: '行程',
  checkout: '結帳',
  Reykjavík: '雷克雅維克',
  Jökulsárlón: '傑古沙龍冰河湖',
  'glacier hike': '冰川健行',
  'Northern Lights': '極光',
  'Golden Circle': '黃金圈',
  'Blue Lagoon': '藍湖',
  guide: '嚮導',
  hiking: '健行',
};

const GLOSSARY_HANS = {
  'local operator': '当地向导',
  itinerary: '行程',
  checkout: '结账',
  Reykjavík: '雷克雅未克',
  Jökulsárlón: '杰古沙龙冰河湖',
  'glacier hike': '冰川徒步',
  'Northern Lights': '极光',
  'Golden Circle': '黄金圈',
  'Blue Lagoon': '蓝湖',
  guide: '向导',
  hiking: '徒步',
};

function glossaryForLang(lang) {
  return lang === 'hans' ? GLOSSARY_HANS : GLOSSARY_HANT;
}

function formatGlossaryBlock(lang) {
  const g = glossaryForLang(lang);
  return Object.entries(g)
    .map(([en, zh]) => `- "${en}" → "${zh}"`)
    .join('\n');
}

module.exports = { GLOSSARY_HANT, GLOSSARY_HANS, glossaryForLang, formatGlossaryBlock };
