/* App — multi-screen prototype.
   Discover · Tours · Activity detail · Trip · Checkout

   Language state: 'hant' | 'hans' | 'en'.
   Persisted to localStorage so refresh keeps the choice. */

(function () {
  const { useState, useMemo, useEffect, useRef } = React;
  const {
    Icon,
    CATEGORIES, ROUTES, FACETS, LANGS, pick, applyHtmlLang, applyBrandDocument, defaultCurrencyForLang, formatCatalogCount, formatToursToolbarSummary, formatToursPageTitle,
    loadTripSearch, saveTripSearch, loadTripPlan, saveTripPlan, normalizeTripSearch, tripSearchSortHints, deriveTripSearchFilters,
    formatTripSearchSummary,
    formatTripSearchAvailabilityNote,
    TRIP_HUBS,
    readUrlState, buildUrlForState, currentUrlString,
    activityVendor, vendorIdsMatch,
    findIcelandCollectionBySlug, findCollectionForFilters, buildIcelandCollectionPath,
    Nav, Hero, TourCard, TourCardSkeleton, TourCardCompact, TourCardCompactSkeleton,
    SupplierFilter, MapPanel, TripPanel, Checkout, Footer, ActivityDetail, SearchOverlay,
    DestinationChipsSection, ThemeTilesSection, TrustSection, SeoHead,
  } = window.AuralisUI;
  const { useActivities, useCatalogSearch } = window.AuralisData;
  const useActivityDetail = window.AuralisData.useActivityDetail || function useActivityDetailStub(_id, _lang, previewVm) {
    return { loading: false, error: null, tour: previewVm || null };
  };

  const STORAGE_KEY = 'auralis.lang';
  const CURRENCY_KEY = 'auralis.currency';

  function enrichTripItem(vm, selection) {
    if (!vm) return null;
    if (!selection) return vm;
    return {
      ...vm,
      tripDate: selection.date || null,
      tripStartTimeId: selection.startTimeId || null,
      tripStartTimeLabel: selection.startTimeLabel || null,
      tripGuests: selection.guests || null,
      tripPickupPlaceId: selection.pickupPlaceId ?? null,
      tripPickupTitle: selection.pickupTitle || null,
      tripExtras: Array.isArray(selection.extras) ? selection.extras : [],
      tripPricing: selection.pricing || null,
      tripLastQuotedAt: selection.quotedAt || null,
    };
  }

  function App() {
    const [siteTheme, setSiteTheme] = useState(() => window.AuralisUI.getInitialSiteTheme());

    useEffect(() => {
      window.AuralisUI.applySiteTheme(siteTheme);
    }, [siteTheme]);

    function handleSiteThemeChange(themeId) {
      setSiteTheme(window.AuralisUI.setSiteThemeById(themeId));
    }

    const initialUrl = (typeof window !== 'undefined' ? readUrlState() : null) || {
      screen: 'home', chip: null, route: null, supplier: 'all', activityId: null,
      lang: null, translationPreview: false,
    };
    const [screen, setScreen] = useState(initialUrl.screen);  // home | tours | detail | trip | checkout
    // Pre-seed the detail id from the URL so a hard reload of /tours/<id>
    // renders the same activity instead of bouncing back to /tours.
    const [detailActivityId, setDetailActivityId] = useState(initialUrl.activityId || null);
    const [returnScreen, setReturnScreen] = useState(initialUrl.screen === 'detail' ? 'tours' : 'tours');
    const [translationPreview] = useState(() => !!initialUrl.translationPreview);

    const [lang, setLang] = useState(() => {
      if (initialUrl.lang && LANGS.find((l) => l.id === initialUrl.lang)) return initialUrl.lang;
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '';
      return LANGS.find(l => l.id === saved) ? saved : 'hant';
    });

    const [displayCurrency, setDisplayCurrency] = useState(() => {
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(CURRENCY_KEY)) || '';
      const codes = window.AuralisUI.DISPLAY_CURRENCIES.map((c) => c.code);
      if (codes.includes(saved)) return saved;
      const initialLang = LANGS.find(l => l.id === (localStorage.getItem(STORAGE_KEY) || 'hant'))?.id || 'hant';
      return defaultCurrencyForLang(initialLang);
    });

    const [fxRates, setFxRates] = useState({ USD: 1 });

    function handleLangChange(nextLang) {
      setLang(nextLang);
      setDisplayCurrency(defaultCurrencyForLang(nextLang));
    }

    useEffect(() => {
      applyHtmlLang(lang);
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    }, [lang]);

    useEffect(() => {
      try { localStorage.setItem(CURRENCY_KEY, displayCurrency); } catch (e) {}
    }, [displayCurrency]);

    useEffect(() => {
      fetch('/api/fx/rates')
        .then((r) => r.json())
        .then((data) => {
          if (data.rates) {
            const merged = { USD: 1, ...data.rates };
            setFxRates(merged);
            if (window.AuralisData) window.AuralisData._fxRates = merged;
            window.dispatchEvent(new Event('auralis-fx-ready'));
          }
        })
        .catch((err) => console.warn('[Auralis] FX rates unavailable:', err.message));
    }, []);

    // --- Bókun activity data ---------------------------------------------------
    // Pulled through the adapter; view-models are re-derived whenever `lang`
    // changes, so all screen copy stays in sync with the toggle automatically.
    const {
      loading, loadingMore, error, activities, meta, hasMore, loadMore, catalogTotal: hookCatalogTotal,
    } = useActivities(lang);
    const catalogTotal = (meta && meta.total > 0)
      ? meta.total
      : (hookCatalogTotal > 0 ? hookCatalogTotal : activities.length);

    const [featuredRaw, setFeaturedRaw] = useState([]);
    const [featuredLoading, setFeaturedLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      setFeaturedLoading(true);
      const adapter = window.AuralisData && window.AuralisData.BokunAdapter;
      if (!adapter || !adapter.fetchFeatured) {
        setFeaturedRaw([]);
        setFeaturedLoading(false);
        return undefined;
      }
      adapter.fetchFeatured({ lang, limit: 6 })
        .then(({ activities: raw, translations }) => {
          if (cancelled) return;
          if (translations && window.AuralisData) {
            window.AuralisData._runtimeTranslations = {
              ...(window.AuralisData._runtimeTranslations || {}),
              ...translations,
            };
          }
          setFeaturedRaw(raw || []);
        })
        .catch(() => { if (!cancelled) setFeaturedRaw([]); })
        .finally(() => { if (!cancelled) setFeaturedLoading(false); });
      return () => { cancelled = true; };
    }, [lang]);

    const featuredActivities = React.useMemo(() => {
      const adapter = window.AuralisData && window.AuralisData.BokunAdapter;
      if (!featuredRaw.length || !adapter) return [];
      return adapter.toViewModels(featuredRaw, lang);
    }, [featuredRaw, lang]);

    const homeFeatured = featuredActivities.length > 0 ? featuredActivities : activities;
    const homeFeaturedLoading = featuredActivities.length > 0 ? featuredLoading : loading;

    const [homeCollections, setHomeCollections] = useState([]);
    const [collectionsLoading, setCollectionsLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      setCollectionsLoading(true);
      const adapter = window.AuralisData && window.AuralisData.BokunAdapter;
      if (!adapter || !adapter.fetchCollections) {
        setHomeCollections([]);
        setCollectionsLoading(false);
        return undefined;
      }
      adapter.fetchCollections({ lang })
        .then(({ collections, translations }) => {
          if (cancelled) return;
          if (translations && window.AuralisData) {
            window.AuralisData._runtimeTranslations = {
              ...(window.AuralisData._runtimeTranslations || {}),
              ...translations,
            };
          }
          setHomeCollections(collections || []);
        })
        .catch(() => { if (!cancelled) setHomeCollections([]); })
        .finally(() => { if (!cancelled) setCollectionsLoading(false); });
      return () => { cancelled = true; };
    }, [lang]);

    const collectionRails = React.useMemo(() => {
      const adapter = window.AuralisData && window.AuralisData.BokunAdapter;
      if (!homeCollections.length || !adapter) return [];
      return homeCollections.map((col) => ({
        ...col,
        activities: adapter.toViewModels(col.activities || [], lang),
      })).filter((col) => col.activities.length > 0);
    }, [homeCollections, lang]);

    // Trip = ARRAY OF BÓKUN IDS (numbers). View-models are looked up from the
    // current `activities` list, so a language flip rehydrates every cart row
    // without us touching trip state.
    const [tripIds, setTripIds] = useState([]);
    const [tripCache, setTripCache] = useState({});
    const [tripSelections, setTripSelections] = useState({});

    // Single-product checkout state. When set, the Checkout screen consumes
    // this one-item array INSTEAD of the regular trip basket — lets a visitor
    // "Book now" from a detail page without polluting their planning trip.
    // Cleared when checkout finishes or the user navigates away.
    const [directCheckout, setDirectCheckout] = useState(null);

    const trip = useMemo(
      () => tripIds
        .map((id) => {
          const vm = activities.find((a) => a.id === id) || tripCache[id];
          return enrichTripItem(vm, tripSelections[id]);
        })
        .filter(Boolean),
      [tripIds, activities, tripCache, tripSelections]
    );

    const detailPreview = useMemo(
      () => (detailActivityId != null
        ? activities.find((a) => a.id === detailActivityId) || tripCache[detailActivityId]
        : null),
      [detailActivityId, activities, tripCache],
    );
    const { loading: detailLoading, error: detailError, tour: detailTour } = useActivityDetail(
      detailActivityId,
      lang,
      detailPreview,
      { translationPreview },
    );

    // Tracks how many history entries this session pushed for the detail flow,
    // so the in-app back button can pop them (preserving browser fwd/back UX)
    // rather than always forward-pushing a new /tours entry.
    const detailEntryDepthRef = useRef(0);

    function openActivityDetail(tour) {
      window.AuralisUI.prefetchProxiedImage(
        tour.coverImageCardUrl || tour.coverImageUrl,
        window.AuralisUI.imageProfileForViewport().prefetch,
      );
      if (window.AuralisData && window.AuralisData.BokunAdapter) {
        window.AuralisData.BokunAdapter.prefetchActivityById(tour.id, { lang });
      }
      setTripCache((c) => ({ ...c, [tour.id]: tour }));
      setReturnScreen(screen === 'detail' ? returnScreen : screen);
      setDetailActivityId(tour.id);
      setScreen('detail');
      detailEntryDepthRef.current += 1;
      window.scrollTo(0, 0);
    }

    function closeActivityDetail() {
      if (detailEntryDepthRef.current > 0) {
        detailEntryDepthRef.current -= 1;
        window.history.back();
        return;
      }
      setDetailActivityId(null);
      setScreen(returnScreen || 'tours');
      window.scrollTo(0, 0);
    }
    const tripIdSet = useMemo(() => new Set(tripIds), [tripIds]);

    const [tripSearch, setTripSearch] = useState(() => {
      const base = loadTripSearch();
      if (initialUrl.hub) return normalizeTripSearch({ ...base, hubId: initialUrl.hub });
      return base;
    });
    const [tripPlan, setTripPlan] = useState(() => loadTripPlan());
    const [activeSupplier, setActiveSupplier] = useState(initialUrl.supplier || 'all');
    const [activeCats, setActiveCats] = useState(initialUrl.chip ? [initialUrl.chip] : []);
    const [activeRoutes, setActiveRoutes] = useState(initialUrl.route ? [initialUrl.route] : []);
    const [activeFacets, setActiveFacets] = useState([]);
    const [searchQuery, setSearchQuery] = useState(initialUrl.q || '');
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
      saveTripSearch(tripSearch);
    }, [tripSearch]);

    useEffect(() => {
      saveTripPlan(tripPlan);
    }, [tripPlan]);

    const activeCollection = useMemo(() => findCollectionForFilters({
      chip: activeCats[0] || null,
      route: activeRoutes[0] || null,
      supplier: activeSupplier,
      q: searchQuery,
      hubId: tripSearch.hubId,
    }), [activeCats, activeRoutes, activeSupplier, searchQuery, tripSearch.hubId]);

    const catalogFilters = useMemo(() => ({
      chips: activeCats,
      routes: activeRoutes,
      facets: activeFacets,
      q: searchQuery || undefined,
      vendorId: activeSupplier !== 'all' ? activeSupplier : undefined,
      tripStart: tripSearch.startDate,
      tripEnd: tripSearch.endDate,
      sortHub: tripSearch.hubId || undefined,
      playbookIds: tripPlan.playbookActivityIds && tripPlan.playbookActivityIds.length
        ? tripPlan.playbookActivityIds
        : undefined,
    }), [activeCats, activeRoutes, activeFacets, searchQuery, tripSearch, tripPlan, activeSupplier]);

    const toursCatalog = useCatalogSearch(lang, catalogFilters, { enabled: screen === 'tours' });

    // --- URL sync ---------------------------------------------------------
    // pushState on filter / screen changes so the URL reflects what's visible.
    // Detail screen maps to /tours/<id> — surviving hard reload + sharing.
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const next = buildUrlForState({
        screen,
        chip: activeCats[0] || null,
        route: activeRoutes[0] || null,
        supplier: activeSupplier,
        q: searchQuery,
        hubId: tripSearch.hubId,
        activityId: screen === 'detail' ? detailActivityId : null,
        lang: translationPreview ? lang : undefined,
        translationPreview: translationPreview || undefined,
      });
      if (currentUrlString() !== next) {
        window.history.pushState(null, '', next);
      }
    }, [screen, activeCats, activeRoutes, activeSupplier, searchQuery, tripSearch.hubId, detailActivityId, lang, translationPreview]);

    // popstate → re-derive state from URL so back/forward feel native.
    useEffect(() => {
      if (typeof window === 'undefined') return;
      function onPop() {
        const s = readUrlState();
        if (!s) return;
        setScreen(s.screen);
        setActiveCats(s.chip ? [s.chip] : []);
        setActiveRoutes(s.route ? [s.route] : []);
        setActiveSupplier(s.supplier || 'all');
        setSearchQuery(s.q || '');
        if (s.hub) setTripSearch((prev) => normalizeTripSearch({ ...prev, hubId: s.hub }));
        setDetailActivityId(s.screen === 'detail' ? (s.activityId || null) : null);
        if (s.lang && LANGS.find((l) => l.id === s.lang)) setLang(s.lang);
        // Keep the depth counter honest when the user uses browser nav.
        if (s.screen !== 'detail' && detailEntryDepthRef.current > 0) {
          detailEntryDepthRef.current -= 1;
        }
      }
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    function addToTrip(vm, opts = {}) {
      const alreadyInTrip = tripIdSet.has(vm.id);
      const booking = opts && opts.booking ? opts.booking : null;
      setTripCache((c) => ({ ...c, [vm.id]: vm }));
      if (booking) {
        setTripSelections((current) => ({ ...current, [vm.id]: booking }));
      }
      if (!alreadyInTrip) {
        setTripIds((ids) => [...ids, vm.id]);
      }
      const showToast = window.AuralisUI && window.AuralisUI.showToast;
      if (showToast) {
        const T = (opts) => window.AuralisUI.pick(lang, opts);
        showToast({
          tone: 'success',
          icon: 'check',
          message: alreadyInTrip
            ? T({ hant: '已更新行程設定', hans: '已更新行程设置', en: 'Trip settings updated' })
            : T({ hant: '已加入行程', hans: '已加入行程', en: 'Added to your trip' }),
          description: vm.title,
          actionLabel: T({ hant: '查看行程', hans: '查看行程', en: 'View trip' }),
          onAction: () => { handleNav('checkout'); },
        });
      }
    }
    function removeFromTrip(id) {
      const removed = tripCache[id];
      setTripIds(ids => ids.filter(x => x !== id));
      setTripSelections((current) => {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      const showToast = window.AuralisUI && window.AuralisUI.showToast;
      if (showToast) {
        const T = (opts) => window.AuralisUI.pick(lang, opts);
        showToast({
          icon: 'trash-2',
          message: T({ hant: '已從行程移除', hans: '已从行程移除', en: 'Removed from trip' }),
          description: removed && removed.title,
          actionLabel: removed ? T({ hant: '復原', hans: '复原', en: 'Undo' }) : null,
          onAction: removed ? () => {
            setTripCache((c) => ({ ...c, [removed.id]: removed }));
            setTripIds((ids) => (ids.includes(removed.id) ? ids : [...ids, removed.id]));
            if (tripSelections[id]) {
              setTripSelections((current) => ({ ...current, [removed.id]: tripSelections[id] }));
            }
          } : null,
        });
      }
    }
    function toggleCat(id) {
      setActiveCats(cs => cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id]);
    }
    function toggleRoute(id) {
      setActiveRoutes(rs => rs.includes(id) ? rs.filter(r => r !== id) : [...rs, id]);
    }
    function toggleFacet(id) {
      setActiveFacets(fs => fs.includes(id) ? fs.filter(f => f !== id) : [...fs, id]);
    }
    function goToToursWithFilters(search, {
      chipId = null, routeId = null, fromHero = false, playbook = null,
    } = {}) {
      const { normalized, cats, routes, facets } = deriveTripSearchFilters(
        search || tripSearch,
        { chipId, routeId, fromHero },
      );
      setTripSearch(normalized);
      setActiveCats(cats);
      setActiveRoutes(routes);
      setActiveFacets(facets);
      if (playbook) {
        setTripPlan({
          playbookSlug: playbook.slug,
          playbookTitle: playbook.title || null,
          playbookActivityIds: playbook.activityIds || [],
        });
      } else if (fromHero) {
        setTripPlan({ playbookSlug: null, playbookTitle: null, playbookActivityIds: [] });
      }
      setSearchQuery('');
      setScreen('tours');
      window.scrollTo(0, 0);
    }

    function goToCollection(col, searchBase = tripSearch) {
      if (!col) return;
      const search = col.hubId
        ? normalizeTripSearch({ ...searchBase, hubId: col.hubId })
        : searchBase;
      if (col.hubId) setTripSearch(search);
      setActiveCats(col.chipId ? [col.chipId] : []);
      setActiveRoutes(col.routeId ? [col.routeId] : []);
      setActiveFacets([]);
      setActiveSupplier('all');
      setSearchQuery('');
      setTripPlan({ playbookSlug: null, playbookTitle: null, playbookActivityIds: [] });
      setScreen('tours');
      window.scrollTo(0, 0);
    }

    function goFromHomeDestination({ search, chipId, routeId, collection }) {
      if (collection) {
        goToCollection(collection, search);
        return;
      }
      goToToursWithFilters(search, { chipId, routeId });
    }

    function goFromHomeTheme({ chipId, routeId }) {
      const col = findCollectionForFilters({ chip: chipId, route: routeId, supplier: 'all', q: '' });
      if (col) {
        goToCollection(col);
        return;
      }
      goToToursWithFilters(tripSearch, { chipId, routeId });
    }

    function handleNav(target) {
      setScreen(target);
      if (target !== 'detail') window.scrollTo(0, 0);
    }

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
        <Nav currentScreen={screen} onNav={handleNav}
             cartCount={tripIds.length} lang={lang} onCycleLang={handleLangChange}
             displayCurrency={displayCurrency} onCurrencyChange={setDisplayCurrency}
             siteThemeId={siteTheme.id} onSiteThemeChange={handleSiteThemeChange}
             onOpenSearch={() => setSearchOpen(true)}
             onSelectCollection={goToCollection} />

        <SeoHead
          lang={lang}
          screen={screen}
          tour={screen === 'detail' ? detailTour : null}
          collection={screen === 'tours' ? activeCollection : null}
          query={searchQuery}
          path={typeof window !== 'undefined' ? window.location.pathname : '/'}
          displayCurrency={displayCurrency}
          fxRates={fxRates}
          enableProductSchema={screen === 'detail'}
        />

        <TranslationOpenBanner
          lang={lang}
          publicMode={meta?.translationPublicMode || window.AuralisData?.getTranslationPublicMode?.()}
        />

        <SearchOverlay
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          lang={lang}
          displayCurrency={displayCurrency}
          fxRates={fxRates}
          onOpenDetail={openActivityDetail}
          onSeeAll={(q) => {
            setActiveCats([]);
            setActiveRoutes([]);
            setActiveSupplier('all');
            setActiveFacets([]);
            setSearchQuery(q);
            setScreen('tours');
            window.scrollTo(0, 0);
          }}
        />

        {screen === 'home' && (
          <>
            <Hero
              lang={lang}
              catalogTotal={catalogTotal}
              theme={siteTheme}
              tripSearch={tripSearch}
              onTripSearchChange={setTripSearch}
              onOpenSearch={() => setSearchOpen(true)}
              onQuickSearch={(q) => {
                setActiveCats([]);
                setActiveRoutes([]);
                setActiveFacets([]);
                setActiveSupplier('all');
                setSearchQuery(q);
                setScreen('tours');
                window.scrollTo(0, 0);
              }}
              onSearch={(search) => goToToursWithFilters(search, { fromHero: true })}
              onBrowseAll={(search) => goToToursWithFilters(search, { fromHero: true })}
              onSelectPlaybook={(search, playbook) => goToToursWithFilters(search, {
                fromHero: true,
                playbook,
              })}
              onPopularChip={(search, chip) => goToToursWithFilters(search, {
                chipId: chip.chipId || null,
                routeId: chip.routeId || null,
              })}
            />
            {error && <div className="auralis-container"><BokunErrorBanner error={error} lang={lang} /></div>}
            <DestinationChipsSection
              lang={lang}
              activities={activities}
              tripSearch={tripSearch}
              onSelectDestination={goFromHomeDestination}
            />
            <ThemeTilesSection
              lang={lang}
              activities={activities}
              onSelectTheme={goFromHomeTheme}
              onSelectCollection={goToCollection}
            />
            <FeaturedSection activities={homeFeatured} loading={homeFeaturedLoading} catalogTotal={catalogTotal}
                             curated={featuredActivities.length > 0}
                             onView={() => goToToursWithFilters(tripSearch)} onOpenDetail={openActivityDetail}
                             lang={lang}
                             displayCurrency={displayCurrency} fxRates={fxRates} />
            {collectionRails.map((col) => (
              <CollectionSection
                key={col.slug}
                collection={col}
                loading={collectionsLoading}
                catalogTotal={catalogTotal}
                onView={() => goToToursWithFilters(tripSearch, {
                  chipId: col.ctaChipId || null,
                  routeId: col.ctaRouteId || null,
                })}
                onOpenDetail={openActivityDetail}
                lang={lang}
                displayCurrency={displayCurrency}
                fxRates={fxRates}
              />
            ))}
            <TrustSection lang={lang} catalogTotal={catalogTotal} />
            <Footer lang={lang} siteThemeId={siteTheme.id} />
          </>
        )}

        {screen === 'tours' && (
          <ToursScreen
            activities={toursCatalog.activities}
            loading={toursCatalog.loading}
            loadingMore={false}
            hasMore={false}
            onLoadMore={() => {}}
            error={toursCatalog.error || error}
            allActivities={activities}
            catalogMeta={meta}
            tripIdSet={tripIdSet}
            onAdd={addToTrip}
            onRemove={removeFromTrip}
            onOpenDetail={openActivityDetail}
            activeSupplier={activeSupplier}
            onSupplier={setActiveSupplier}
            activeCats={activeCats}
            onToggleCat={toggleCat}
            activeRoutes={activeRoutes}
            onToggleRoute={toggleRoute}
            activeFacets={activeFacets}
            onToggleFacet={toggleFacet}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            tripSearch={tripSearch}
            tripPlan={tripPlan}
            onEditTripSearch={() => setScreen('home')}
            onTripSearchChange={setTripSearch}
            onTripPlanChange={setTripPlan}
            lang={lang}
            catalogTotal={catalogTotal}
            catalogMeta={meta}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
          />
        )}

        {screen === 'detail' && (
          <ActivityDetail
            tour={detailTour}
            loading={detailLoading}
            error={detailError}
            onBack={closeActivityDetail}
            onAdd={addToTrip}
            onBookNow={(vm, selection) => {
              const enriched = enrichTripItem(vm, selection);
              if (!enriched) return;
              setDirectCheckout([enriched]);
              setScreen('checkout');
            }}
            inTrip={detailActivityId != null && tripIdSet.has(detailActivityId)}
            trip={trip}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
            translationPreview={translationPreview}
            initialDate={(tripSelections[detailActivityId] && tripSelections[detailActivityId].date) || tripSearch.startDate}
            initialGuestCounts={(tripSelections[detailActivityId] && tripSelections[detailActivityId].guests) || { adults: tripSearch.adults, children: tripSearch.children }}
            initialBookingSelection={tripSelections[detailActivityId] || null}
          />
        )}

        {screen === 'trip' && (
          <TripScreen
            trip={trip}
            onRemove={removeFromTrip}
            onCheckout={() => setScreen('checkout')}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
          />
        )}

        {screen === 'checkout' && (
          <Checkout
            // Direct (single-product "Book now") path takes precedence over the
            // multi-item cart so a visitor's planning trip isn't pulled into a
            // hasty single-product purchase by accident.
            trip={directCheckout || trip}
            onBack={() => {
              if (directCheckout) {
                setDirectCheckout(null);
                setScreen('detail');
              } else {
                setScreen('trip');
              }
            }}
            onPaid={() => {
              if (!directCheckout) {
                setTripIds([]);
                setTripSelections({});
              }
              setDirectCheckout(null);
              setScreen('home');
            }}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
          />
        )}

      </div>
    );
  }

  // ============================================================ HOME pieces ===

  function TourCardRail({ compact = false, children }) {
    return (
      <div className="grid-cards-rail-wrap">
        <div className={`grid-cards-rail${compact ? ' grid-cards-rail--compact' : ''}`} role="list">
          {children}
        </div>
      </div>
    );
  }

  function TourCardRailItem({ compact = false, children }) {
    return (
      <div className={`grid-cards-rail__item${compact ? ' grid-cards-rail__item--compact' : ''}`} role="listitem">
        {children}
      </div>
    );
  }

  function CollectionSection({
    collection, loading, catalogTotal, onView, onOpenDetail, lang, displayCurrency, fxRates,
  }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);
    const title = collection.title || T({ hant: '精選行程', hans: '精选行程', en: 'Curated trips' });
    const overline = collection.overline || '';
    const cta = collection.ctaLabel || T({
      hant: `看全部 ${countLabel} 個`,
      hans: `查看全部 ${countLabel} 个`,
      en: `View all ${countLabel}`,
    });
    const activities = collection.activities || [];

    return (
      <section className="auralis-section" style={{ paddingTop: 'clamp(32px, 8vw, 56px)', paddingBottom: 'clamp(32px, 8vw, 56px)' }}>
        <div className="auralis-container">
          <div className="featured-header">
            <div>
              {overline ? (
                <span className="overline" style={{ color: 'var(--coral)' }}>{overline}</span>
              ) : null}
              <h2 className="featured-title" style={{ margin: overline ? '8px 0 0' : 0, font: '700 40px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
                {title}
              </h2>
            </div>
            <button type="button" onClick={onView} style={{
              height: 44, padding: '0 18px', borderRadius: 999, border: 0, cursor: 'pointer',
              background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--base-300)',
              color: 'var(--fg-1)', font: '600 13px/1 var(--font-text)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {cta} <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </div>
        <TourCardRail compact>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
              <TourCardRailItem key={i} compact><TourCardCompactSkeleton /></TourCardRailItem>
            ))
            : activities.slice(0, collection.maxItems || 6).map((t, i) => (
              <TourCardRailItem key={t.id} compact>
                <TourCardCompact tour={t} onView={onOpenDetail}
                          lang={lang}
                          imagePriority={i < window.AuralisUI.aboveFoldImagePriorityCount('featured')}
                          displayCurrency={displayCurrency} fxRates={fxRates} />
              </TourCardRailItem>
            ))}
        </TourCardRail>
      </section>
    );
  }

  function FeaturedSection({ activities, loading, catalogTotal, curated, onView, onOpenDetail, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);
    return (
      <section className="auralis-section" style={{ paddingTop: 'clamp(48px, 10vw, 72px)', paddingBottom: 'clamp(48px, 10vw, 72px)' }}>
        <div className="auralis-container">
        <div className="featured-header">
          <div>
            <span className="overline" style={{ color: 'var(--coral)' }}>
              {curated
                ? T({ hant: '編輯精選', hans: '编辑精选', en: 'Editor’s picks' })
                : T({ hant: '本月精選', hans: '本月精选', en: 'This month' })}
            </span>
            <h2 className="featured-title" style={{ margin: '8px 0 0', font: '700 44px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
              {T({
                hant: '在地嚮導，全球精選。',
                hans: '当地向导，全球精选。',
                en:   'Hand-picked by locals.',
              })}
            </h2>
          </div>
          <button onClick={onView} style={{
            height: 44, padding: '0 18px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--base-300)',
            color: 'var(--fg-1)', font: '600 13px/1 var(--font-text)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>{T({
            hant: `看全部 ${countLabel} 個`,
            hans: `查看全部 ${countLabel} 个`,
            en: `View all ${countLabel}`,
          })} <Icon name="arrow-right" size={14} /></button>
        </div>
        </div>

        <TourCardRail compact>
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
              <TourCardRailItem key={i} compact><TourCardCompactSkeleton /></TourCardRailItem>
            ))
            : activities.slice(0, 6).map((t, i) => (
              <TourCardRailItem key={t.id} compact>
                <TourCardCompact tour={t} onView={onOpenDetail}
                          lang={lang}
                          imagePriority={i < window.AuralisUI.aboveFoldImagePriorityCount('featured')}
                          displayCurrency={displayCurrency} fxRates={fxRates} />
              </TourCardRailItem>
            ))}
        </TourCardRail>
      </section>
    );
  }

  // ============================================================ TOURS screen ===

  function ToursScreen({
    activities, loading, loadingMore, hasMore, onLoadMore, error, tripIdSet, onAdd, onRemove, onOpenDetail,
    allActivities,
    activeSupplier, onSupplier, activeCats, onToggleCat,
    activeRoutes, onToggleRoute, activeFacets, onToggleFacet,
    searchQuery, onSearchQueryChange,
    tripSearch, tripPlan, onEditTripSearch, onTripSearchChange, onTripPlanChange,
    lang, catalogTotal, catalogMeta, displayCurrency, fxRates,
  }) {
    const T = (opts) => pick(lang, opts);

    const sidebarActivities = useMemo(() => {
      const source = allActivities && allActivities.length ? allActivities : activities;
      const byId = new Map();
      source.forEach((vm) => {
        if (vm && vm.id != null) byId.set(String(vm.id), vm);
      });
      return [...byId.values()];
    }, [allActivities, activities]);

    const filtered = activities;

    const [searchInput, setSearchInput] = useState(searchQuery || '');
    useEffect(() => { setSearchInput(searchQuery || ''); }, [searchQuery]);
    useEffect(() => {
      if ((searchInput || '') === (searchQuery || '')) return undefined;
      const t = setTimeout(() => onSearchQueryChange(searchInput.trim()), 220);
      return () => clearTimeout(t);
    }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const channelContractTotal = (catalogMeta && catalogMeta.total > 0)
      ? catalogMeta.total
      : catalogTotal;

    const vendorKey = activeSupplier !== 'all' ? String(activeSupplier).trim() : null;
    const contractCounts = (catalogMeta && catalogMeta.vendorContractCounts) || {};
    const contractInScope = vendorKey && contractCounts[vendorKey] != null
      ? Number(contractCounts[vendorKey])
      : channelContractTotal;

    const uniqueCounts = (catalogMeta && catalogMeta.vendorUniqueCounts) || {};
    const loadedInScope = vendorKey
      ? (uniqueCounts[vendorKey] != null
        ? Number(uniqueCounts[vendorKey])
        : sidebarActivities.filter((vm) => vendorIdsMatch(activityVendor(vm) && activityVendor(vm).id, activeSupplier)).length)
      : filtered.length;

    const hasExtraFilters = activeCats.length > 0 || activeRoutes.length > 0 || activeFacets.length > 0
      || !!tripPlan?.playbookSlug
      || !!(searchQuery && searchQuery.trim());

    const toolbarSummary = formatToursToolbarSummary({
      filtered: filtered.length,
      loadedUnique: loadedInScope,
      contractProducts: contractInScope,
      hasExtraFilters,
      lang,
    });

    const supplierOption = activeSupplier !== 'all'
      ? (sidebarActivities.find((vm) => {
          const v = activityVendor(vm);
          return v && vendorIdsMatch(v.id, activeSupplier);
        })) || null
      : null;
    const supplierLabel = supplierOption
      ? (() => { const v = activityVendor(supplierOption); return v && (v.titleOriginal || v.title); })()
      : null;
    const hubLabel = (() => {
      const hub = TRIP_HUBS && tripSearch && TRIP_HUBS.find((h) => h.id === tripSearch.hubId);
      return hub ? pick(lang, hub.label) : '';
    })();
    const hubKickerLabel = (() => {
      const hub = TRIP_HUBS && tripSearch && TRIP_HUBS.find((h) => h.id === tripSearch.hubId);
      return hub ? pick(lang, hub.chipLabel || hub.label) : '';
    })();

    const pageTitle = formatToursPageTitle({
      filteredCount: filtered.length,
      contractTotal: contractInScope,
      activeChip: activeCats[0] || null,
      activeRoute: activeRoutes[0] || null,
      activeSupplierLabel: supplierLabel,
      activeQuery: searchQuery,
      hubLabel,
      lang,
    });

    const activePills = [];
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      activePills.push({
        kind: 'query', id: 'q',
        label: T({ hant: `搜尋：「${q}」`, hans: `搜索：「${q}」`, en: `Search: "${q}"` }),
        onClear: () => onSearchQueryChange(''),
      });
    }
    if (tripSearch?.hubId && tripSearch.hubId !== 'reykjavik') {
      const hub = TRIP_HUBS.find((h) => h.id === tripSearch.hubId);
      if (hub) {
        activePills.push({
          kind: 'hub',
          id: tripSearch.hubId,
          label: pick(lang, hub.chipLabel || hub.label),
          onClear: () => onTripSearchChange(normalizeTripSearch({ ...tripSearch, hubId: 'reykjavik' })),
        });
      }
    }
    if (activeCats[0]) {
      const c = CATEGORIES.find((x) => x.id === activeCats[0]);
      if (c) activePills.push({ kind: 'chip', id: c.id, label: pick(lang, c.label), onClear: () => onToggleCat(c.id) });
    }
    if (activeRoutes[0]) {
      const r = ROUTES.find((x) => x.id === activeRoutes[0]);
      if (r) activePills.push({ kind: 'route', id: r.id, label: pick(lang, r.label), onClear: () => onToggleRoute(r.id) });
    }
    if (tripPlan?.playbookSlug && tripPlan.playbookTitle) {
      activePills.push({
        kind: 'playbook',
        id: tripPlan.playbookSlug,
        label: tripPlan.playbookTitle,
        onClear: () => onTripPlanChange({
          playbookSlug: null,
          playbookTitle: null,
          playbookActivityIds: [],
        }),
      });
    }
    if (activeSupplier !== 'all' && supplierLabel) {
      activePills.push({ kind: 'supplier', id: 'supplier', label: supplierLabel, onClear: () => onSupplier('all') });
    }
    activeFacets.forEach((f) => {
      const facet = FACETS.find((x) => x.id === f);
      if (facet) activePills.push({ kind: 'facet', id: f, label: pick(lang, facet.label), onClear: () => onToggleFacet(f) });
    });

    return (
      <section className="tours-page">
        <div className="auralis-container auralis-container--tours">
          <p className="tours-page-kicker">
            {hubKickerLabel
              ? T({ hant: `探索 / ${hubKickerLabel}`, hans: `探索 / ${hubKickerLabel}`, en: `Discover / ${hubKickerLabel}` })
              : T({ hant: '探索 / 冰島', hans: '探索 / 冰岛', en: 'Discover / Iceland' })}
          </p>
          <h1 className="tours-page-title">{pageTitle}</h1>

          {error && <BokunErrorBanner error={error} lang={lang} />}

          <div className="tours-layout">
            <SupplierFilter
              activities={sidebarActivities}
              activeSupplier={activeSupplier}
              onSupplier={onSupplier}
              activeCats={activeCats}
              onToggleCat={onToggleCat}
              activeRoutes={activeRoutes}
              onToggleRoute={onToggleRoute}
              activeFacets={activeFacets}
              onToggleFacet={onToggleFacet}
              lang={lang}
              vendorContractCounts={catalogMeta && catalogMeta.vendorContractCounts}
              vendors={catalogMeta && catalogMeta.vendors}
              displayCurrency={displayCurrency}
              fxRates={fxRates}
            />
            <div className="tours-main">
              <div className="tours-trip-context" role="status">
                <div className="tours-trip-context__body">
                  <span className="tours-trip-context__text">
                    {formatTripSearchSummary(tripSearch, lang)}
                  </span>
                  <span className="tours-trip-context__note">
                    {formatTripSearchAvailabilityNote(tripSearch, lang)}
                  </span>
                </div>
                <button type="button" className="tours-trip-context__edit" onClick={onEditTripSearch}>
                  {T({ hant: '修改', hans: '修改', en: 'Edit' })}
                </button>
              </div>
              {activePills.length > 0 && (
                <div className="tours-active-filters" role="group"
                     aria-label={T({ hant: '已套用的篩選', hans: '已应用的筛选', en: 'Active filters' })}>
                  <span className="tours-active-filters__label">
                    {T({ hant: '篩選：', hans: '筛选：', en: 'Filtering:' })}
                  </span>
                  {activePills.map((pill) => (
                    <button key={`${pill.kind}-${pill.id}`} type="button"
                            className="tours-active-filter-pill"
                            onClick={pill.onClear}
                            aria-label={T({ hant: `移除 ${pill.label}`, hans: `移除 ${pill.label}`, en: `Remove ${pill.label}` })}>
                      <span>{pill.label}</span>
                      <span aria-hidden="true" className="tours-active-filter-pill__x">✕</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="tours-toolbar tours-toolbar-card">
                <span className="tours-toolbar-count">{toolbarSummary}</span>
                <div className="tours-search-field" role="search">
                  <Icon name="search" size={14} color="var(--fg-3)" />
                  <input
                    type="text"
                    className="tours-search-input"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={T({
                      hant: '搜尋體驗（支援中文）…',
                      hans: '搜索体验（支持中文）…',
                      en: 'Search tours (Chinese OK)…',
                    })}
                    aria-label={T({ hant: '搜尋體驗', hans: '搜索体验', en: 'Search tours' })}
                  />
                  {searchInput && (
                    <button type="button" className="tours-search-clear"
                            onClick={() => { setSearchInput(''); onSearchQueryChange(''); }}
                            aria-label={T({ hant: '清除搜尋', hans: '清除搜索', en: 'Clear search' })}>
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
                <div className="tours-sort" role="group" aria-label={T({ hant: '排序', hans: '排序', en: 'Sort' })}>
                  <span className="tours-sort-label">
                    {T({ hant: '排序：', hans: '排序：', en: 'Sort:' })}
                  </span>
                  {[
                    T({ hant: '最熱門', hans: '最热门', en: 'Most popular' }),
                    T({ hant: '價格 ↑', hans: '价格 ↑', en: 'Price ↑' }),
                    T({ hant: '評分 ★', hans: '评分 ★', en: 'Rating ★' }),
                  ].map((s, i) => (
                    <button key={s} type="button" className={`tours-sort-btn${i === 0 ? ' is-active' : ''}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <ToursGrid
                loading={loading}
                error={error}
                filtered={filtered}
                tripIdSet={tripIdSet}
                onAdd={onAdd}
                onRemove={onRemove}
                onOpenDetail={onOpenDetail}
                lang={lang}
                displayCurrency={displayCurrency}
                fxRates={fxRates}
              />

              {hasMore && !loading && (
                <div className="tours-load-more">
                  <button type="button" className="tours-load-more-btn" onClick={onLoadMore} disabled={loadingMore}>
                    {loadingMore
                      ? T({ hant: '載入中…', hans: '加载中…', en: 'Loading…' })
                      : T({ hant: '載入更多行程', hans: '加载更多行程', en: 'Load more tours' })}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Progressive Tours grid — only mounts a window of cards at a time so iOS
  // Chrome doesn't OOM under the weight of ~140+ cards mounting at once.
  // Uses an IntersectionObserver sentinel near the end of the rendered slice
  // to expand the window as the user scrolls.
  const TOURS_GRID_INITIAL = 24;
  const TOURS_GRID_BATCH = 24;

  function ToursGrid({ loading, error, filtered, tripIdSet, onAdd, onRemove, onOpenDetail, lang, displayCurrency, fxRates }) {
    const [visibleCount, setVisibleCount] = useState(TOURS_GRID_INITIAL);
    const sentinelRef = useRef(null);
    const totalCount = filtered.length;

    useEffect(() => {
      setVisibleCount(TOURS_GRID_INITIAL);
    }, [totalCount, lang]);

    useEffect(() => {
      if (visibleCount >= totalCount) return undefined;
      if (typeof IntersectionObserver === 'undefined') {
        setVisibleCount(totalCount);
        return undefined;
      }
      const node = sentinelRef.current;
      if (!node) return undefined;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setVisibleCount((c) => Math.min(c + TOURS_GRID_BATCH, totalCount));
          }
        },
        { rootMargin: '600px 0px', threshold: 0.01 },
      );
      obs.observe(node);
      return () => obs.disconnect();
    }, [visibleCount, totalCount]);

    if (loading) {
      return (
        <div className="grid-cards-fluid">
          {Array.from({ length: 8 }, (_, i) => <TourCardSkeleton key={i} />)}
        </div>
      );
    }
    if (error) {
      return <CatalogErrorState error={error} lang={lang} />;
    }
    if (totalCount === 0) {
      return <EmptyState lang={lang} />;
    }

    const slice = filtered.slice(0, visibleCount);
    const priorityCount = (window.AuralisUI && window.AuralisUI.aboveFoldImagePriorityCount)
      ? window.AuralisUI.aboveFoldImagePriorityCount('tours')
      : 4;

    return (
      <React.Fragment>
        <div className="grid-cards-fluid">
          {slice.map((t, i) => (
            <TourCard key={t.id} tour={t} onAdd={onAdd} onRemove={onRemove} onView={onOpenDetail}
                      inTrip={tripIdSet.has(t.id)} lang={lang}
                      imagePriority={i < priorityCount}
                      displayCurrency={displayCurrency} fxRates={fxRates} />
          ))}
        </div>
        {visibleCount < totalCount && (
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginTop: 16 }} />
        )}
      </React.Fragment>
    );
  }

  // ============================================================== TRIP screen ===

  function TripScreen({ trip, onRemove, onCheckout, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    return (
      <MapPanel lang={lang} trip={trip}>
        <TripPanel trip={trip} onRemove={onRemove} onCheckout={onCheckout} lang={lang}
                   displayCurrency={displayCurrency} fxRates={fxRates} />
      </MapPanel>
    );
  }

  function TranslationOpenBanner({ lang, publicMode }) {
    if (publicMode !== 'open' || (lang !== 'hant' && lang !== 'hans')) return null;
    const T = (opts) => pick(lang, opts);
    return (
      <div
        className="translation-open-banner"
        role="status"
        style={{
          margin: '0 auto',
          maxWidth: 960,
          padding: '10px 16px',
          background: 'rgba(255, 193, 7, 0.12)',
          borderBottom: '1px solid rgba(255, 193, 7, 0.35)',
          color: 'var(--fg-1)',
          font: '500 13px/1.55 var(--font-text)',
          textAlign: 'center',
        }}
      >
        {T({
          hant: '本頁部分內容由 AI 自動翻譯，僅供參考；若與英文原文或客服說明有出入，請以英文版本為準。',
          hans: '本页部分内容由 AI 自动翻译，仅供参考；若与英文原文或客服说明有出入，请以英文版本为准。',
          en: '',
        })}
      </div>
    );
  }

  function BokunErrorBanner({ error, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div style={{
        marginTop: 16, padding: '14px 16px', borderRadius: 14,
        background: 'var(--coral-soft, #FFF0EE)',
        boxShadow: 'inset 0 0 0 1px rgba(255,90,106,0.25)',
        font: '500 13px/1.5 var(--font-text)', color: 'var(--fg-1)',
      }}>
        <strong>{T({ hant: '無法載入 Bókun 商品目錄', hans: '无法加载 Bókun 商品目录', en: 'Could not load Bókun catalog' })}</strong>
        <div style={{ marginTop: 6, color: 'var(--fg-2)' }}>{error.message}</div>
      </div>
    );
  }

  function CatalogErrorState({ error, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div style={{
        gridColumn: '1 / -1', padding: 48, textAlign: 'center',
        background: 'var(--surface-card)', borderRadius: 24, boxShadow: 'var(--shadow-1)',
      }}>
        <Icon name="cloud-off" size={36} color="var(--coral)" />
        <div style={{ font: '600 18px/1.3 var(--font-display)', color: 'var(--fg-1)', marginTop: 12 }}>
          {T({ hant: '目錄暫時無法使用', hans: '目录暂时无法使用', en: 'Catalog unavailable' })}
        </div>
        <div style={{ font: '400 14px/1.5 var(--font-text)', color: 'var(--fg-3)', marginTop: 8, maxWidth: 420, margin: '8px auto 0' }}>
          {error.message}
        </div>
      </div>
    );
  }

  function EmptyState({ lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div style={{
        gridColumn: '1 / -1',
        padding: '64px 24px', textAlign: 'center',
        background: 'var(--surface-card)', borderRadius: 24,
        border: '1.5px dashed var(--base-300)',
        color: 'var(--fg-3)',
      }}>
        <Icon name="search-x" size={36} color="var(--fg-3)" />
        <div style={{ font: '600 18px/1.3 var(--font-display)', color: 'var(--fg-1)', marginTop: 12 }}>
          {T({
            hant: '沒有符合條件的行程',
            hans: '没有符合条件的行程',
            en:   'No matching tours',
          })}
        </div>
        <div style={{ font: '400 14px/1.5 var(--font-text)', marginTop: 6 }}>
          {T({
            hant: '試試移除幾個篩選條件，或切換到其他供應商。',
            hans: '试试移除几个筛选条件，或切换到其他供应商。',
            en:   'Try removing a filter or switching to a different supplier.',
          })}
        </div>
      </div>
    );
  }

  window.AuralisApp = App;
})();
