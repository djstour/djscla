/* bokunAdapter.js
 * ----------------------------------------------------------------------------
 * Thin adapter layer between Bókun's raw API payloads and our UI components.
 *
 * It does FOUR things:
 *
 *   1. fetchActivities()        → simulates `GET /activity.json`.
 *                                  Real implementation swaps this for
 *                                  `fetch('/api/bokun/activities')`.
 *   2. toViewModel(activity,lang)→ flattens a raw activity into the lean
 *                                  `TourViewModel` our components render.
 *   3. localize(...)             → generic accessor that prefers the manual
 *                                  / OpenAI translation overlay, falling back
 *                                  to the English source.
 *   4. validateTranslation(...)  → returns 'fresh' | 'stale' | 'missing' so
 *                                  the OpenAI pipeline knows what to re-queue.
 *
 * No framework dependencies; safe to load before React. Exposes itself as
 * `window.AuralisData.BokunAdapter` plus a React hook `useActivities` that
 * returns { loading, error, activities } once React is available.
 * ----------------------------------------------------------------------------
 * VIEW MODEL SHAPE (consumed by TourCard, TripPanel, Checkout):
 *
 *   {
 *     id:           number,            // Bókun activity id
 *     title:        string,            // already localised
 *     titleEn:      string,            // raw EN — useful for analytics
 *     summary:      string,            // localised, plain text (no HTML)
 *     supplier:     string,            // vendor.title (Latin brand name)
 *     supplierRole: string,            // localised vendor role line
 *     duration:     string,            // localised duration
 *     mode:         string,            // localised mode label
 *     rating:       number,
 *     reviews:      number,
 *     price:        number,            // default-adult price in user currency
 *     priceTable:   PricingRow[],      // per-category breakdown, localised
 *     badge:        string|null,       // localised badge label
 *     photo:        string,            // gradient preset until real photo
 *     stops:        StopVM[],          // localised stop names + geo
 *     tags:         TagVM[],
 *     availability: AvailabilityVM,
 *     raw:          Activity,          // pass-through for power consumers
 *   }
 * ============================================================================ */

