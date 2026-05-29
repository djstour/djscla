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
 *   VENDOR — reserved; supplier brand names stay as Bókun `vendor.title` (no TC/SC).
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

  // Vendor brand names are shown as returned by Bókun (Latin); not translated here.
  const VENDOR = {};

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
    'Self-drive':  { hant: '自駕',   hans: '自驾',   en: 'Self-drive',       chipId: 'self-drive' },
    'Aurora':      { hant: '極光',   hans: '极光',   en: 'Northern Lights',  chipId: 'aurora' },
    'Glacier':     { hant: '冰川',   hans: '冰川',   en: 'Glacier',          chipId: 'glacier' },
    'Hot spring':  { hant: '溫泉',   hans: '温泉',   en: 'Hot spring',       chipId: 'hotspring' },
    'Day trip':    { hant: '一日遊', hans: '一日游', en: 'Day trip',         chipId: 'day' },
    'Premium':     { hant: '頂級',   hans: '顶级',   en: 'Premium',          chipId: 'premium' },
    'Adventure':   { hant: '探險',   hans: '探险',   en: 'Adventure',        chipId: null },
  };

  const GUIDE_LANGUAGE = {
    english: { hant: '英語', hans: '英语', en: 'English' },
    icelandic: { hant: '冰島語', hans: '冰岛语', en: 'Icelandic' },
    german: { hant: '德語', hans: '德语', en: 'German' },
    french: { hant: '法語', hans: '法语', en: 'French' },
    spanish: { hant: '西班牙語', hans: '西班牙语', en: 'Spanish' },
    mandarin: { hant: '華語', hans: '华语', en: 'Mandarin' },
    chinese: { hant: '中文', hans: '中文', en: 'Chinese' },
    japanese: { hant: '日語', hans: '日语', en: 'Japanese' },
    korean: { hant: '韓語', hans: '韩语', en: 'Korean' },
    italian: { hant: '義大利語', hans: '意大利语', en: 'Italian' },
    portuguese: { hant: '葡萄牙語', hans: '葡萄牙语', en: 'Portuguese' },
    dutch: { hant: '荷蘭語', hans: '荷兰语', en: 'Dutch' },
    norwegian: { hant: '挪威語', hans: '挪威语', en: 'Norwegian' },
    swedish: { hant: '瑞典語', hans: '瑞典语', en: 'Swedish' },
    danish: { hant: '丹麥語', hans: '丹麦语', en: 'Danish' },
    finnish: { hant: '芬蘭語', hans: '芬兰语', en: 'Finnish' },
  };

  // ------------------------------------ pricing-category title localisation --
  // Adult / Child / Infant / Senior names + age suffixes.
  const PRICING_CATEGORY = {
    5001: { hant: '成人 (16+)',   hans: '成人 (16+)',   en: 'Adult (16+)' },
    5002: { hant: '兒童 (6–15)',  hans: '儿童 (6–15)',  en: 'Child (6–15)' },
    5003: { hant: '嬰幼兒 (0–5)', hans: '婴幼儿 (0–5)', en: 'Infant (0–5)' },
    5004: { hant: '長者 (65+)',   hans: '长者 (65+)',   en: 'Senior (65+)' },
    114854: { hant: '成人', hans: '成人', en: 'Adult' },
    25950: { hant: '兒童', hans: '儿童', en: 'Child' },
  };

  // ------------------------------------ availability warnings --
  const WARNING = {
    WEATHER_DEPENDENT: { hant: '受天候影響', hans: '受天气影响', en: 'Weather dependent' },
    SOLD_OUT:          { hant: '已售完',     hans: '已售完',     en: 'Sold out' },
    LIMITED:           { hant: '名額有限',   hans: '名额有限',   en: 'Limited spots' },
  };

  // ------------------------------------ "Quick facts" enum translations --
  // Bókun ships these as upper-case codes on the activity payload (e.g.
  // ACTIVITY_TYPE, DIFFICULTY, ACTIVITY_CATEGORY, ATTRIBUTE). The mapping is
  // intentionally narrow — extend it as new vendor codes show up in production.
  const ACTIVITY_TYPE = {
    DAY_TOUR_OR_ACTIVITY: { hant: '一日行程／活動', hans: '一日行程/活动', en: 'Day tour / activity' },
    MULTI_DAY_TOUR:       { hant: '多日行程',       hans: '多日行程',       en: 'Multi-day tour' },
    TRANSFER:             { hant: '接駁',           hans: '接驳',           en: 'Transfer' },
    RENTAL:               { hant: '租賃',           hans: '租赁',           en: 'Rental' },
    ATTRACTION:           { hant: '景點門票',       hans: '景点门票',       en: 'Attraction' },
    EVENT:                { hant: '活動',           hans: '活动',           en: 'Event' },
    TRANSPORT:            { hant: '交通',           hans: '交通',           en: 'Transport' },
  };

  const DIFFICULTY = {
    VERY_EASY:   { hant: '非常輕鬆', hans: '非常轻松', en: 'Very easy' },
    EASY:        { hant: '輕鬆',     hans: '轻松',     en: 'Easy' },
    MODERATE:    { hant: '中等',     hans: '中等',     en: 'Moderate' },
    CHALLENGING: { hant: '具挑戰',   hans: '具挑战',   en: 'Challenging' },
    DEMANDING:   { hant: '高強度',   hans: '高强度',   en: 'Demanding' },
    HARD:        { hant: '困難',     hans: '困难',     en: 'Hard' },
    EXTREME:     { hant: '極具挑戰', hans: '极具挑战', en: 'Extreme' },
  };

  const ACTIVITY_CATEGORY = {
    WALKING_TOUR:          { hant: '步行行程',     hans: '步行行程',     en: 'Walking tour' },
    BUS_OR_MINIVAN_TOUR:   { hant: '巴士／小巴',   hans: '巴士/小巴',     en: 'Bus / minivan tour' },
    AIR_OR_HELICOPTER_TOUR:{ hant: '空中／直升機', hans: '空中/直升机',   en: 'Air / helicopter tour' },
    SAILING_OR_BOAT_TOUR:  { hant: '船遊',         hans: '船游',         en: 'Sailing / boat tour' },
    PRIVATE_CAR_TOUR:      { hant: '私人包車',     hans: '私人包车',     en: 'Private car tour' },
    SEAT_IN_COACH_TOUR:    { hant: '合乘巴士團',   hans: '合乘巴士团',   en: 'Seat-in-coach tour' },
    BIKE_TOUR:             { hant: '單車行程',     hans: '单车行程',     en: 'Bike tour' },
    SIGHTSEEING:           { hant: '觀光',         hans: '观光',         en: 'Sightseeing' },
    SIGHTSEEING_ATTRACTION:{ hant: '觀光景點',     hans: '观光景点',     en: 'Sightseeing attraction' },
    NATURE:                { hant: '自然',         hans: '自然',         en: 'Nature' },
    WILDLIFE:              { hant: '野生動物',     hans: '野生动物',     en: 'Wildlife' },
    CULTURE:               { hant: '文化',         hans: '文化',         en: 'Culture' },
    ARTS_AND_CULTURE:      { hant: '藝術文化',     hans: '艺术文化',     en: 'Arts & culture' },
    FOOD_AND_DRINK:        { hant: '美食',         hans: '美食',         en: 'Food & drink' },
    WATER_ACTIVITY:        { hant: '水上活動',     hans: '水上活动',     en: 'Water activity' },
    HIKING:                { hant: '健行',         hans: '徒步',         en: 'Hiking' },
    ADVENTURE:             { hant: '冒險',         hans: '冒险',         en: 'Adventure' },
    MUSEUMS_AND_EXHIBITIONS:{ hant: '博物館',      hans: '博物馆',       en: 'Museums & exhibitions' },
  };

  const ACTIVITY_ATTRIBUTE = {
    FAMILY_FRIENDLY: { hant: '親子友善', hans: '亲子友善', en: 'Family friendly' },
    ECO_FRIENDLY:    { hant: '環境友善', hans: '环境友善', en: 'Eco friendly' },
    ROMANTIC:        { hant: '浪漫',     hans: '浪漫',     en: 'Romantic' },
    LUXURY:          { hant: '奢華',     hans: '奢华',     en: 'Luxury' },
    OUTDOOR:         { hant: '戶外',     hans: '户外',     en: 'Outdoor' },
    INDOOR:          { hant: '室內',     hans: '室内',     en: 'Indoor' },
    ACCESSIBLE:      { hant: '無障礙',   hans: '无障碍',   en: 'Accessible' },
    PET_FRIENDLY:    { hant: '寵物友善', hans: '宠物友善', en: 'Pet friendly' },
    PRIVATE:         { hant: '私人',     hans: '私人',     en: 'Private' },
    SMALL_GROUP:     { hant: '小團',     hans: '小团',     en: 'Small group' },
  };

  const KNOW_BEFORE_YOU_GO = {
    STROLLER_OR_PRAM_ACCESSIBLE: { hant: '可推嬰兒車',     hans: '可推婴儿车',     en: 'Stroller / pram accessible' },
    WHEELCHAIR_ACCESSIBLE:       { hant: '輪椅友善',       hans: '轮椅友善',       en: 'Wheelchair accessible' },
    LIMITED_MOBILITY_ACCESSIBLE: { hant: '行動不便者可參加', hans: '行动不便者可参加', en: 'Limited mobility accessible' },
    LIMITED_SIGHT_ACCESSIBLE:    { hant: '視障友善',       hans: '视障友善',       en: 'Limited sight accessible' },
    ANIMALS_OR_PETS_ALLOWED:     { hant: '可攜寵物',       hans: '可携宠物',       en: 'Animals / pets allowed' },
    PUBLIC_TRANSPORTATION_NEARBY:{ hant: '鄰近大眾運輸',   hans: '邻近大众运输',   en: 'Public transportation nearby' },
    INFANT_SEATS_AVAILABLE:      { hant: '提供嬰兒座椅',   hans: '提供婴儿座椅',   en: 'Infant seats available' },
    INFANTS_MUST_SIT_ON_LAPS:    { hant: '嬰兒需坐於膝上', hans: '婴儿需坐于膝上', en: 'Infants must sit on laps' },
    PASSPORT_REQUIRED:           { hant: '需護照',         hans: '需护照',         en: 'Passport required' },
    DRESS_CODE:                  { hant: '有服裝規定',     hans: '有着装规定',     en: 'Dress code' },
  };

  const INCLUSION_EXCLUSION = {
    ENTRY_OR_ADMISSION_FEE:      { hant: '門票／入場費',   hans: '门票/入场费',   en: 'Entry or admission fee' },
    FUEL_SURCHARGE:              { hant: '燃油附加費',     hans: '燃油附加费',     en: 'Fuel surcharge' },
    LANDING_AND_FACILITY_FEES:   { hant: '起降／設施費',   hans: '起降/设施费',   en: 'Landing & facility fees' },
    PARKING_FEES:                { hant: '停車費',         hans: '停车费',         en: 'Parking fees' },
    NATIONAL_PARK_ENTRANCE_FEE:  { hant: '國家公園門票',   hans: '国家公园门票',   en: 'National park entrance fee' },
    TIP_OR_GRATUITY:             { hant: '小費',           hans: '小费',           en: 'Tip / gratuity' },
    FOOD_AND_DRINKS:             { hant: '餐飲',           hans: '餐饮',           en: 'Food & drinks' },
    WIFI:                        { hant: 'Wi‑Fi',          hans: 'Wi‑Fi',          en: 'Wi‑Fi' },
    BUS_FARE:                    { hant: '巴士費',         hans: '巴士费',         en: 'Bus fare' },
  };

  window.AuralisData = window.AuralisData || {};
  window.AuralisData.BOKUN_TRANSLATIONS = {
    ACTIVITIES, VENDOR, TAG, CATEGORY, PRICING_CATEGORY, WARNING, GUIDE_LANGUAGE,
    ACTIVITY_TYPE, DIFFICULTY, ACTIVITY_CATEGORY, ACTIVITY_ATTRIBUTE,
    KNOW_BEFORE_YOU_GO, INCLUSION_EXCLUSION,
  };
})();
