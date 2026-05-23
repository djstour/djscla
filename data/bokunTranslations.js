/* bokunTranslations.js
 * ----------------------------------------------------------------------------
 * Per-activity translation overlay.
 *
 * Bókun returns ONE source-of-truth English string for each field. Localised
 * UI copy lives here as an overlay so the raw Bókun ingest stays untouched.
 *
 * Shape:
 *   ACTIVITIES[<bokunId>] = {
 *     title:    { hant, hans, meta? },
 *     summary:  { hant, hans, meta? },
 *     stops:    { [stopId]: { hant, hans } },
 *     mode:     { hant, hans, en },          // computed UI label
 *     ...
 *   }
 *
 * `meta` on any entry carries provenance + cache-busting:
 *   { provider: 'manual' | 'openai' | 'human-review',
 *     sourceHash: '<sha1 of the English source>',
 *     reviewedAt: ISO,
 *     reviewedBy: '<email>' }
 *
 * When the English source changes, the adapter compares the live `sourceHash`
 * to the stored one. Mismatch → fall back to English + queue an OpenAI
 * re-translation job. See `data/README.md` for the full pipeline.
 *
 * Plus two shared dictionaries for symbols that aren't per-activity:
 *   VENDOR_TRANSLATIONS — vendor names usually stay in Latin, but we localise
 *                         their TAGLINE / role label.
 *   TAG_TRANSLATIONS    — badge enums (top_pick, mandarin_guide, etc).
 *   CATEGORY_TRANSLATIONS — Bókun returns english categories; we own labels.
 * ----------------------------------------------------------------------------
 * Exports:
 *   window.AuralisData.BOKUN_TRANSLATIONS = { ACTIVITIES, VENDOR, TAG, CATEGORY }
 * ============================================================================ */

