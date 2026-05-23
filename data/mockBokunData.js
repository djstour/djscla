/* mockBokunData.js
 * ----------------------------------------------------------------------------
 * Mocks the JSON payload of Bókun's GET /activity.json endpoint
 * (https://bokun.dev — Activity, Vendor, PricingCategory, Stop, Availability).
 *
 * These records are deliberately verbose — they mirror what the live API
 * returns, including fields we don't currently render (cancellation cutoff,
 * meeting type, photo arrays). The thin adapter in `bokunAdapter.js`
 * flattens them into the view-model that our React components consume.
 *
 * RAW ENGLISH ONLY. Translations live in `bokunTranslations.js` as an overlay
 * keyed by activity ID + field path. See `data/README.md` for the why.
 * ----------------------------------------------------------------------------
 * Exports (UMD-style, no module loader):
 *   window.AuralisData.MOCK_BOKUN_ACTIVITIES  — Activity[]
 *   window.AuralisData.MOCK_BOKUN_VENDORS     — Vendor[]
 * ============================================================================ */

(function () {
  const NOW_ISO = '2026-03-09T08:30:00Z';

  // ---------------------------------------------------------------- Vendors --
  // In live Bókun, vendors are returned both as nested objects on the activity
  // AND as a separate /vendor.json collection. We keep the nested form to match
  // the activity-list shape, plus a flat dictionary for the supplier filter.
  const VENDORS = {
    'arctic': {
      id: 1247, externalId: 'arctic-adventures',
      title: 'Arctic Adventures',
      brandImageUrl: '/assets/photos/vendor-arctic.jpg',  // placeholder
      phoneNumber: '+354 562 7000',
      emailAddress: 'info@adventures.is',
      websiteUrl: 'https://adventures.is',
      currency: 'ISK',
      countryCode: 'IS',
    },
    'rex': {
      id: 1102, externalId: 'reykjavik-excursions',
      title: 'Reykjavík Excursions',
      brandImageUrl: '/assets/photos/vendor-rex.jpg',
      phoneNumber: '+354 580 5400',
      emailAddress: 'main@re.is',
      websiteUrl: 'https://re.is',
      currency: 'ISK',
      countryCode: 'IS',
    },
    'blue': {
      id: 1003, externalId: 'blue-lagoon-hf',
      title: 'Blue Lagoon hf',
      brandImageUrl: '/assets/photos/vendor-blue.jpg',
      phoneNumber: '+354 420 8800',
      emailAddress: 'info@bluelagoon.is',
      websiteUrl: 'https://bluelagoon.com',
      currency: 'ISK',
      countryCode: 'IS',
    },
    'iceland': {
      id: 1411, externalId: 'iceland-protravel',
      title: 'Iceland ProTravel',
      brandImageUrl: '/assets/photos/vendor-protravel.jpg',
      phoneNumber: '+354 511 2600',
      emailAddress: 'sales@icelandprotravel.is',
      websiteUrl: 'https://icelandprotravel.is',
      currency: 'ISK',
      countryCode: 'IS',
    },
    'troll': {
      id: 1856, externalId: 'troll-expeditions',
      title: 'Troll Expeditions',
      brandImageUrl: '/assets/photos/vendor-troll.jpg',
      phoneNumber: '+354 519 5544',
      emailAddress: 'hello@troll.is',
      websiteUrl: 'https://troll.is',
      currency: 'ISK',
      countryCode: 'IS',
    },
    'nordur': {
      id: 1972, externalId: 'nordurflug',
      title: 'Norðurflug',
      brandImageUrl: '/assets/photos/vendor-nordurflug.jpg',
      phoneNumber: '+354 562 2500',
      emailAddress: 'info@helicopter.is',
      websiteUrl: 'https://helicopter.is',
      currency: 'ISK',
      countryCode: 'IS',
    },
  };

  // ----------------------------------------------------- Pricing categories --
  // Reused across activities so the supplier dashboards can roll them up.
  // Bókun returns these as an array on each activity; categories are global
  // per vendor, but for the mock we duplicate them for clarity.
  const PRICING_CATEGORIES = {
    adult:  { id: 5001, title: 'Adult',  fullTitle: 'Adult (16+)',    minAge: 16, maxAge: null, defaultCategory: true },
    child:  { id: 5002, title: 'Child',  fullTitle: 'Child (6–15)',   minAge: 6,  maxAge: 15,   defaultCategory: false },
    infant: { id: 5003, title: 'Infant', fullTitle: 'Infant (0–5)',   minAge: 0,  maxAge: 5,    defaultCategory: false },
    senior: { id: 5004, title: 'Senior', fullTitle: 'Senior (65+)',   minAge: 65, maxAge: null, defaultCategory: false },
  };

  // ---------------------------------------------------------------- Helpers --
  const adult  = (amount) => ({ pricingCategoryId: PRICING_CATEGORIES.adult.id,  amount, currency: 'TWD' });
  const child  = (amount) => ({ pricingCategoryId: PRICING_CATEGORIES.child.id,  amount, currency: 'TWD' });
  const infant = (amount) => ({ pricingCategoryId: PRICING_CATEGORIES.infant.id, amount, currency: 'TWD' });
  const senior = (amount) => ({ pricingCategoryId: PRICING_CATEGORIES.senior.id, amount, currency: 'TWD' });

  // ------------------------------------------------------------- Activities --
  const ACTIVITIES = [
    // ====== 1 — South Coast & Glacier Lagoon ===============================
    {
      id: 723456,
      externalId: 'AAA-SC-001',
      slug: 'south-coast-glacier-lagoon',
      title: 'South Coast & Glacier Lagoon',
      summary: 'Full-day tour from Reykjavík to the glacier lagoon and diamond beach.',
      description:
        '<p>Pickup at 07:30 from your hotel in Reykjavík. We follow the Ring Road past Seljalandsfoss and Skógafoss, stop at the black-sand beach of Reynisfjara, and continue east to the breathtaking Jökulsárlón glacier lagoon. Return to Reykjavík by 20:30.</p>' +
        '<ul><li>Bilingual guide (English + Mandarin on selected departures)</li><li>WiFi-equipped coach</li><li>Free cancellation up to 24 hours before</li></ul>',
      durationText: '11 hours',
      durationMinutes: 660,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.arctic,

      pricingCategories: [PRICING_CATEGORIES.adult, PRICING_CATEGORIES.child, PRICING_CATEGORIES.infant],
      pricing: [adult(4280), child(2140), infant(0)],
      nextDefaultPrice: { amount: 4280, currency: 'TWD' },

      // Real-time availability placeholder — the live API requires a second
      // call to /availability.json; the activity payload tells us it's
      // bookable, the dates it's offered, and the last cache timestamp.
      availability: {
        type: 'LIVE',
        bookableNow: true,
        lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15'],
        capacityRemaining: 24,
        warning: null,
      },

      startTimes: [
        { id: 7001, hour: 7,  minute: 30, label: '07:30' },
      ],

      meetingType: 'PICK_UP',
      meetingPoint: {
        title: 'Hotel pickup, Reykjavík',
        address: 'Greater Reykjavík area',
        geoPoint: { latitude: 64.1466, longitude: -21.9426 },
      },

      stops: [
        { id: 91, title: 'Seljalandsfoss waterfall', geoPoint: { latitude: 63.6157, longitude: -19.9929 }, durationMinutes: 30 },
        { id: 92, title: 'Reynisfjara black-sand beach', geoPoint: { latitude: 63.4060, longitude: -19.0454 }, durationMinutes: 45 },
        { id: 93, title: 'Jökulsárlón glacier lagoon', geoPoint: { latitude: 64.0480, longitude: -16.1810 }, durationMinutes: 90 },
        { id: 94, title: 'Diamond Beach', geoPoint: { latitude: 64.0438, longitude: -16.1799 }, durationMinutes: 30 },
      ],

      themes: ['Day Tours', 'Nature & Wildlife'],
      categories: ['Self-drive', 'Glacier'],
      keywords: ['South Coast', 'Jökulsárlón', 'Diamond Beach', 'Reynisfjara'],
      languages: ['en', 'zh', 'ja'],

      coverImageUrl: '/assets/photos/lagoon-hero.jpg',
      coverImagePlaceholder: 'lagoon',
      photos: [],

      averageRating: 4.8,
      reviewCount: 1204,
      cancellationCutoffMinutes: 1440,

      tags: ['top_pick'],
    },

    // ====== 2 — Northern Lights minibus ====================================
    {
      id: 723457,
      externalId: 'REX-NL-014',
      slug: 'northern-lights-minibus',
      title: 'Northern Lights minibus',
      summary: 'Small-group evening hunt for the Aurora — 4 hours from Reykjavík.',
      description: '<p>Your guide reads the cloud-cover map live and picks the best viewing spot of the night. Hot chocolate and Icelandic kleinur included.</p>',
      durationText: '4 hours',
      durationMinutes: 240,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.rex,

      pricingCategories: [PRICING_CATEGORIES.adult, PRICING_CATEGORIES.child],
      pricing: [adult(3200), child(1600)],
      nextDefaultPrice: { amount: 3200, currency: 'TWD' },

      availability: {
        type: 'LIVE', bookableNow: true, lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-13', '2026-03-14'],
        capacityRemaining: 8,
        warning: 'WEATHER_DEPENDENT',
      },

      startTimes: [
        { id: 7011, hour: 20, minute: 30, label: '20:30' },
        { id: 7012, hour: 21, minute: 30, label: '21:30' },
      ],

      meetingType: 'PICK_UP',
      meetingPoint: {
        title: 'Hotel pickup, Reykjavík',
        address: 'Greater Reykjavík area',
        geoPoint: { latitude: 64.1466, longitude: -21.9426 },
      },

      stops: [
        { id: 95, title: 'Reykjavík', geoPoint: { latitude: 64.1466, longitude: -21.9426 }, durationMinutes: 15 },
        { id: 96, title: 'Þingvellir National Park', geoPoint: { latitude: 64.2559, longitude: -21.1295 }, durationMinutes: 120 },
      ],

      themes: ['Northern Lights', 'Evening Tours'],
      categories: ['Aurora'],
      keywords: ['Aurora', 'Northern Lights', 'Þingvellir'],
      languages: ['en', 'zh'],

      coverImageUrl: '/assets/photos/aurora-hero.jpg',
      coverImagePlaceholder: 'aurora',
      photos: [],

      averageRating: 4.6,
      reviewCount: 3812,
      cancellationCutoffMinutes: 720,

      tags: ['selling_fast', 'mandarin_guide'],
    },

    // ====== 3 — Blue Lagoon Premium ========================================
    {
      id: 723458,
      externalId: 'BL-PREMIUM',
      slug: 'blue-lagoon-premium',
      title: 'Blue Lagoon · Premium',
      summary: 'Skip-the-line access to the Blue Lagoon plus premium amenities.',
      description: '<p>Includes premium robe, slippers, towel, sparkling wine, and a reserved table at the Lava Restaurant.</p>',
      durationText: '3 hours',
      durationMinutes: 180,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.blue,

      pricingCategories: [PRICING_CATEGORIES.adult, PRICING_CATEGORIES.senior],
      pricing: [adult(5600), senior(4800)],
      nextDefaultPrice: { amount: 5600, currency: 'TWD' },

      availability: {
        type: 'LIVE', bookableNow: true, lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15', '2026-03-16'],
        capacityRemaining: 80,
        warning: null,
      },

      startTimes: [
        { id: 7021, hour: 10, minute: 0, label: '10:00' },
        { id: 7022, hour: 12, minute: 0, label: '12:00' },
        { id: 7023, hour: 14, minute: 0, label: '14:00' },
      ],

      meetingType: 'MEET_ON_LOCATION',
      meetingPoint: {
        title: 'Blue Lagoon entrance',
        address: 'Norðurljósavegur 9, 240 Grindavík, Iceland',
        geoPoint: { latitude: 63.8804, longitude: -22.4495 },
      },

      stops: [
        { id: 97, title: 'Blue Lagoon premium lounge', geoPoint: { latitude: 63.8804, longitude: -22.4495 }, durationMinutes: 180 },
      ],

      themes: ['Spa & Wellness'],
      categories: ['Hot spring'],
      keywords: ['Blue Lagoon', 'spa', 'hot spring'],
      languages: ['en'],

      coverImageUrl: '/assets/photos/bluelagoon-hero.jpg',
      coverImagePlaceholder: 'bluelagoon',
      photos: [],

      averageRating: 4.7,
      reviewCount: 2210,
      cancellationCutoffMinutes: 2880,

      tags: ['premium'],
    },

    // ====== 4 — Golden Circle classic ======================================
    {
      id: 723459,
      externalId: 'IPT-GC-100',
      slug: 'golden-circle-classic',
      title: 'Golden Circle classic',
      summary: 'Þingvellir, Geysir, Gullfoss — the three jewels of Iceland in one day.',
      description: '<p>Mid-size coach with panoramic windows. Bilingual audio commentary in English and Mandarin.</p>',
      durationText: '8 hours',
      durationMinutes: 480,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.iceland,

      pricingCategories: [PRICING_CATEGORIES.adult, PRICING_CATEGORIES.child, PRICING_CATEGORIES.infant],
      pricing: [adult(2980), child(1490), infant(0)],
      nextDefaultPrice: { amount: 2980, currency: 'TWD' },

      availability: {
        type: 'LIVE', bookableNow: true, lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15'],
        capacityRemaining: 36,
        warning: null,
      },

      startTimes: [
        { id: 7031, hour: 8, minute: 30, label: '08:30' },
        { id: 7032, hour: 9, minute: 0,  label: '09:00' },
      ],

      meetingType: 'PICK_UP',
      meetingPoint: {
        title: 'Hotel pickup, Reykjavík',
        address: 'Greater Reykjavík area',
        geoPoint: { latitude: 64.1466, longitude: -21.9426 },
      },

      stops: [
        { id: 98, title: 'Þingvellir National Park', geoPoint: { latitude: 64.2559, longitude: -21.1295 }, durationMinutes: 60 },
        { id: 99, title: 'Geysir geothermal area',   geoPoint: { latitude: 64.3104, longitude: -20.3024 }, durationMinutes: 45 },
        { id: 100, title: 'Gullfoss waterfall',      geoPoint: { latitude: 64.3271, longitude: -20.1199 }, durationMinutes: 30 },
      ],

      themes: ['Day Tours', 'Sightseeing'],
      categories: ['Day trip'],
      keywords: ['Golden Circle', 'Geysir', 'Gullfoss', 'Þingvellir'],
      languages: ['en', 'zh', 'ja', 'ko'],

      coverImageUrl: '/assets/photos/geyser-hero.jpg',
      coverImagePlaceholder: 'geyser',
      photos: [],

      averageRating: 4.5,
      reviewCount: 5042,
      cancellationCutoffMinutes: 1440,

      tags: ['mandarin_guide'],
    },

    // ====== 5 — Glacier hike & ice cave ====================================
    {
      id: 723460,
      externalId: 'TROLL-GH-022',
      slug: 'glacier-hike-ice-cave',
      title: 'Glacier hike & ice cave',
      summary: 'Strap on crampons and walk the Vatnajökull ice — descend into a natural blue cave.',
      description: '<p>Intermediate-level. All technical equipment provided. Minimum age 12. Includes pickup from Skaftafell visitor centre.</p>',
      durationText: '9 hours',
      durationMinutes: 540,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.troll,

      pricingCategories: [PRICING_CATEGORIES.adult, PRICING_CATEGORIES.child],
      pricing: [adult(6480), child(3240)],
      nextDefaultPrice: { amount: 6480, currency: 'TWD' },

      availability: {
        type: 'LIVE', bookableNow: true, lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-13', '2026-03-15'],
        capacityRemaining: 4,
        warning: 'WEATHER_DEPENDENT',
      },

      startTimes: [{ id: 7041, hour: 9, minute: 0, label: '09:00' }],

      meetingType: 'MEET_ON_LOCATION',
      meetingPoint: {
        title: 'Skaftafell visitor centre',
        address: 'Skaftafell, 785 Öræfi',
        geoPoint: { latitude: 64.0166, longitude: -16.9667 },
      },

      stops: [
        { id: 101, title: 'Skaftafell base camp', geoPoint: { latitude: 64.0166, longitude: -16.9667 }, durationMinutes: 30 },
        { id: 102, title: 'Falljökull glacier tongue', geoPoint: { latitude: 64.0080, longitude: -16.8800 }, durationMinutes: 240 },
        { id: 103, title: 'Crystal ice cave',     geoPoint: { latitude: 64.0050, longitude: -16.8500 }, durationMinutes: 120 },
      ],

      themes: ['Adventure', 'Glacier'],
      categories: ['Glacier', 'Adventure'],
      keywords: ['Vatnajökull', 'ice cave', 'glacier hike'],
      languages: ['en'],

      coverImageUrl: '/assets/photos/glacier-hero.jpg',
      coverImagePlaceholder: 'glacier',
      photos: [],

      averageRating: 4.9,
      reviewCount: 920,
      cancellationCutoffMinutes: 2880,

      tags: ['top_pick'],
    },

    // ====== 6 — Reykjanes volcano fly-over =================================
    {
      id: 723461,
      externalId: 'NF-RK-VOLC-45',
      slug: 'reykjanes-volcano-flyover',
      title: 'Reykjanes volcano fly-over',
      summary: '45-minute scenic helicopter over the active volcanic system.',
      description: '<p>Departs Reykjavík Domestic Airport. Window seat guaranteed. Maximum five passengers.</p>',
      durationText: '45 minutes',
      durationMinutes: 45,
      bookingType: 'DATE_AND_TIME',
      currency: 'TWD',
      defaultCurrency: 'ISK',

      vendor: VENDORS.nordur,

      pricingCategories: [PRICING_CATEGORIES.adult],
      pricing: [adult(12800)],
      nextDefaultPrice: { amount: 12800, currency: 'TWD' },

      availability: {
        type: 'LIVE', bookableNow: true, lastChecked: NOW_ISO,
        nextAvailableDates: ['2026-03-12', '2026-03-14'],
        capacityRemaining: 3,
        warning: 'WEATHER_DEPENDENT',
      },

      startTimes: [
        { id: 7051, hour: 11, minute: 0, label: '11:00' },
        { id: 7052, hour: 14, minute: 0, label: '14:00' },
      ],

      meetingType: 'MEET_ON_LOCATION',
      meetingPoint: {
        title: 'Reykjavík Domestic Airport',
        address: 'Nauthólsvegur 5, 102 Reykjavík',
        geoPoint: { latitude: 64.1300, longitude: -21.9406 },
      },

      stops: [
        { id: 104, title: 'Fagradalsfjall volcano', geoPoint: { latitude: 63.9020, longitude: -22.2700 }, durationMinutes: 25 },
      ],

      themes: ['Adventure', 'Premium'],
      categories: ['Premium'],
      keywords: ['helicopter', 'Reykjanes', 'volcano'],
      languages: ['en'],

      coverImageUrl: '/assets/photos/sunset-hero.jpg',
      coverImagePlaceholder: 'sunset',
      photos: [],

      averageRating: 4.9,
      reviewCount: 314,
      cancellationCutoffMinutes: 4320,

      tags: ['premium'],
    },
  ];

  window.AuralisData = window.AuralisData || {};
  window.AuralisData.MOCK_BOKUN_ACTIVITIES = ACTIVITIES;
  window.AuralisData.MOCK_BOKUN_VENDORS = VENDORS;
  window.AuralisData.MOCK_BOKUN_PRICING_CATEGORIES = PRICING_CATEGORIES;
})();
