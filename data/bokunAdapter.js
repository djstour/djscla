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
  function decodeHtmlEntities(text) {
    const input = text == null ? '' : String(text);
    if (!input) return '';
    if (typeof document === 'undefined') {
      return input
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    }
    const el = document.createElement('textarea');
    el.innerHTML = input;
    return el.value;
  }

  function stripHtml(html) {
    return decodeHtmlEntities(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

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
    if (lang === 'en') return String(phrase);
    const T = A.BOKUN_TRANSLATIONS || {};
    const key = String(phrase).trim().toLowerCase().replace(/[\s-]+/g, '_');
    return pickFromOverlay(T.GUIDE_LANGUAGE && T.GUIDE_LANGUAGE[key], lang, '');
  }

  function localizeMeetingPoint(mp, lang) {
    if (!mp) return null;
    if (lang === 'en') return mp;
    return null;
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
      const enTitle = activity.title || '';
      const title = pickFromOverlay(overlay.title, lang, lang === 'en' ? enTitle : '');
      const summary = pickFromOverlay(
        overlay.summary,
        lang,
        lang === 'en' ? stripHtml(activity.summary || activity.description) : '',
      );
      const description = pickFromOverlay(
        overlay.description,
        lang,
        lang === 'en' ? stripHtml(activity.description || activity.summary || '') : '',
      );
      const catKey = activity.categories && activity.categories[0];
      const mode = pickFromOverlay(overlay.mode, lang, '')
        || (catKey ? pickFromOverlay(T.CATEGORY[catKey], lang, lang === 'en' ? catKey : '') : '');

      // ---- vendor — Latin brand name only; never localized ----
      const supplier = activity.vendor
        ? (activity.vendor.titleOriginal || activity.vendor.title)
        : '';
      const supplierRole = '';

      // ---- duration ----
      // Bókun ships `durationText` as a long English phrase ("5 hours and
      // 30 minutes"); we re-render a compact form ("5h 30m" / "5 小時 30 分")
      // either from numeric minutes or by parsing the original text.
      const minsForDuration = Number(activity.durationMinutes) > 0
        ? Number(activity.durationMinutes)
        : parseDurationTextToMinutes(activity.durationText);
      const duration = formatDuration(minsForDuration, lang) || '';

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
        || activity.currency
        || activity.defaultCurrency
        || 'USD';

      const priceTable = (activity.pricing || [])
        .map((row) => {
          const cat = T.PRICING_CATEGORY[row.pricingCategoryId];
          const catRaw = (activity.pricingCategories || []).find((c) => c.id === row.pricingCategoryId);
          return {
            categoryId: row.pricingCategoryId,
            label: pickFromOverlay(
              cat,
              lang,
              lang === 'en'
                ? (catRaw?.fullTitle || catRaw?.title || 'Traveler')
                : '',
            ),
            amount: row.amount,
            currency: row.currency,
          };
        })
        .filter((row) => row.label);

      // ---- stops (for the trip-with-map screen) ----
      const stops = (activity.stops || []).map(stop => ({
        id: stop.id,
        name: pickFromOverlay(overlay.stops && overlay.stops[String(stop.id)], lang, lang === 'en' ? stop.title : ''),
        geo: stop.geoPoint,
        durationMinutes: stop.durationMinutes,
      }));

      // ---- tags ----
      const tags = (activity.tags || [])
        .map((key) => ({
          key,
          label: pickFromOverlay(T.TAG[key], lang, lang === 'en' ? key : ''),
        }))
        .filter((t) => t.label);

      // ---- badge (a single hero label) ----
      const badgeKey = pickPrimaryBadge(activity.tags);
      const badge = badgeKey ? pickFromOverlay(T.TAG[badgeKey], lang, '') : null;

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
        priceUsd: resolvedPriceAmount,
        price: resolvedPriceAmount,
        priceCurrency: resolvedPriceCurrency,
        priceTable,
        badge,
        badgeKey,
        photo: activity.coverImagePlaceholder || 'aurora',
        coverImageUrl: activity.coverImageUrl,
        photoUrls: (activity.photoUrls && activity.photoUrls.length)
          ? activity.photoUrls
          : (activity.coverImageUrl ? [activity.coverImageUrl] : []),
        meetingPoint: localizeMeetingPoint(activity.meetingPoint, lang),
        meetingType: activity.meetingType || null,
        startTimes: activity.startTimes || [],
        categories: activity.categories || [],
        categoryLabels: activity.categoryLabels || activity.categories || [],
        chipIds: activity.chipIds || [],
        routeIds: activity.routeIds || [],
        facetIds: activity.facetIds || [],
        stops,
        tags,
        availability,
        vendor: activity.vendor,
        languages: (activity.languages || [])
          .map((phrase) => guideLanguageLabel(phrase, lang))
          .filter(Boolean),
        // Rich Bókun product content — passed through as HTML; the renderer
        // sanitises inline styles before inserting via dangerouslySetInnerHTML.
        includedHtml: activity.includedHtml || '',
        excludedHtml: activity.excludedHtml || '',
        requirementsHtml: activity.requirementsHtml || '',
        attentionHtml: activity.attentionHtml || '',
        inclusionsList: activity.inclusionsList || [],
        exclusionsList: activity.exclusionsList || [],
        knowBeforeYouGoItems: activity.knowBeforeYouGoItems || [],
        bookableExtras: activity.bookableExtras || [],
        pickupInfo: activity.pickupInfo || null,
        passCapacity: activity.passCapacity ?? null,
        difficultyLevel: activity.difficultyLevel || null,
        minAge: activity.minAge ?? null,
        activityAttributes: activity.activityAttributes || [],
        cancellationFreeHours: activity.cancellationFreeHours ?? null,
        cancellationPolicyTitle: activity.cancellationPolicyTitle || null,
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
      return pickFromOverlay(T.PRICING_CATEGORY?.[id], lang, '');
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

  function formatDuration(mins, lang) {
    const total = Number(mins);
    if (!Number.isFinite(total) || total <= 0) return null;
    const dayMin = 24 * 60;
    const d = Math.floor(total / dayMin);
    const remAfterDays = total - d * dayMin;
    const h = Math.floor(remAfterDays / 60);
    const m = Math.round(remAfterDays % 60);

    if (lang === 'en') {
      if (d > 0) return h === 0 ? `${d}d` : `${d}d ${h}h`;
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    }
    const baseDay = lang === 'hans' ? '天' : '天';
    const baseHr = lang === 'hans' ? '小时' : '小時';
    const baseMin = lang === 'hans' ? '分' : '分';
    if (d > 0) return h === 0 ? `${d} ${baseDay}` : `${d} ${baseDay} ${h} ${baseHr}`;
    if (h === 0) return `${m} ${baseMin}`;
    if (m === 0) return `${h} ${baseHr}`;
    return `${h} ${baseHr} ${m} ${baseMin}`;
  }

  /** Parse Bókun's English duration text ("5 hours and 30 minutes") into minutes. */
  function parseDurationTextToMinutes(text) {
    if (!text || typeof text !== 'string') return 0;
    let total = 0;
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/i);
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*min/i);
    const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*day/i);
    if (dayMatch) total += Math.round(parseFloat(dayMatch[1]) * 24 * 60);
    if (hourMatch) total += Math.round(parseFloat(hourMatch[1]) * 60);
    if (minMatch) total += Math.round(parseFloat(minMatch[1]));
    return total;
  }

  // Pick the badge key with the highest visual priority for a card.
  // Bókun lets vendors set multiple tags; we surface only one as a hero badge.
  function pickPrimaryBadge(tags = []) {
    const priority = ['top_pick', 'selling_fast', 'premium'];
    for (const p of priority) if (tags.includes(p)) return p;
    return null;
  }

  function hasPositiveAmount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }

  function tourHasResolvablePrice(tour) {
    if (!tour) return false;
    if (hasPositiveAmount(tour.priceUsd) || hasPositiveAmount(tour.price)) return true;
    return Array.isArray(tour.priceTable) && tour.priceTable.some((row) => hasPositiveAmount(row && row.amount));
  }

  function mergePreviewPriceFallback(tour, previewVm) {
    if (!tour || !previewVm) return tour || previewVm || null;
    if (tourHasResolvablePrice(tour) || !tourHasResolvablePrice(previewVm)) return tour;

    return {
      ...tour,
      priceUsd: previewVm.priceUsd ?? previewVm.price ?? tour.priceUsd ?? tour.price ?? null,
      price: previewVm.price ?? previewVm.priceUsd ?? tour.price ?? tour.priceUsd ?? null,
      priceCurrency: tour.priceCurrency || previewVm.priceCurrency || 'USD',
      priceTable: Array.isArray(tour.priceTable) && tour.priceTable.some((row) => hasPositiveAmount(row && row.amount))
        ? tour.priceTable
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
     * Detail page: show list preview immediately, then refresh from GET /activity.json/{id}.
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

        if (cachedRaw) return () => { cancelled = true; };

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

      return state;
    };
  }

  attachReactHook();
  // In case React loads AFTER this file, retry on next macrotask.
  if (!A.useActivities || !A.useActivityDetail) setTimeout(attachReactHook, 0);
})();