(function () {
  // -------------------------------------------------------- per-activity --
  const ACTIVITIES = {
    723456: { // South Coast & Glacier Lagoon
      title: {
        hant: '南岸全日 · 冰河湖',
        hans: '南岸全日 · 冰河湖',
        meta: { provider: 'manual', sourceHash: 'sc-glacier-v1', reviewedAt: '2026-02-12T00:00:00Z', reviewedBy: 'hsinyi@auralis.travel' },
      },
      summary: {
        hant: '從雷克雅維克出發，沿環島公路一路向東 — 黑沙灘、冰河湖、鑽石海岸盡收眼底。',
        hans: '从雷克雅未克出发，沿环岛公路一路向东 — 黑沙滩、冰河湖、钻石海岸尽收眼底。',
        meta: { provider: 'manual', sourceHash: 'sc-glacier-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      stops: {
        91: { hant: '塞里雅蘭瀑布', hans: '塞里雅兰瀑布' },
        92: { hant: '雷尼斯黑沙灘', hans: '雷尼斯黑沙滩' },
        93: { hant: '傑古沙龍冰河湖', hans: '杰古沙龙冰河湖' },
        94: { hant: '鑽石海岸',     hans: '钻石海岸' },
      },
      mode:    { hant: '自駕', hans: '自驾', en: 'Self-drive' },
    },

    723457: { // Northern Lights minibus
      title: {
        hant: '極光小巴',
        hans: '极光小巴',
        meta: { provider: 'manual', sourceHash: 'aurora-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      summary: {
        hant: '小團體夜間獵極光 — 嚮導即時讀雲圖、挑最佳觀測點，附熱可可與冰島炸糕。',
        hans: '小团体夜间猎极光 — 向导实时读云图、挑最佳观测点，附热可可与冰岛炸糕。',
        meta: { provider: 'manual', sourceHash: 'aurora-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      stops: {
        95: { hant: '雷克雅維克市區', hans: '雷克雅未克市区' },
        96: { hant: '辛格韋德利國家公園', hans: '辛格韦德利国家公园' },
      },
      mode:    { hant: '夜間', hans: '夜间', en: 'Evening' },
    },

    723458: { // Blue Lagoon Premium
      title: {
        hant: '藍湖頂級體驗',
        hans: '蓝湖顶级体验',
        meta: { provider: 'openai', sourceHash: 'bl-premium-v1', reviewedAt: '2026-02-14T00:00:00Z' },
      },
      summary: {
        hant: '免排隊入場藍湖，含頂級浴袍、拖鞋、毛巾、氣泡酒，並保留 Lava 餐廳席位。',
        hans: '免排队入场蓝湖，含顶级浴袍、拖鞋、毛巾、气泡酒，并保留 Lava 餐厅席位。',
        meta: { provider: 'openai', sourceHash: 'bl-premium-v1', reviewedAt: '2026-02-14T00:00:00Z' },
      },
      stops: {
        97: { hant: '藍湖頂級貴賓室', hans: '蓝湖顶级贵宾室' },
      },
      mode:    { hant: 'SPA', hans: 'SPA', en: 'Spa' },
    },

    723459: { // Golden Circle classic
      title: {
        hant: '黃金圈經典',
        hans: '黄金圈经典',
        meta: { provider: 'manual', sourceHash: 'gc-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      summary: {
        hant: '一天走完冰島三大景點：辛格韋德利、蓋歇爾間歇泉、古佛斯瀑布。配中文語音導覽。',
        hans: '一天走完冰岛三大景点：辛格韦德利、盖歇尔间歇泉、古佛斯瀑布。配中文语音导览。',
        meta: { provider: 'manual', sourceHash: 'gc-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      stops: {
        98:  { hant: '辛格韋德利國家公園', hans: '辛格韦德利国家公园' },
        99:  { hant: '蓋歇爾間歇泉',       hans: '盖歇尔间歇泉' },
        100: { hant: '古佛斯瀑布',         hans: '古佛斯瀑布' },
      },
      mode:    { hant: '一日遊', hans: '一日游', en: 'Day trip' },
    },

    723460: { // Glacier hike & ice cave
      title: {
        hant: '冰川健行 · 藍冰洞',
        hans: '冰川徒步 · 蓝冰洞',
        meta: {
          provider: 'manual',
          sourceHash: 'gh-icecave-v1',
          reviewedAt: '2026-02-12T00:00:00Z',
          // Cross-locale gloss note: TC uses 健行 (Taiwan idiom for hiking);
          // SC uses 徒步 (Mainland-standard). This is the canonical example for
          // why we can't just OpenCC-convert between scripts.
          glossNote: 'TC健行 vs SC徒步 is intentional, not a typo.',
        },
      },
      summary: {
        hant: '中級難度。所有冰爪、繩索由嚮導提供。最低年齡 12 歲。Skaftafell 旅客中心集合。',
        hans: '中级难度。所有冰爪、绳索由向导提供。最低年龄 12 岁。Skaftafell 游客中心集合。',
        meta: { provider: 'manual', sourceHash: 'gh-icecave-v1', reviewedAt: '2026-02-12T00:00:00Z' },
      },
      stops: {
        101: { hant: 'Skaftafell 集合點', hans: 'Skaftafell 集合点' },
        102: { hant: 'Falljökull 冰舌',  hans: 'Falljökull 冰舌' },
        103: { hant: '水晶冰洞',         hans: '水晶冰洞' },
      },
      mode:    { hant: '探險', hans: '探险', en: 'Adventure' },
    },

    723461: { // Reykjanes volcano fly-over
      title: {
        hant: '雷克雅內斯火山直升機',
        hans: '雷克雅内斯火山直升机',
        meta: { provider: 'openai', sourceHash: 'rk-volc-v1', reviewedAt: '2026-02-14T00:00:00Z' },
      },
      summary: {
        hant: '45 分鐘風景直升機 — 由雷克雅維克機場起飛，飛越正在活動的火山系統，保證靠窗。',
        hans: '45 分钟风景直升机 — 由雷克雅未克机场起飞，飞越正在活动的火山系统，保证靠窗。',
        meta: { provider: 'openai', sourceHash: 'rk-volc-v1', reviewedAt: '2026-02-14T00:00:00Z' },
      },
      stops: {
        104: { hant: 'Fagradalsfjall 火山', hans: 'Fagradalsfjall 火山' },
      },
      mode:    { hant: '直升機', hans: '直升机', en: 'Helicopter' },
    },
  };

  // ----------------------------------------------------------- vendor labels --
  // Vendors keep their Latin brand name; we only localise the supporting role
  // line shown beneath the title on cards / dashboards.
  const VENDOR = {
    1247: { role: { hant: '在地嚮導 · 探險專家',  hans: '当地向导 · 探险专家',  en: 'Local operator · adventure' } },
    1102: { role: { hant: '在地嚮導 · 觀光巴士',  hans: '当地向导 · 观光巴士',  en: 'Local operator · sightseeing' } },
    1003: { role: { hant: '景點運營 · 溫泉',      hans: '景点运营 · 温泉',      en: 'Attraction · hot spring' } },
    1411: { role: { hant: '在地嚮導 · 經典行程',  hans: '当地向导 · 经典行程',  en: 'Local operator · day tours' } },
    1856: { role: { hant: '在地嚮導 · 冰川專家',  hans: '当地向导 · 冰川专家',  en: 'Local operator · glacier' } },
    1972: { role: { hant: '在地嚮導 · 直升機觀光', hans: '当地向导 · 直升机观光', en: 'Local operator · helicopter' } },
  };

  // ------------------------------------------------------- tag enums (badges) --
  const TAG = {
    top_pick:        { hant: '精選',     hans: '精选',     en: 'Top pick' },
    selling_fast:    { hant: '熱賣中',   hans: '热卖中',   en: 'Selling fast' },
    premium:         { hant: '頂級',     hans: '顶级',     en: 'Premium' },
    mandarin_guide:  { hant: '中文嚮導', hans: '中文向导', en: 'Mandarin guide' },
  };

  // ----------------------------------------- Bókun category → UI category --
  // Bókun lets vendors tag activities with free-form English categories.
  // Map them to our six-category navigation chips.
  const CATEGORY = {
    'Self-drive':  { hant: '自駕 · Self-drive',       hans: '自驾 · Self-drive',       en: 'Self-drive',       chipId: 'self-drive' },
    'Aurora':      { hant: '極光 · Northern Lights',  hans: '极光 · Northern Lights',  en: 'Northern Lights',  chipId: 'aurora' },
    'Glacier':     { hant: '冰川 · Glacier',          hans: '冰川 · Glacier',          en: 'Glacier',          chipId: 'glacier' },
    'Hot spring':  { hant: '溫泉 · Hot spring',       hans: '温泉 · Hot spring',       en: 'Hot spring',       chipId: 'hotspring' },
    'Day trip':    { hant: '一日遊 · Day trip',       hans: '一日游 · Day trip',       en: 'Day trip',         chipId: 'day' },
    'Premium':     { hant: '頂級 · Premium',          hans: '顶级 · Premium',          en: 'Premium',          chipId: 'premium' },
    'Adventure':   { hant: '探險',                    hans: '探险',                    en: 'Adventure',        chipId: null },
  };

  // ------------------------------------ pricing-category title localisation --
  // Adult / Child / Infant / Senior names + age suffixes.
  const PRICING_CATEGORY = {
    5001: { hant: '成人 (16+)',   hans: '成人 (16+)',   en: 'Adult (16+)' },
    5002: { hant: '兒童 (6–15)',  hans: '儿童 (6–15)',  en: 'Child (6–15)' },
    5003: { hant: '嬰幼兒 (0–5)', hans: '婴幼儿 (0–5)', en: 'Infant (0–5)' },
    5004: { hant: '長者 (65+)',   hans: '长者 (65+)',   en: 'Senior (65+)' },
  };

  // ------------------------------------ availability warnings --
  const WARNING = {
    WEATHER_DEPENDENT: { hant: '受天候影響', hans: '受天气影响', en: 'Weather dependent' },
    SOLD_OUT:          { hant: '已售完',     hans: '已售完',     en: 'Sold out' },
    LIMITED:           { hant: '名額有限',   hans: '名额有限',   en: 'Limited spots' },
  };

  window.AuralisData = window.AuralisData || {};
  window.AuralisData.BOKUN_TRANSLATIONS = {
    ACTIVITIES, VENDOR, TAG, CATEGORY, PRICING_CATEGORY, WARNING,
  };
})();
