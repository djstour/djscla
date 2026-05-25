/* App — multi-screen prototype.
   Discover · Tours · Activity detail · Trip · Checkout

   Language state: 'hant' | 'hans' | 'en'.
   Persisted to localStorage so refresh keeps the choice. */

(function () {
  const { useState, useMemo, useEffect } = React;
  const {
    Icon,
    CATEGORIES, ROUTES, FACETS, LANGS, pick, applyHtmlLang, defaultCurrencyForLang, formatCatalogCount, formatToursToolbarSummary, formatToursPageTitle,
    loadTripSearch, saveTripSearch, normalizeTripSearch, facetsFromTripSearch, formatTripSearchSummary,
    TRIP_HUBS,
    readUrlState, buildUrlForState, currentUrlString,
    activityVendor, vendorIdsMatch,
    Nav, Hero, TourCard, TourCardSkeleton, SupplierFilter, MapPanel, TripPanel, Checkout, Footer, ActivityDetail,
  } = window.AuralisUI;
  const { useActivities } = window.AuralisData;
  const useActivityDetail = window.AuralisData.useActivityDetail || function useActivityDetailStub(_id, _lang, previewVm) {
    return { loading: false, error: null, tour: previewVm || null };
  };

  const STORAGE_KEY = 'auralis.lang';
  const CURRENCY_KEY = 'auralis.currency';

  function App() {
    const [siteTheme, setSiteTheme] = useState(() => window.AuralisUI.getInitialSiteTheme());

    useEffect(() => {
      window.AuralisUI.applySiteTheme(siteTheme);
    }, [siteTheme]);

    function handleSiteThemeChange(themeId) {
      setSiteTheme(window.AuralisUI.setSiteThemeById(themeId));
    }

    const initialUrl = (typeof window !== 'undefined' ? readUrlState() : null) || {
      screen: 'home', chip: null, route: null, supplier: 'all',
    };
    const [screen, setScreen] = useState(initialUrl.screen);  // home | tours | detail | trip | checkout
    const [detailActivityId, setDetailActivityId] = useState(null);
    const [returnScreen, setReturnScreen] = useState('tours');

    const [lang, setLang] = useState(() => {
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
            setFxRates({ USD: 1, ...data.rates });
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

    // Trip = ARRAY OF BÓKUN IDS (numbers). View-models are looked up from the
    // current `activities` list, so a language flip rehydrates every cart row
    // without us touching trip state.
    const [tripIds, setTripIds] = useState([]);
    const [tripCache, setTripCache] = useState({});

    const trip = useMemo(
      () => tripIds.map((id) => activities.find((a) => a.id === id) || tripCache[id]).filter(Boolean),
      [tripIds, activities, tripCache]
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
    );

    function openActivityDetail(tour) {
      window.AuralisUI.prefetchProxiedImage(
        tour.coverImageUrl,
        window.AuralisUI.imageProfileForViewport().prefetch,
      );
      if (window.AuralisData && window.AuralisData.BokunAdapter) {
        window.AuralisData.BokunAdapter.prefetchActivityById(tour.id, { lang });
      }
      setTripCache((c) => ({ ...c, [tour.id]: tour }));
      setReturnScreen(screen === 'detail' ? returnScreen : screen);
      setDetailActivityId(tour.id);
      setScreen('detail');
      window.scrollTo(0, 0);
    }

    function closeActivityDetail() {
      setDetailActivityId(null);
      setScreen(returnScreen || 'tours');
      window.scrollTo(0, 0);
    }
    const tripIdSet = useMemo(() => new Set(tripIds), [tripIds]);

    const [tripSearch, setTripSearch] = useState(() => loadTripSearch());
    const [activeSupplier, setActiveSupplier] = useState(initialUrl.supplier || 'all');
    const [activeCats, setActiveCats] = useState(initialUrl.chip ? [initialUrl.chip] : []);
    const [activeRoutes, setActiveRoutes] = useState(initialUrl.route ? [initialUrl.route] : []);
    const [activeFacets, setActiveFacets] = useState([]);

    useEffect(() => {
      saveTripSearch(tripSearch);
    }, [tripSearch]);

    // --- URL sync ---------------------------------------------------------
    // pushState on filter / screen changes so the URL reflects what's visible.
    // Detail screen is intentionally excluded (URL stays at /tours during a
    // detail overlay; closing returns to the same filtered list).
    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (screen === 'detail') return;
      const next = buildUrlForState({
        screen,
        chip: activeCats[0] || null,
        route: activeRoutes[0] || null,
        supplier: activeSupplier,
      });
      if (currentUrlString() !== next) {
        window.history.pushState(null, '', next);
      }
    }, [screen, activeCats, activeRoutes, activeSupplier]);

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
        setDetailActivityId(null);
      }
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    function addToTrip(vm) {
      if (tripIdSet.has(vm.id)) return;
      setTripCache((c) => ({ ...c, [vm.id]: vm }));
      setTripIds(ids => [...ids, vm.id]);
      const showToast = window.AuralisUI && window.AuralisUI.showToast;
      if (showToast) {
        const T = (opts) => window.AuralisUI.pick(lang, opts);
        showToast({
          tone: 'success',
          message: T({
            hant: `已加入「${vm.title}」`,
            hans: `已加入「${vm.title}」`,
            en:   `Added "${vm.title}" to your trip`,
          }),
          actionLabel: T({ hant: '查看行程', hans: '查看行程', en: 'View trip' }),
          onAction: () => { handleNav('checkout'); },
        });
      }
    }
    function removeFromTrip(id) {
      const removed = tripCache[id];
      setTripIds(ids => ids.filter(x => x !== id));
      const showToast = window.AuralisUI && window.AuralisUI.showToast;
      if (showToast) {
        const T = (opts) => window.AuralisUI.pick(lang, opts);
        const title = removed && removed.title;
        showToast({
          message: title
            ? T({ hant: `已從行程移除「${title}」`, hans: `已从行程移除「${title}」`, en: `Removed "${title}" from trip` })
            : T({ hant: '已從行程移除', hans: '已从行程移除', en: 'Removed from trip' }),
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
    function goToToursWithFilters(search, { chipId = null, routeId = null } = {}) {
      const normalized = normalizeTripSearch(search || tripSearch);
      setTripSearch(normalized);
      setActiveCats(chipId ? [chipId] : []);
      setActiveRoutes(routeId ? [routeId] : []);
      // Trip-search hub (e.g. departure city) is a soft preference, not a
      // hard filter — handled as a sort priority inside ToursScreen.
      setActiveFacets([]);
      setScreen('tours');
      window.scrollTo(0, 0);
    }

    function openToursWithChip(chipId) {
      goToToursWithFilters(tripSearch, { chipId });
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
             siteThemeId={siteTheme.id} onSiteThemeChange={handleSiteThemeChange} />

        {screen === 'home' && (
          <>
            <Hero
              lang={lang}
              catalogTotal={catalogTotal}
              theme={siteTheme}
              tripSearch={tripSearch}
              onTripSearchChange={setTripSearch}
              onSearch={(search) => goToToursWithFilters(search)}
              onPopularChip={(search, chip) => goToToursWithFilters(search, {
                chipId: chip.chipId || null,
                routeId: chip.routeId || null,
              })}
            />
            {error && <div className="auralis-container"><BokunErrorBanner error={error} lang={lang} /></div>}
            <CategoryStrip onSelectCategory={openToursWithChip} lang={lang} />
            <FeaturedSection activities={activities} loading={loading} catalogTotal={catalogTotal}
                             onView={() => goToToursWithFilters(tripSearch)} onAdd={addToTrip} onRemove={removeFromTrip} onOpenDetail={openActivityDetail}
                             tripIdSet={tripIdSet} lang={lang}
                             displayCurrency={displayCurrency} fxRates={fxRates} />
            <Footer lang={lang} />
          </>
        )}

        {screen === 'tours' && (
          <ToursScreen
            activities={activities}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMore}
            error={error}
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
            tripSearch={tripSearch}
            onEditTripSearch={() => setScreen('home')}
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
            inTrip={detailActivityId != null && tripIdSet.has(detailActivityId)}
            trip={trip}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
            initialDate={tripSearch.startDate}
            initialGuestCounts={{ adults: tripSearch.adults, children: tripSearch.children }}
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
            trip={trip}
            onBack={() => setScreen('trip')}
            onPaid={() => { setTripIds([]); setScreen('home'); }}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
          />
        )}

      </div>
    );
  }

  // ============================================================ HOME pieces ===

  function CategoryStrip({ onSelectCategory, lang }) {
    return (
      <section className="auralis-section category-strip">
        <div className="category-strip-inner">
          {CATEGORIES.map(c => (
            <button key={c.id} type="button" onClick={() => onSelectCategory(c.id)}
                    style={{
                      flexShrink: 0,
                      height: 96, width: 140,
                      borderRadius: 18, border: 0, cursor: 'pointer',
                      background: 'var(--base-50)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
                      transition: 'all var(--dur-base) var(--ease-out)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gradient-aurora-soft)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--base-50)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <Icon name={c.icon} size={26} color="var(--fg-1)" />
              <span style={{ font: '600 12px/1.2 var(--font-text)', color: 'var(--fg-1)', textAlign: 'center' }}>
                {pick(lang, c.label)}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  function FeaturedSection({ activities, loading, catalogTotal, onView, onAdd, onRemove, onOpenDetail, tripIdSet, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);
    return (
      <section className="auralis-section" style={{ paddingTop: 'clamp(48px, 10vw, 72px)', paddingBottom: 'clamp(48px, 10vw, 72px)' }}>
        <div className="auralis-container">
        <div className="featured-header">
          <div>
            <span className="overline" style={{ color: 'var(--coral)' }}>
              {T({ hant: '本月精選', hans: '本月精选', en: 'This month' })}
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

        <div className="grid-cards-3">
          {loading
            ? Array.from({ length: 6 }, (_, i) => <TourCardSkeleton key={i} />)
            : activities.slice(0, 6).map((t, i) => (
                <TourCard key={t.id} tour={t} onAdd={onAdd} onRemove={onRemove} onView={onOpenDetail}
                          inTrip={tripIdSet.has(t.id)} lang={lang}
                          imagePriority={i < window.AuralisUI.aboveFoldImagePriorityCount('featured')}
                          displayCurrency={displayCurrency} fxRates={fxRates} />
              ))}
        </div>
        </div>
      </section>
    );
  }

  // ============================================================ TOURS screen ===

  function ToursScreen({
    activities, loading, loadingMore, hasMore, onLoadMore, error, tripIdSet, onAdd, onRemove, onOpenDetail,
    activeSupplier, onSupplier, activeCats, onToggleCat,
    activeRoutes, onToggleRoute, activeFacets, onToggleFacet,
    tripSearch, onEditTripSearch,
    lang, catalogTotal, catalogMeta, displayCurrency, fxRates,
  }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);

    const catalogActivities = useMemo(() => {
      const byId = new Map();
      activities.forEach((vm) => {
        if (vm && vm.id != null) byId.set(String(vm.id), vm);
      });
      return [...byId.values()];
    }, [activities]);

    const tripFacets = useMemo(() => facetsFromTripSearch(tripSearch), [tripSearch]);

    // Filter activities by supplier (Bókun vendor.id) + categories.
    const filtered = useMemo(() => {
      const matched = [];
      catalogActivities.forEach((vm, idx) => {
        if (activeSupplier !== 'all') {
          const v = activityVendor(vm);
          if (!vendorIdsMatch(v && v.id, activeSupplier)) return;
        }
        const chipIdsForActivity = vm.chipIds?.length
          ? vm.chipIds
          : (vm.raw && vm.raw.chipIds) || [];
        const routeIdsForActivity = vm.routeIds?.length
          ? vm.routeIds
          : (vm.raw && vm.raw.routeIds) || [];
        const facetIdsForActivity = vm.facetIds?.length
          ? vm.facetIds
          : (vm.raw && vm.raw.facetIds) || [];

        if (activeCats.length > 0) {
          if (!chipIdsForActivity.length || !activeCats.some((c) => chipIdsForActivity.includes(c))) {
            return;
          }
        }
        if (activeRoutes.length > 0) {
          if (!routeIdsForActivity.length || !activeRoutes.some((r) => routeIdsForActivity.includes(r))) {
            return;
          }
        }
        if (activeFacets.length > 0) {
          if (!activeFacets.every((f) => facetIdsForActivity.includes(f))) {
            return;
          }
        }
        // Trip-search hub (departure city, season) is a soft preference:
        // matching activities sort first, the rest stay in the list.
        const tripScore = tripFacets.length
          ? tripFacets.reduce((acc, f) => acc + (facetIdsForActivity.includes(f) ? 1 : 0), 0)
          : 0;
        matched.push({ vm, idx, tripScore });
      });

      matched.sort((a, b) => (b.tripScore - a.tripScore) || (a.idx - b.idx));
      return matched.map((m) => m.vm);
    }, [catalogActivities, activeSupplier, activeCats, activeRoutes, activeFacets, tripFacets]);

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
        : catalogActivities.filter((vm) => vendorIdsMatch(activityVendor(vm) && activityVendor(vm).id, activeSupplier)).length)
      : catalogActivities.length;

    const hasExtraFilters = activeCats.length > 0 || activeRoutes.length > 0 || activeFacets.length > 0;

    const toolbarSummary = formatToursToolbarSummary({
      filtered: filtered.length,
      loadedUnique: loadedInScope,
      contractProducts: contractInScope,
      hasExtraFilters,
      lang,
    });

    const supplierOption = activeSupplier !== 'all'
      ? (catalogActivities.find((vm) => {
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

    const pageTitle = formatToursPageTitle({
      filteredCount: filtered.length,
      contractTotal: contractInScope,
      activeChip: activeCats[0] || null,
      activeRoute: activeRoutes[0] || null,
      activeSupplierLabel: supplierLabel,
      hubLabel,
      lang,
    });

    const activePills = [];
    if (activeCats[0]) {
      const c = CATEGORIES.find((x) => x.id === activeCats[0]);
      if (c) activePills.push({ kind: 'chip', id: c.id, label: pick(lang, c.label), onClear: () => onToggleCat(c.id) });
    }
    if (activeRoutes[0]) {
      const r = ROUTES.find((x) => x.id === activeRoutes[0]);
      if (r) activePills.push({ kind: 'route', id: r.id, label: pick(lang, r.label), onClear: () => onToggleRoute(r.id) });
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
        <div className="auralis-container">
          <p className="tours-page-kicker">
            {T({ hant: '探索 / 雷克雅維克', hans: '探索 / 雷克雅未克', en: 'Discover / Reykjavík' })}
          </p>
          <h1 className="tours-page-title">{pageTitle}</h1>

          {error && <BokunErrorBanner error={error} lang={lang} />}

          <div className="tours-layout">
            <SupplierFilter
              activities={catalogActivities}
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
                <span className="tours-trip-context__text">
                  {formatTripSearchSummary(tripSearch, lang)}
                </span>
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

              <div className="grid-cards-2">
                {loading
                  ? Array.from({ length: 4 }, (_, i) => <TourCardSkeleton key={i} />)
                  : error
                    ? <CatalogErrorState error={error} lang={lang} />
                    : filtered.length === 0
                    ? <EmptyState lang={lang} />
                    : filtered.map((t, i) => (
                        <TourCard key={t.id} tour={t} onAdd={onAdd} onRemove={onRemove} onView={onOpenDetail}
                                  inTrip={tripIdSet.has(t.id)} lang={lang}
                                  imagePriority={i < window.AuralisUI.aboveFoldImagePriorityCount('tours')}
                                  displayCurrency={displayCurrency} fxRates={fxRates} />
                      ))}
              </div>

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