(function () {
  const A = (window.AuralisData = window.AuralisData || {});

  // Tiny helper — strip HTML tags out of a Bókun description (they ship
  // rich-text). Production should use DOMPurify; this is fine for a prototype.
  function stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Generic overlay lookup with fallback. Always returns a string.
  // `entry` is a { hant, hans, en, meta? } object OR null/undefined.
  // `fallback` is the raw English string (mandatory) used when no overlay
  // exists for the chosen lang.
  function pickFromOverlay(entry, lang, fallback) {
    if (!entry) return fallback;
    if (entry[lang] != null && entry[lang] !== '') return entry[lang];
    // Cross-script fallback within Chinese before reaching English.
    if (lang === 'hant' && entry.hans) return entry.hans;
    if (lang === 'hans' && entry.hant) return entry.hant;
    if (entry.en) return entry.en;
    return fallback;
  }

  // ---------------------------------------------------- public surface --

  const BokunAdapter = {
    /* ---- 1. fetch ---- */

    /**
     * Simulated GET /activity.json. The real call would attach an
     * `X-Bokun-AccessKey` header and respect the `Accept-Language` we set
     * via langToBokunLocale(); for now we return our static mocks after a
     * short delay so the UI has a chance to render its skeleton state.
     */
    fetchActivities(opts = {}) {
      const { lang = 'hant', page = 1, pageSize = 50, useMockOnError = true } = opts;

      if (typeof fetch === 'undefined') {
        return Promise.resolve(JSON.parse(JSON.stringify(A.MOCK_BOKUN_ACTIVITIES)));
      }

      const qs = new URLSearchParams({
        lang,
        page: String(page),
        pageSize: String(pageSize),
      });

      return fetch(`/api/bokun/activities?${qs}`)
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Bókun proxy HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const list = data.activities;
          if (!Array.isArray(list)) {
            throw new Error('Invalid response from /api/bokun/activities');
          }
          return list;
        })
        .catch((err) => {
          if (useMockOnError && A.MOCK_BOKUN_ACTIVITIES && A.MOCK_BOKUN_ACTIVITIES.length) {
            console.warn('[Auralis] Bókun API unavailable — showing mocks:', err.message);
            return JSON.parse(JSON.stringify(A.MOCK_BOKUN_ACTIVITIES));
          }
          throw err;
        });
    },

    fetchActivityById(id) {
      return BokunAdapter.fetchActivities().then(list => list.find(a => a.id === id));
    },

    // Bókun expects ISO 639-1 + optional region for the Accept-Language header.
    langToBokunLocale(lang) {
      return { hant: 'zh-Hant-TW', hans: 'zh-Hans-CN', en: 'en-US' }[lang] || 'en-US';
    },

    /* ---- 2. view-model mapping ---- */

    /**
     * Flatten a raw Bókun activity into the lean view-model our React
     * components render. Pure function — no React, no I/O.
     */
    toViewModel(activity, lang = 'hant') {
      const T = A.BOKUN_TRANSLATIONS || { ACTIVITIES: {}, VENDOR: {}, TAG: {}, PRICING_CATEGORY: {}, WARNING: {} };
      const overlay = T.ACTIVITIES[activity.id] || {};

      // ---- core text ----
      const title = pickFromOverlay(overlay.title, lang, activity.title);
      const summary = pickFromOverlay(overlay.summary, lang, stripHtml(activity.summary || activity.description));
      const mode = pickFromOverlay(overlay.mode, lang, activity.categories && activity.categories[0]);

      // ---- vendor ----
      const vendorOverlay = T.VENDOR[activity.vendor && activity.vendor.id] || {};
      const supplier = activity.vendor ? activity.vendor.title : '';
      const supplierRole = pickFromOverlay(vendorOverlay.role, lang, '');

      // ---- duration ----
      // Bókun ships `durationText` as English. For Chinese locales we render
      // a templated version using the numeric `durationMinutes`.
      const duration = formatDuration(activity.durationMinutes, lang) || activity.durationText;

      // ---- pricing ----
      const defaultCategoryId = (activity.pricingCategories || []).find(c => c.defaultCategory)?.id
                              ?? activity.pricingCategories?.[0]?.id;
      const defaultRow = (activity.pricing || []).find(p => p.pricingCategoryId === defaultCategoryId)
                     || activity.pricing?.[0];

      const priceTable = (activity.pricing || []).map(row => {
        const cat = T.PRICING_CATEGORY[row.pricingCategoryId];
        const catRaw = (activity.pricingCategories || []).find(c => c.id === row.pricingCategoryId);
        return {
          categoryId: row.pricingCategoryId,
          label: pickFromOverlay(cat, lang, catRaw ? catRaw.fullTitle : 'Adult'),
          amount: row.amount,
          currency: row.currency,
        };
      });

      // ---- stops (for the trip-with-map screen) ----
      const stops = (activity.stops || []).map(stop => ({
        id: stop.id,
        name: pickFromOverlay(overlay.stops && overlay.stops[stop.id], lang, stop.title),
        geo: stop.geoPoint,
        durationMinutes: stop.durationMinutes,
      }));

      // ---- tags ----
      const tags = (activity.tags || []).map(key => ({
        key,
        label: pickFromOverlay(T.TAG[key], lang, key),
      }));

      // ---- badge (a single hero label) ----
      const badgeKey = pickPrimaryBadge(activity.tags);
      const badge = badgeKey ? pickFromOverlay(T.TAG[badgeKey], lang, '') : null;

      // ---- availability ----
      const avWarning = activity.availability && activity.availability.warning;
      const availability = {
        bookableNow: !!(activity.availability && activity.availability.bookableNow),
        capacityRemaining: activity.availability?.capacityRemaining ?? null,
        nextAvailableDates: activity.availability?.nextAvailableDates || [],
        warning: avWarning ? pickFromOverlay(T.WARNING[avWarning], lang, avWarning) : null,
        cancellationCutoffMinutes: activity.cancellationCutoffMinutes,
        lastChecked: activity.availability?.lastChecked,
      };

      return {
        id: activity.id,
        title,
        titleEn: activity.title,
        summary,
        supplier,
        supplierRole,
        duration,
        mode,
        rating: activity.averageRating,
        reviews: activity.reviewCount,
        price: defaultRow ? defaultRow.amount : 0,
        priceCurrency: defaultRow ? defaultRow.currency : 'TWD',
        priceTable,
        badge,
        badgeKey,
        photo: activity.coverImagePlaceholder || 'aurora',
        coverImageUrl: activity.coverImageUrl,
        stops,
        tags,
        availability,
        vendor: activity.vendor,
        languages: activity.languages || [],
        raw: activity,
      };
    },

    toViewModels(activities, lang) {
      return activities.map(a => BokunAdapter.toViewModel(a, lang));
    },

    /* ---- 3. translation accessors ---- */

    pickFromOverlay,

    // Top-level convenience for translating tags / categories / pricing in
    // contexts where you don't have an activity in hand.
    tagLabel(key, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.TAG?.[key], lang, key);
    },
    categoryLabel(key, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.CATEGORY?.[key], lang, key);
    },
    pricingCategoryLabel(id, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.PRICING_CATEGORY?.[id], lang, '');
    },
    warningLabel(key, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.WARNING?.[key], lang, key);
    },

    /* ---- 4. translation validation ---- */

    /**
     * Returns 'fresh' | 'stale' | 'missing' for a given activity/field/lang.
     * The OpenAI worker queries this to decide which jobs to enqueue.
     *
     *   `currentSourceHash` — sha1(activity[fieldPath]) at fetch time
     */
    validateTranslation(activityId, fieldPath, lang, currentSourceHash) {
      const T = A.BOKUN_TRANSLATIONS || {};
      const overlay = T.ACTIVITIES[activityId];
      if (!overlay || !overlay[fieldPath]) return 'missing';
      const entry = overlay[fieldPath];
      if (entry[lang] == null || entry[lang] === '') return 'missing';
      if (entry.meta?.sourceHash && entry.meta.sourceHash !== currentSourceHash) return 'stale';
      return 'fresh';
    },
  };

  // -------- helpers --------

  function formatDuration(mins, lang) {
    if (!mins) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) {
      return ({ hant: `${m} 分鐘`, hans: `${m} 分钟`, en: `${m} min` }[lang]);
    }
    const baseHr = ({ hant: '小時', hans: '小时', en: 'hr' }[lang]);
    const baseMin = ({ hant: '分', hans: '分', en: 'min' }[lang]);
    return m === 0 ? `${h} ${baseHr}` : `${h} ${baseHr} ${m} ${baseMin}`;
  }

  // Pick the badge key with the highest visual priority for a card.
  // Bókun lets vendors set multiple tags; we surface only one as a hero badge.
  function pickPrimaryBadge(tags = []) {
    const priority = ['top_pick', 'selling_fast', 'premium'];
    for (const p of priority) if (tags.includes(p)) return p;
    return null;
  }

  A.BokunAdapter = BokunAdapter;

  // ----------------------------------- React hook (registered if React loaded)
  // Components import this via `window.AuralisData.useActivities(lang)`.
  // Returns { loading, error, activities }. Refetches when lang changes so
  // the view-model strings stay in sync with the toggle.
  function attachReactHook() {
    if (typeof React === 'undefined') return;
    const { useState, useEffect } = React;

    A.useActivities = function useActivities(lang) {
      const [state, setState] = useState({ loading: true, error: null, activities: [], raw: [] });

      useEffect(() => {
        let cancelled = false;
        // Don't reset `activities` while refetching for a lang change — we
        // remap the existing raw data synchronously so the screen never goes
        // blank during a locale flip. Only show the loading skeleton on the
        // initial mount.
        setState(s => ({ ...s, loading: s.raw.length === 0, error: null }));

        const remap = (raw) => {
          if (cancelled) return;
          const viewModels = BokunAdapter.toViewModels(raw, lang);
          setState({ loading: false, error: null, activities: viewModels, raw });
        };

        if (state.raw.length > 0) {
          // Cheap path: lang change. Remap synchronously, no fetch.
          remap(state.raw);
        } else {
          BokunAdapter.fetchActivities({ lang })
            .then(remap)
            .catch(err => { if (!cancelled) setState({ loading: false, error: err, activities: [], raw: [] }); });
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [lang]);

      return state;
    };
  }
  attachReactHook();
  // In case React loads AFTER this file, retry on next macrotask.
  if (!A.useActivities) setTimeout(attachReactHook, 0);
})();
