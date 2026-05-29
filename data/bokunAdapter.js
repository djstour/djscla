/* bokunAdapter.js
 * ----------------------------------------------------------------------------
 * Thin adapter layer between Bókun's raw API payloads and our UI components.
 *
 * It does FOUR things:
 *
 *   1. fetchActivities()        → GET /api/catalog/activities (Supabase mirror, source=db).
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
 *     summary:      string,            // localised, plain text (no HTML)
 *     supplier:     string,            // vendor.titleOriginal | title (never localized)
 *     supplierRole: string,            // unused — brand name only
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
  const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
  const activityDetailCache = new Map();
  const activityDetailInflight = new Map();

  function detailCacheKey(id, lang) {
    return `${id}:${lang}`;
  }

  function getCachedActivityDetail(id, lang) {
    const hit = activityDetailCache.get(detailCacheKey(id, lang));
    if (!hit) return null;
    if (Date.now() - hit.at > DETAIL_CACHE_TTL_MS) {
      activityDetailCache.delete(detailCacheKey(id, lang));
      return null;
    }
    if (pricingLooksMislabeled(hit.activity)) {
      activityDetailCache.delete(detailCacheKey(id, lang));
      return null;
    }
    return hit.activity;
  }

  function setCachedActivityDetail(id, lang, activity) {
    activityDetailCache.set(detailCacheKey(id, lang), { activity, at: Date.now() });
  }

  // Overlay lookup. English may use Bókun source as fallback; zh locales never
  // surface raw English or entry.en when hant/hans is missing.
  function pickFromOverlay(entry, lang, fallback) {
    const fb = fallback != null ? String(fallback) : '';
    if (lang === 'en') {
      if (!entry) return fb;
      if (entry.en != null && entry.en !== '') return entry.en;
      if (entry[lang] != null && entry[lang] !== '') return entry[lang];
      return fb;
    }
    if (!entry) return '';
    if (entry[lang] != null && entry[lang] !== '') return entry[lang];
    return '';
  }

  function guideLanguageLabel(phrase, lang) {
    if (!phrase) return '';
    return String(phrase);
  }

  function localizeMeetingPoint(mp, lang) {
    if (!mp) return null;
    return mp;
  }

  /** Merge static bokunTranslations.js with Supabase overlays from API. */
  function mergeActivityOverlay(staticOverlay, runtimeOverlay) {
    if (!staticOverlay || !Object.keys(staticOverlay).length) {
      return runtimeOverlay ? JSON.parse(JSON.stringify(runtimeOverlay)) : {};
    }
    if (!runtimeOverlay || !Object.keys(runtimeOverlay).length) {
      return JSON.parse(JSON.stringify(staticOverlay));
    }
    const out = JSON.parse(JSON.stringify(staticOverlay));
    Object.keys(runtimeOverlay).forEach((key) => {
      const val = runtimeOverlay[key];
      if (key === 'stops' && val && typeof val === 'object') {
        out.stops = out.stops || {};
        Object.keys(val).forEach((stopId) => {
          out.stops[stopId] = { ...(out.stops[stopId] || {}), ...val[stopId] };
        });
      } else if (val && typeof val === 'object') {
        out[key] = { ...(out[key] || {}), ...val };
      } else {
        out[key] = val;
      }
    });
    return out;
  }

  function getActivityOverlay(activityId) {
    const T = A.BOKUN_TRANSLATIONS || {};
    const staticO = (T.ACTIVITIES && T.ACTIVITIES[activityId]) || {};
    const runtime = (A._runtimeTranslations && A._runtimeTranslations[String(activityId)]) || {};
    return mergeActivityOverlay(staticO, runtime);
  }

  // ---------------------------------------------------- public surface --

  const BokunAdapter = {
    /* ---- 1. fetch ---- */

    /**
     * GET /api/bokun/activities → production Bókun catalog (no mock fallback).
     * @returns {Promise<{ activities: object[], meta: { total?: number, page?: number, pageSize?: number } }>}
     */
    fetchActivities(opts = {}) {
      const {
        lang = 'hant',
        page = 1,
        pageSize = 36,
        all = false,
        vendorId,
        maxItems = 2000,
        append = false,
      } = opts;

      if (typeof fetch === 'undefined') {
        const err = new Error('fetch is not available — use a browser or vercel dev');
        err.code = 'NO_FETCH';
        return Promise.reject(err);
      }

      const qs = new URLSearchParams({ lang });
      if (all) {
        qs.set('all', 'true');
        qs.set('maxItems', String(maxItems));
      } else {
        qs.set('page', String(page));
        qs.set('pageSize', String(pageSize));
      }
      if (vendorId != null && vendorId !== '') qs.set('vendorId', String(vendorId));

      return fetch(`/api/catalog/activities?${qs}`)
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Bókun proxy HTTP ${res.status}`);
            err.status = res.status;
            err.hints = data.hints;
            throw err;
          }
          const list = data.activities;
          if (!Array.isArray(list)) {
            throw new Error('Invalid response from /api/catalog/activities');
          }
          if (data.translations && typeof data.translations === 'object') {
            A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...data.translations };
          }
          return {
            activities: list,
            meta: data.meta || { total: list.length, page, pageSize },
            translations: data.translations || {},
          };
        });
    },

    /**
     * GET /api/catalog/featured — admin-curated homepage rail (Supabase).
     */
    fetchFeatured(opts = {}) {
      const { lang = 'hant', limit = 6 } = opts;

      if (typeof fetch === 'undefined') {
        const err = new Error('fetch is not available — use a browser or vercel dev');
        err.code = 'NO_FETCH';
        return Promise.reject(err);
      }

      const qs = new URLSearchParams({ lang, limit: String(limit) });

      return fetch(`/api/catalog/featured?${qs}`)
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Featured HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const list = data.activities;
          if (!Array.isArray(list)) {
            throw new Error('Invalid response from /api/catalog/featured');
          }
          if (data.translations && typeof data.translations === 'object') {
            A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...data.translations };
          }
          return {
            activities: list,
            meta: data.meta || { total: list.length },
            translations: data.translations || {},
          };
        });
    },

    /**
     * GET /api/catalog/collections — homepage marketing rails (Supabase).
     */
    fetchCollections(opts = {}) {
      const { lang = 'hant' } = opts;

      if (typeof fetch === 'undefined') {
        const err = new Error('fetch is not available — use a browser or vercel dev');
        err.code = 'NO_FETCH';
        return Promise.reject(err);
      }

      const qs = new URLSearchParams({ lang });

      return fetch(`/api/catalog/collections?${qs}`)
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Collections HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const list = data.collections;
          if (!Array.isArray(list)) {
            throw new Error('Invalid response from /api/catalog/collections');
          }
          if (data.translations && typeof data.translations === 'object') {
            A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...data.translations };
          }
          return {
            collections: list,
            meta: data.meta || { count: list.length },
            translations: data.translations || {},
          };
        });
    },

    /**
     * Lightweight catalog typeahead — hits Supabase via /api/catalog/activities
     * with the FTS `q` param. Returns view-models so callers can render rows
     * with the same shape as the rest of the catalog.
     *
     * Inflight requests for the same query are coalesced; out-of-order
     * responses are dropped via a monotonic request token.
     */
    searchCatalog(q, opts = {}) {
      const { lang = 'hant', limit = 8, signal } = opts;
      const query = String(q || '').trim();
      if (!query) {
        return Promise.resolve({ query: '', activities: [], meta: { total: 0 } });
      }
      if (typeof fetch === 'undefined') {
        return Promise.reject(new Error('fetch is not available'));
      }
      const qs = new URLSearchParams({
        lang,
        q: query,
        all: 'true',
        maxItems: String(Math.max(1, Math.min(limit, 24))),
      });
      return fetch(`/api/catalog/activities?${qs}`, { signal })
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Search HTTP ${res.status}`);
            err.status = res.status;
            throw err;
          }
          const raw = Array.isArray(data.activities) ? data.activities : [];
          return {
            query,
            activities: BokunAdapter.toViewModels(raw, lang),
            meta: data.meta || { total: raw.length },
          };
        });
    },

    fetchActivityById(id, opts = {}) {
      const { lang = 'hant' } = opts;
      const numId = Number(id);
      if (!Number.isFinite(numId)) {
        return Promise.reject(new Error('Invalid activity id'));
      }

      const cacheKey = detailCacheKey(numId, lang);
      const cached = getCachedActivityDetail(numId, lang);
      if (cached) return Promise.resolve(cached);

      if (activityDetailInflight.has(cacheKey)) {
        return activityDetailInflight.get(cacheKey);
      }

      const qs = new URLSearchParams({ lang, id: String(numId) });
      const request = fetch(`/api/bokun/activity?${qs}`)
        .then((res) => res.json().then((data) => ({ res, data })))
        .then(({ res, data }) => {
          if (!res.ok) {
            const err = new Error(data.error || `Bókun activity HTTP ${res.status}`);
            err.status = res.status;
            err.hints = data.hints;
            throw err;
          }
          if (!data.activity || data.activity.id == null) {
            throw new Error('Invalid response from /api/bokun/activity');
          }
          if (data.translations && typeof data.translations === 'object') {
            A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...data.translations };
          }
          setCachedActivityDetail(numId, lang, data.activity);
          return data.activity;
        })
        .finally(() => {
          activityDetailInflight.delete(cacheKey);
        });

      activityDetailInflight.set(cacheKey, request);
      return request;
    },

    /** Warm detail cache on card hover / intersection (no-op if already cached). */
    prefetchActivityById(id, opts = {}) {
      const { lang = 'hant' } = opts;
      const numId = Number(id);
      if (!Number.isFinite(numId)) return;
      if (getCachedActivityDetail(numId, lang) || activityDetailInflight.has(detailCacheKey(numId, lang))) {
        return;
      }
      BokunAdapter.fetchActivityById(numId, { lang }).catch(() => {});
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
      const overlay = getActivityOverlay(activity.id);

      // ---- core text ----
      // zh locales should prefer translation overlays from Supabase/static map;
      // English continues to fall back to Bókun source text.
      const sourceTitle = String(activity.title || '');
      const sourceSummary = String(activity.summary || '');
      const sourceDescription = String(activity.description || activity.summary || '');
      const sourceIncludedHtml = String(activity.includedHtml || '');
      const sourceExcludedHtml = String(activity.excludedHtml || '');
      const sourceRequirementsHtml = String(activity.requirementsHtml || '');
      const sourceAttentionHtml = String(activity.attentionHtml || '');
      const sourceCancellationPolicyTitle = String(activity.cancellationPolicyTitle || '');
      const sourceCancellationPolicyHtml = String(activity.cancellationPolicyHtml || '');
      const sourceTicketInfoHtml = String(activity.ticketInfoHtml || '');
      const PaxRef = typeof window !== 'undefined' ? window.AuralisPax : null;
      const sourceDurationText = (PaxRef && PaxRef.resolveActivityDuration)
        ? PaxRef.resolveActivityDuration({
          raw: activity,
          durationText: activity.durationText,
          duration: activity.duration,
        })
        : String(activity.durationText || activity.duration || '');
      const sourceKnowItems = Array.isArray(activity.knowBeforeYouGoItems) ? activity.knowBeforeYouGoItems : [];
      const title = pickFromOverlay(overlay.title, lang, sourceTitle)
        || (lang === 'en' ? sourceTitle : '');
      const summary = pickFromOverlay(overlay.summary, lang, sourceSummary)
        || (lang === 'en' ? sourceSummary : '');
      const description = pickFromOverlay(overlay.description, lang, sourceDescription)
        || pickFromOverlay(overlay.summary, lang, sourceSummary)
        || (lang === 'en' ? sourceDescription : '');
      const includedHtml = pickFromOverlay(overlay.includedHtml, lang, sourceIncludedHtml)
        || (lang === 'en' ? sourceIncludedHtml : '');
      const excludedHtml = pickFromOverlay(overlay.excludedHtml, lang, sourceExcludedHtml)
        || (lang === 'en' ? sourceExcludedHtml : '');
      const requirementsHtml = pickFromOverlay(overlay.requirementsHtml, lang, sourceRequirementsHtml)
        || (lang === 'en' ? sourceRequirementsHtml : '');
      const attentionHtml = pickFromOverlay(overlay.attentionHtml, lang, sourceAttentionHtml)
        || (lang === 'en' ? sourceAttentionHtml : '');
      const cancellationPolicyTitle = pickFromOverlay(overlay.cancellationPolicyTitle, lang, sourceCancellationPolicyTitle)
        || (lang === 'en' ? sourceCancellationPolicyTitle : '');
      const cancellationPolicyHtml = pickFromOverlay(overlay.cancellationPolicyHtml, lang, sourceCancellationPolicyHtml)
        || (lang === 'en' ? sourceCancellationPolicyHtml : '');
      const ticketInfoHtml = pickFromOverlay(overlay.ticketInfoHtml, lang, sourceTicketInfoHtml)
        || (lang === 'en' ? sourceTicketInfoHtml : '');
      const durationText = pickFromOverlay(overlay.durationText, lang, sourceDurationText)
        || (lang === 'en' ? sourceDurationText : '');
      const knowBeforeYouGoItems = sourceKnowItems
        .map((item, idx) => {
          const base = typeof item === 'string' ? item : (item && (item.text || item.label)) || '';
          const translated = pickFromOverlay(overlay[`know.${idx}`], lang, base);
          return translated || (lang === 'en' ? base : '');
        })
        .filter(Boolean);
      const catKey = activity.categories && activity.categories[0];
      const mode = pickFromOverlay(overlay.mode, lang, '')
        || (catKey ? pickFromOverlay(T.CATEGORY[catKey], lang, lang === 'en' ? catKey : '') : '');

      // ---- vendor — Latin brand name only; never localized ----
      let supplier = activity.vendor
        ? (activity.vendor.titleOriginal || activity.vendor.title)
        : '';
      if (isPlaceholderSupplierName(supplier)) supplier = '';
      const supplierRole = '';

      const duration = durationText || '';

      // ---- pricing ----
      const defaultCategoryId = (activity.pricingCategories || []).find(c => c.defaultCategory)?.id
                              ?? activity.pricingCategories?.[0]?.id;
      const defaultRow = (activity.pricing || []).find(p => p.pricingCategoryId === defaultCategoryId)
                     || activity.pricing?.[0];
      const fallbackAmount = Number(
        defaultRow?.amount
        ?? activity.nextDefaultPrice?.amount
        ?? activity.fromPrice?.amount
        ?? activity.fromPrice
        ?? activity.defaultPrice?.amount
        ?? 0
      );
      const resolvedPriceAmount = Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : 0;
      const resolvedPriceCurrency = defaultRow?.currency
        || activity.nextDefaultPrice?.currency
        || activity.fromPrice?.currency
        || activity.defaultPrice?.currency
        || activity.sourceCurrency
        || activity.currency
        || activity.defaultCurrency
        || 'USD';

      const fxRates = A._fxRates || { USD: 1 };
      const UI = typeof window !== 'undefined' ? window.AuralisUI : null;
      const toUsd = (amount, currency) => (
        UI && UI.amountToUsd
          ? UI.amountToUsd(amount, currency, fxRates)
          : Number(amount) || 0
      );

      const pricingById = new Map(
        (activity.pricing || []).map((row) => [String(row.pricingCategoryId), row]),
      );
      const priceTable = (activity.pricingCategories || []).length
        ? (activity.pricingCategories || []).map((catRaw) => {
          const row = pricingById.get(String(catRaw.id));
          const rowCur = row?.currency || resolvedPriceCurrency;
          const nativeAmount = row && Number(row.amount) > 0 ? row.amount : null;
          return {
            categoryId: catRaw.id,
            label: catRaw.fullTitle || catRaw.title || (lang === 'en' ? 'Traveler' : ''),
            amount: nativeAmount != null ? toUsd(nativeAmount, rowCur) : null,
            currency: 'USD',
            sourceAmount: nativeAmount,
            sourceCurrency: rowCur,
          };
        })
        : (activity.pricing || [])
          .map((row) => {
            const catRaw = (activity.pricingCategories || []).find((c) => c.id === row.pricingCategoryId);
            const rowCur = row.currency || resolvedPriceCurrency;
            return {
              categoryId: row.pricingCategoryId,
              label: catRaw?.fullTitle || catRaw?.title || (lang === 'en' ? 'Traveler' : ''),
              amount: toUsd(row.amount, rowCur),
              currency: 'USD',
              sourceAmount: row.amount,
              sourceCurrency: rowCur,
            };
          })
          .filter((row) => row.label);

      // ---- stops (for the trip-with-map screen) ----
      const stops = (activity.stops || []).map(stop => ({
        id: stop.id,
        name: stop.title || '',
        geo: stop.geoPoint,
        durationMinutes: stop.durationMinutes,
        excerpt: stop.excerpt || '',
        description: stop.description || '',
        address: stop.address || '',
      }));

      // ---- availability ----
      const avWarning = activity.availability && activity.availability.warning;
      const availability = {
        bookableNow: !!(activity.availability && activity.availability.bookableNow),
        capacityRemaining: activity.availability?.capacityRemaining ?? null,
        nextAvailableDates: activity.availability?.nextAvailableDates || [],
        warning: avWarning
          ? pickFromOverlay(T.WARNING[avWarning], lang, lang === 'en' ? avWarning : '')
          : null,
        cancellationCutoffMinutes: activity.cancellationCutoffMinutes,
        lastChecked: activity.availability?.lastChecked,
      };

      return {
        id: activity.id,
        title,
        summary,
        description,
        supplier,
        supplierRole,
        duration,
        mode,
        rating: activity.averageRating,
        reviews: activity.reviewCount,
        priceUsd: toUsd(resolvedPriceAmount, resolvedPriceCurrency),
        price: toUsd(resolvedPriceAmount, resolvedPriceCurrency),
        priceCurrency: 'USD',
        sourcePriceCurrency: resolvedPriceCurrency,
        priceTable,
        pricingCategories: activity.pricingCategories || [],
        badge: null,
        badgeKey: null,
        photo: activity.coverImagePlaceholder || 'aurora',
        coverImageUrl: activity.coverImageUrl,
        coverImageOwnedUrl: activity.coverImageOwnedUrl || null,
        coverImageCardUrl: activity.coverImageCardUrl || null,
        coverImageHeroUrl: activity.coverImageHeroUrl || null,
        coverImageGalleryUrl: activity.coverImageGalleryUrl || null,
        photoUrls: (activity.photoUrls && activity.photoUrls.length)
          ? activity.photoUrls
          : (activity.coverImageUrl ? [activity.coverImageUrl] : []),
        photoUrlsOwned: Array.isArray(activity.photoUrlsOwned) ? activity.photoUrlsOwned : [],
        imageAssets: Array.isArray(activity.imageAssets) ? activity.imageAssets : [],
        meetingPoint: localizeMeetingPoint(activity.meetingPoint, lang),
        meetingType: activity.meetingType || null,
        startTimes: activity.startTimes || [],
        categories: activity.categories || [],
        categoryLabels: activity.categoryLabels || activity.categories || [],
        chipIds: activity.chipIds || [],
        routeIds: activity.routeIds || [],
        facetIds: activity.facetIds || [],
        stops,
        tags: [],
        availability,
        vendor: activity.vendor,
        languages: (activity.languages || [])
          .map((phrase) => guideLanguageLabel(phrase, lang))
          .filter(Boolean),
        // Rich Bókun product content — passed through as HTML; the renderer
        // sanitises inline styles before inserting via dangerouslySetInnerHTML.
        includedHtml,
        excludedHtml,
        requirementsHtml,
        attentionHtml,
        inclusionsList: activity.inclusionsList || [],
        exclusionsList: activity.exclusionsList || [],
        knowBeforeYouGoItems,
        bookableExtras: activity.bookableExtras || [],
        pickupInfo: activity.pickupInfo || null,
        passCapacity: activity.passCapacity ?? null,
        difficultyLevel: activity.difficultyLevel || null,
        minAge: activity.minAge ?? null,
        activityAttributes: activity.activityAttributes || [],
        productCategory: activity.productCategory || null,
        activityType: activity.activityType || null,
        activityCategories: activity.activityCategories || [],
        bookingCutoffTotalMinutes: activity.bookingCutoffTotalMinutes ?? null,
        bookingCutoffMinutes: activity.bookingCutoffMinutes ?? null,
        bookingCutoffHours: activity.bookingCutoffHours ?? null,
        bookingCutoffDays: activity.bookingCutoffDays ?? null,
        bookingCutoffWeeks: activity.bookingCutoffWeeks ?? null,
        durationText: durationText || null,
        guidanceTypes: activity.guidanceTypes || [],
        cancellationFreeHours: activity.cancellationFreeHours ?? null,
        cancellationPolicyTitle: cancellationPolicyTitle || null,
        cancellationPolicyHtml,
        ticketInfoHtml,
        isCombo: !!activity.isCombo,
        privateExperience: !!activity.privateExperience,
        location: activity.location || null,
        locationLabel: activity.locationLabel || (activity.location && activity.location.name) || null,
        videos: Array.isArray(activity.videos) ? activity.videos : [],
        seasonalOpeningHoursLabels: Array.isArray(activity.seasonalOpeningHoursLabels)
          ? activity.seasonalOpeningHoursLabels
          : [],
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
      return pickFromOverlay(T.TAG?.[key], lang, lang === 'en' ? key : '');
    },
    categoryLabel(key, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.CATEGORY?.[key], lang, lang === 'en' ? key : '');
    },
    pricingCategoryLabel(id, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.PRICING_CATEGORY?.[id], lang, '')
        || pickFromOverlay(T.PRICING_CATEGORY?.[String(id)], lang, '');
    },
    warningLabel(key, lang) {
      const T = A.BOKUN_TRANSLATIONS || {};
      return pickFromOverlay(T.WARNING?.[key], lang, lang === 'en' ? key : '');
    },
    guideLanguageLabel,

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

  function hasPositiveAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  /** Legacy payloads stored ISK magnitudes with currency=USD (e.g. 26990). */
  function pricingLooksMislabeled(activity) {
    if (!activity || typeof activity !== 'object') return false;
    const rows = Array.isArray(activity.pricing) ? activity.pricing : [];
    return rows.some((row) => {
      const amount = Number(row && row.amount);
      const cur = String((row && row.currency) || activity.currency || 'USD').toUpperCase();
      return cur === 'USD' && Number.isFinite(amount) && amount >= 5000;
    });
  }

  function tourHasResolvablePrice(tour) {
    if (!tour) return false;
    if (hasPositiveAmount(tour.priceUsd) || hasPositiveAmount(tour.price)) return true;
    return Array.isArray(tour.priceTable) && tour.priceTable.some((row) => hasPositiveAmount(row && row.amount));
  }

  function isPlaceholderSupplierName(name) {
    if (name == null || name === '') return true;
    const t = String(name).trim();
    return t === 'Supplier' || /^Supplier \d+$/.test(t);
  }

  function mergePreviewPriceFallback(tour, previewVm) {
    if (!tour || !previewVm) return tour || previewVm || null;
    const merged = { ...tour };

    const previewSupplier = previewVm.supplier
      || (previewVm.vendor && (previewVm.vendor.titleOriginal || previewVm.vendor.title));
    if (isPlaceholderSupplierName(merged.supplier) && previewSupplier && !isPlaceholderSupplierName(previewSupplier)) {
      merged.supplier = previewSupplier;
      merged.vendor = previewVm.vendor || merged.vendor;
    }
    const previewDuration = previewVm.duration || previewVm.durationText;
    if (!String(merged.duration || merged.durationText || '').trim() && previewDuration) {
      merged.duration = previewDuration;
      merged.durationText = previewVm.durationText || previewDuration;
    }
    if (previewVm.raw && merged.raw) {
      merged.raw = { ...merged.raw };
      if (isPlaceholderSupplierName(merged.raw.vendor?.title) && previewVm.raw.vendor) {
        merged.raw.vendor = previewVm.raw.vendor;
      }
      if (!String(merged.raw.durationText || '').trim() && previewVm.raw.durationText) {
        merged.raw.durationText = previewVm.raw.durationText;
      }
      if ((!merged.raw.durationMinutes || merged.raw.durationMinutes <= 0) && previewVm.raw.durationMinutes > 0) {
        merged.raw.durationMinutes = previewVm.raw.durationMinutes;
      }
    }

    if (!merged.coverImageOwnedUrl && previewVm.coverImageOwnedUrl) merged.coverImageOwnedUrl = previewVm.coverImageOwnedUrl;
    if (!merged.coverImageCardUrl && previewVm.coverImageCardUrl) merged.coverImageCardUrl = previewVm.coverImageCardUrl;
    if (!merged.coverImageHeroUrl && previewVm.coverImageHeroUrl) merged.coverImageHeroUrl = previewVm.coverImageHeroUrl;
    if (!merged.coverImageGalleryUrl && previewVm.coverImageGalleryUrl) merged.coverImageGalleryUrl = previewVm.coverImageGalleryUrl;
    if ((!Array.isArray(merged.photoUrlsOwned) || !merged.photoUrlsOwned.length) && Array.isArray(previewVm.photoUrlsOwned)) {
      merged.photoUrlsOwned = previewVm.photoUrlsOwned;
    }
    if ((!Array.isArray(merged.imageAssets) || !merged.imageAssets.length) && Array.isArray(previewVm.imageAssets)) {
      merged.imageAssets = previewVm.imageAssets;
    }

    if (tourHasResolvablePrice(merged) || !tourHasResolvablePrice(previewVm)) return merged;

    const previewPrice = previewVm.priceUsd ?? previewVm.price;
    const previewLooksBad = Number(previewPrice) >= 5000;
    if (previewLooksBad) return merged;

    return {
      ...merged,
      priceUsd: previewVm.priceUsd ?? previewVm.price ?? merged.priceUsd ?? merged.price ?? null,
      price: previewVm.price ?? previewVm.priceUsd ?? merged.price ?? merged.priceUsd ?? null,
      priceCurrency: merged.priceCurrency || previewVm.priceCurrency || 'USD',
      priceTable: Array.isArray(merged.priceTable) && merged.priceTable.some((row) => hasPositiveAmount(row && row.amount))
        ? merged.priceTable
        : (previewVm.priceTable || []),
      priceFallbackSource: 'catalog-preview',
    };
  }

  A.BokunAdapter = BokunAdapter;
  A._runtimeTranslations = A._runtimeTranslations || {};
  A.getActivityOverlay = getActivityOverlay;

  // ----------------------------------- React hook (registered if React loaded)
  // Components import this via `window.AuralisData.useActivities(lang)`.
  // Returns { loading, error, activities }. Refetches when lang changes so
  // the view-model strings stay in sync with the toggle.
  function attachReactHook() {
    if (typeof React === 'undefined') return;
    const { useState, useEffect } = React;

    const CATALOG_PAGE_SIZE = 36;

    function mergeRawActivities(existing, incoming) {
      const byId = new Map();
      (existing || []).forEach((a) => { if (a && a.id != null) byId.set(String(a.id), a); });
      (incoming || []).forEach((a) => { if (a && a.id != null) byId.set(String(a.id), a); });
      return [...byId.values()];
    }

    A.useActivities = function useActivities(lang) {
      const [state, setState] = useState({
        loading: true,
        loadingMore: false,
        error: null,
        activities: [],
        raw: [],
        meta: { total: 0, page: 1, pageSize: CATALOG_PAGE_SIZE },
      });

      useEffect(() => {
        let cancelled = false;
        setState(s => ({ ...s, loading: s.raw.length === 0, error: null }));

        const applyPayload = (raw, meta, translations, { append } = {}) => {
          if (cancelled) return;
          if (translations && typeof translations === 'object') {
            A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...translations };
          }
          setState((s) => {
            const mergedRaw = append ? mergeRawActivities(s.raw, raw) : raw;
            return {
              loading: false,
              loadingMore: false,
              error: null,
              raw: mergedRaw,
              activities: BokunAdapter.toViewModels(mergedRaw, lang),
              meta: meta || s.meta,
            };
          });
        };

        const catalogReady = state.raw.length > 0 && state.meta && state.meta.catalogFetchComplete;

        if (catalogReady) {
          applyPayload(state.raw, state.meta, null, { append: false });
        } else {
          // Full channel catalog so supplier list + counts include every vendor (Phase A, <~2k SKU).
          BokunAdapter.fetchActivities({ lang, all: true, maxItems: 2000 })
            .then(({ activities: raw, meta, translations }) => applyPayload(raw, meta, translations))
            .catch((err) => {
              if (!cancelled) {
                setState({
                  loading: false, loadingMore: false, error: err,
                  activities: [], raw: [], meta: { total: 0 },
                });
              }
            });
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [lang]);

      useEffect(() => {
        const refreshPrices = () => {
          setState((s) => (s.raw.length
            ? { ...s, activities: BokunAdapter.toViewModels(s.raw, lang) }
            : s));
        };
        window.addEventListener('auralis-fx-ready', refreshPrices);
        return () => window.removeEventListener('auralis-fx-ready', refreshPrices);
      }, [lang]);

      const catalogTotal = state.meta && state.meta.total > 0 ? state.meta.total : state.raw.length;
      const hasMore = false;

      const loadMore = () => {
        if (state.loadingMore || state.loading || !hasMore) return;
        const nextPage = (state.meta.page || 1) + 1;
        setState((s) => ({ ...s, loadingMore: true }));
        BokunAdapter.fetchActivities({ lang, page: nextPage, pageSize: CATALOG_PAGE_SIZE })
          .then(({ activities: raw, meta, translations }) => {
            setState((s) => {
              if (translations && typeof translations === 'object') {
                A._runtimeTranslations = { ...(A._runtimeTranslations || {}), ...translations };
              }
              const mergedRaw = mergeRawActivities(s.raw, raw);
              return {
                ...s,
                loadingMore: false,
                raw: mergedRaw,
                activities: BokunAdapter.toViewModels(mergedRaw, lang),
                meta: { ...s.meta, ...meta, page: nextPage },
              };
            });
          })
          .catch((err) => {
            setState((s) => ({ ...s, loadingMore: false, error: err }));
          });
      };

      return { ...state, hasMore, loadMore, catalogTotal };
    };

    /**
     * Detail page: show list preview immediately, then refresh from GET /api/bokun/activity.
     */
    A.useActivityDetail = function useActivityDetail(activityId, lang, previewVm) {
      const [state, setState] = useState({
        loading: !!activityId,
        error: null,
        tour: previewVm || null,
        raw: previewVm && previewVm.raw ? previewVm.raw : null,
      });

      useEffect(() => {
        if (!activityId) {
          setState({ loading: false, error: null, tour: null, raw: null });
          return undefined;
        }

        let cancelled = false;
        const cachedRaw = getCachedActivityDetail(activityId, lang);
        const initialRaw = cachedRaw || (previewVm && previewVm.raw) || null;
        const initialTour = cachedRaw
          ? BokunAdapter.toViewModel(cachedRaw, lang)
          : (previewVm || (initialRaw ? BokunAdapter.toViewModel(initialRaw, lang) : null));
        const stabilizedInitialTour = mergePreviewPriceFallback(initialTour, previewVm);

        setState({
          loading: !cachedRaw,
          error: null,
          tour: stabilizedInitialTour,
          raw: initialRaw,
        });

        BokunAdapter.fetchActivityById(activityId, { lang })
          .then((raw) => {
            if (cancelled) return;
            const tour = mergePreviewPriceFallback(BokunAdapter.toViewModel(raw, lang), previewVm);
            setState({ loading: false, error: null, tour, raw });
          })
          .catch((err) => {
            if (cancelled) return;
            setState((s) => ({
              loading: false,
              error: err,
              tour: s.tour || previewVm || null,
              raw: s.raw,
            }));
          });

        return () => { cancelled = true; };
      }, [activityId, lang]); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        if (!state.raw) return;
        const tour = mergePreviewPriceFallback(BokunAdapter.toViewModel(state.raw, lang), previewVm);
        setState((s) => ({ ...s, tour }));
      }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

      useEffect(() => {
        const refresh = () => {
          setState((s) => {
            if (!s.raw) return s;
            const tour = mergePreviewPriceFallback(BokunAdapter.toViewModel(s.raw, lang), previewVm);
            return { ...s, tour };
          });
        };
        window.addEventListener('auralis-fx-ready', refresh);
        return () => window.removeEventListener('auralis-fx-ready', refresh);
      }, [lang, previewVm]);

      return state;
    };
  }

  attachReactHook();
  // In case React loads AFTER this file, retry on next macrotask.
  if (!A.useActivities || !A.useActivityDetail) setTimeout(attachReactHook, 0);
})();
