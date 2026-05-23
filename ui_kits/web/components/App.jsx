/* App — multi-screen prototype.
   Discover · Tours · Activity detail · Trip · Checkout

   Language state: 'hant' | 'hans' | 'en'.
   Persisted to localStorage so refresh keeps the choice. */

(function () {
  const { useState, useMemo, useEffect } = React;
  const {
    Icon,
    CATEGORIES, LANGS, pick, applyHtmlLang, defaultCurrencyForLang, formatCatalogCount,
    Nav, Hero, TourCard, TourCardSkeleton, SupplierFilter, MapPanel, TripPanel, Checkout, Footer, ActivityDetail,
  } = window.AuralisUI;
  const { useActivities } = window.AuralisData;
  const useActivityDetail = window.AuralisData.useActivityDetail || function useActivityDetailStub(_id, _lang, previewVm) {
    return { loading: false, error: null, tour: previewVm || null };
  };

  const STORAGE_KEY = 'auralis.lang';
  const CURRENCY_KEY = 'auralis.currency';

  function App() {
    const [screen, setScreen] = useState('home');  // home | tours | detail | trip | checkout
    const [detailActivityId, setDetailActivityId] = useState(null);
    const [returnScreen, setReturnScreen] = useState('tours');

    const [lang, setLang] = useState(() => {
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '';
      return LANGS.find(l => l.id === saved) ? saved : 'hant';
    });

    const [displayCurrency, setDisplayCurrency] = useState(() => {
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(CURRENCY_KEY)) || '';
      const codes = window.AuralisUI.CURRENCIES.map(c => c.code);
      if (codes.includes(saved)) return saved;
      const initialLang = LANGS.find(l => l.id === (localStorage.getItem(STORAGE_KEY) || 'hant'))?.id || 'hant';
      return defaultCurrencyForLang(initialLang);
    });

    const [fxRates, setFxRates] = useState({ USD: 1 });

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
    const catalogTotal = hookCatalogTotal > 0 ? hookCatalogTotal : (meta && meta.total > 0 ? meta.total : activities.length);

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

    const [activeSupplier, setActiveSupplier] = useState('all');
    const [activeCats, setActiveCats] = useState([]);

    function addToTrip(vm) {
      if (tripIdSet.has(vm.id)) return;
      setTripCache((c) => ({ ...c, [vm.id]: vm }));
      setTripIds(ids => [...ids, vm.id]);
    }
    function removeFromTrip(id) {
      setTripIds(ids => ids.filter(x => x !== id));
    }
    function toggleCat(id) {
      setActiveCats(cs => cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id]);
    }

    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
        <Nav currentScreen={screen} onNav={setScreen}
             cartCount={tripIds.length} lang={lang} onCycleLang={setLang}
             displayCurrency={displayCurrency} onCurrencyChange={setDisplayCurrency} />

        {screen === 'home' && (
          <>
            <Hero lang={lang} catalogTotal={catalogTotal} onSearch={() => setScreen('tours')} />
            {error && <div className="auralis-container"><BokunErrorBanner error={error} lang={lang} /></div>}
            <CategoryStrip onClick={() => setScreen('tours')} lang={lang} />
            <FeaturedSection activities={activities} loading={loading} catalogTotal={catalogTotal}
                             onView={() => setScreen('tours')} onAdd={addToTrip} onOpenDetail={openActivityDetail}
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
            onOpenDetail={openActivityDetail}
            activeSupplier={activeSupplier}
            onSupplier={setActiveSupplier}
            activeCats={activeCats}
            onToggleCat={toggleCat}
            lang={lang}
            catalogTotal={catalogTotal}
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
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
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

  function CategoryStrip({ onClick, lang }) {
    return (
      <section className="auralis-section" style={{
        background: '#fff',
        boxShadow: 'var(--shadow-1)',
        paddingTop: 20,
        paddingBottom: 20,
        position: 'relative', zIndex: 1,
        marginTop: -32,
        borderRadius: '28px 28px 0 0',
      }}>
        <div className="category-strip-inner">
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={onClick}
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

  function FeaturedSection({ activities, loading, catalogTotal, onView, onAdd, onOpenDetail, tripIdSet, lang, displayCurrency, fxRates }) {
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
                <TourCard key={t.id} tour={t} onAdd={onAdd} onView={onOpenDetail}
                          inTrip={tripIdSet.has(t.id)} lang={lang}
                          imagePriority={i < 3}
                          displayCurrency={displayCurrency} fxRates={fxRates} />
              ))}
        </div>
        </div>
      </section>
    );
  }

  // ============================================================ TOURS screen ===

  function ToursScreen({
    activities, loading, loadingMore, hasMore, onLoadMore, error, tripIdSet, onAdd, onOpenDetail,
    activeSupplier, onSupplier, activeCats, onToggleCat, lang, catalogTotal, displayCurrency, fxRates,
  }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);

    // Filter activities by supplier (numeric Bókun vendor id or 'all') + categories.
    const filtered = useMemo(() => {
      return activities.filter(vm => {
        if (activeSupplier !== 'all') {
          const vid = vm.vendor && vm.vendor.id;
          if (vid == null || String(vid) !== String(activeSupplier)) return false;
        }
        if (activeCats.length > 0) {
          // Map our chip ids to Bókun categories via the translation table.
          const T2 = window.AuralisData.BOKUN_TRANSLATIONS.CATEGORY || {};
          const chipIdsForActivity = (vm.raw.categories || [])
            .map(c => T2[c] && T2[c].chipId)
            .filter(Boolean);
          if (!activeCats.some(c => chipIdsForActivity.includes(c))) return false;
        }
        return true;
      });
    }, [activities, activeSupplier, activeCats]);

    return (
      <section className="auralis-section" style={{ paddingTop: 'var(--page-pad-y)', paddingBottom: 80, background: 'var(--bg-page)' }}>
        <div className="auralis-container">
          <div style={{ font: '500 12px/1 var(--font-text)', color: 'var(--fg-3)', marginBottom: 8 }}>
            {T({ hant: '探索 / 雷克雅維克', hans: '探索 / 雷克雅未克', en: 'Discover / Reykjavík' })}
          </div>
          <h1 className="tours-page-title" style={{ margin: 0, font: '700 40px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
            {T({
              hant: `${countLabel} 個體驗等你挑選`,
              hans: `${countLabel} 个体验等你挑选`,
              en:   `${countLabel} experiences in Iceland`,
            })}
          </h1>

          {error && <BokunErrorBanner error={error} lang={lang} />}

          <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
            <SupplierFilter
              activities={activities}
              activeSupplier={activeSupplier} onSupplier={onSupplier}
              activeCats={activeCats} onToggleCat={onToggleCat}
              lang={lang}
              displayCurrency={displayCurrency}
              fxRates={fxRates}
            />
            <div style={{ flex: 1 }}>
              <div style={{
                background: '#fff', borderRadius: 16, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: 'var(--shadow-1)', marginBottom: 18,
              }}>
                <span style={{ font: '500 13px/1 var(--font-text)', color: 'var(--fg-3)' }}>
                  {T({
                    hant: `顯示 ${filtered.length} / ${activities.length}${catalogTotal > activities.length ? `（共 ${catalogTotal}）` : ''}`,
                    hans: `显示 ${filtered.length} / ${activities.length}${catalogTotal > activities.length ? `（共 ${catalogTotal}）` : ''}`,
                    en: `Showing ${filtered.length} of ${activities.length}${catalogTotal > activities.length ? ` (${catalogTotal} total)` : ''}`,
                  })}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: '500 12px/1 var(--font-text)', color: 'var(--fg-3)' }}>
                    {T({ hant: '排序：', hans: '排序：', en: 'Sort:' })}
                  </span>
                  {[
                    T({ hant: '最熱門', hans: '最热门', en: 'Most popular' }),
                    T({ hant: '價格 ↑', hans: '价格 ↑', en: 'Price ↑' }),
                    T({ hant: '評分 ★', hans: '评分 ★', en: 'Rating ★' }),
                  ].map((s, i) => (
                    <button key={s} style={{
                      height: 32, padding: '0 12px', borderRadius: 999, border: 0, cursor: 'pointer',
                      background: i === 0 ? 'var(--base-100)' : 'transparent',
                      color: i === 0 ? 'var(--fg-1)' : 'var(--fg-2)',
                      font: '600 12px/1 var(--font-text)',
                    }}>{s}</button>
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
                        <TourCard key={t.id} tour={t} onAdd={onAdd} onView={onOpenDetail}
                                  inTrip={tripIdSet.has(t.id)} lang={lang}
                                  imagePriority={i < 4}
                                  displayCurrency={displayCurrency} fxRates={fxRates} />
                      ))}
              </div>

              {hasMore && !loading && (
                <div style={{ marginTop: 28, textAlign: 'center' }}>
                  <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{
                    height: 48, padding: '0 28px', borderRadius: 999, border: 0, cursor: loadingMore ? 'wait' : 'pointer',
                    background: 'var(--base-100)', boxShadow: 'inset 0 0 0 1px var(--base-300)',
                    font: '600 14px/1 var(--font-text)', color: 'var(--fg-1)',
                  }}>
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
        background: '#fff', borderRadius: 24, boxShadow: 'var(--shadow-1)',
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
        background: '#fff', borderRadius: 24,
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
