/* App — multi-screen prototype.
   Discover · Tours · Trip (with map) · Checkout

   Language state: 'hant' | 'hans' | 'en'.
   Persisted to localStorage so refresh keeps the choice. */

(function () {
  const { useState, useMemo, useEffect } = React;
  const {
    Icon, formatPrice, fakePhoto, PhotoSparkles,
    CATEGORIES, LANGS, pick, applyHtmlLang,
    Nav, Hero, TourCard, TourCardSkeleton, SupplierFilter, MapPanel, TripPanel, Checkout, Footer,
  } = window.AuralisUI;
  const { useActivities } = window.AuralisData;

  const STORAGE_KEY = 'auralis.lang';

  function App() {
    const [screen, setScreen] = useState('home');  // home | tours | trip | checkout

    const [lang, setLang] = useState(() => {
      const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || '';
      return LANGS.find(l => l.id === saved) ? saved : 'hant';
    });

    useEffect(() => {
      applyHtmlLang(lang);
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    }, [lang]);

    // --- Bókun activity data ---------------------------------------------------
    // Pulled through the adapter; view-models are re-derived whenever `lang`
    // changes, so all screen copy stays in sync with the toggle automatically.
    const { loading, error, activities } = useActivities(lang);

    // Trip = ARRAY OF BÓKUN IDS (numbers). View-models are looked up from the
    // current `activities` list, so a language flip rehydrates every cart row
    // without us touching trip state.
    const [tripIds, setTripIds] = useState([]);

    // Seed the trip with the first two activities once data has loaded — this
    // gives the prototype something to demo on first paint. Runs once.
    const seededRef = React.useRef(false);
    useEffect(() => {
      if (!seededRef.current && activities.length > 0) {
        seededRef.current = true;
        setTripIds(activities.slice(0, 2).map(a => a.id));
      }
    }, [activities]);

    const trip = useMemo(
      () => tripIds.map(id => activities.find(a => a.id === id)).filter(Boolean),
      [tripIds, activities]
    );
    const tripIdSet = useMemo(() => new Set(tripIds), [tripIds]);

    const [activeSupplier, setActiveSupplier] = useState('all');
    const [activeCats, setActiveCats] = useState([]);

    function addToTrip(vm) {
      if (tripIdSet.has(vm.id)) return;
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
             cartCount={tripIds.length} lang={lang} onCycleLang={setLang} />

        {screen === 'home' && (
          <>
            <Hero lang={lang} onSearch={() => setScreen('tours')} />
            <CategoryStrip onClick={() => setScreen('tours')} lang={lang} />
            <FeaturedSection activities={activities} loading={loading}
                             onView={() => setScreen('tours')} onAdd={addToTrip}
                             tripIdSet={tripIdSet} lang={lang} />
            <BookunBanner lang={lang} />
            <SampleTrip activities={activities}
                        onAdd={(t) => { addToTrip(t); setScreen('trip'); }}
                        lang={lang} />
            <Footer lang={lang} />
          </>
        )}

        {screen === 'tours' && (
          <ToursScreen
            activities={activities}
            loading={loading}
            error={error}
            tripIdSet={tripIdSet}
            onAdd={addToTrip}
            activeSupplier={activeSupplier} onSupplier={setActiveSupplier}
            activeCats={activeCats} onToggleCat={toggleCat}
            lang={lang}
          />
        )}

        {screen === 'trip' && (
          <TripScreen
            trip={trip}
            onRemove={removeFromTrip}
            onCheckout={() => setScreen('checkout')}
            lang={lang}
          />
        )}

        {screen === 'checkout' && (
          <Checkout
            trip={trip}
            onBack={() => setScreen('trip')}
            onPaid={() => { setTrip([]); setScreen('home'); }}
            lang={lang}
          />
        )}

        {/* Bottom screen switcher — prototype scaffolding */}
        <ScreenSwitcher screen={screen} setScreen={setScreen} lang={lang} />
      </div>
    );
  }

  // ============================================================ HOME pieces ===

  function CategoryStrip({ onClick, lang }) {
    return (
      <section style={{
        background: '#fff',
        boxShadow: 'var(--shadow-1)',
        padding: '20px 32px',
        position: 'relative', zIndex: 1,
        marginTop: -32,
        borderRadius: '28px 28px 0 0',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', gap: 16, overflowX: 'auto' }}>
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

  function FeaturedSection({ activities, loading, onView, onAdd, tripIdSet, lang }) {
    const T = (opts) => pick(lang, opts);
    return (      <section style={{ padding: '72px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <span className="overline" style={{ color: 'var(--coral)' }}>
              {T({ hant: '本月精選', hans: '本月精选', en: 'This month' })}
            </span>
            <h2 style={{ margin: '8px 0 0', font: '700 44px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
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
          }}>{T({ hant: '看全部 1,247 個', hans: '查看全部 1,247 个', en: 'View all 1,247' })} <Icon name="arrow-right" size={14} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {loading
            ? Array.from({ length: 6 }, (_, i) => <TourCardSkeleton key={i} />)
            : activities.map(t => <TourCard key={t.id} tour={t} onAdd={onAdd} inTrip={tripIdSet.has(t.id)} lang={lang} />)}
        </div>
      </section>
    );
  }

  function BookunBanner({ lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <section style={{
        padding: '24px 32px',
        background: 'linear-gradient(180deg, transparent, var(--base-100) 100%)',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          background: '#fff', borderRadius: 28, padding: '40px 48px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center',
          boxShadow: 'var(--shadow-2)', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -120, top: -120, width: 360, height: 360,
            borderRadius: 999, background: 'var(--gradient-aurora)', opacity: 0.18, filter: 'blur(20px)',
          }}/>
          <div style={{ position: 'relative' }}>
            <span className="overline" style={{ color: 'var(--aurora-deep)' }}>
              {T({ hant: '為什麼選 Auralis', hans: '为什么选 Auralis', en: 'Why Auralis' })}
            </span>
            <h2 style={{ margin: '8px 0 12px', font: '700 36px/1.1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
              {T({
                hant: '一次結帳，所有供應商。',
                hans: '一次结账，所有供应商。',
                en:   'One checkout. Every operator.',
              })}
            </h2>
            <p style={{ margin: 0, font: '500 16px/1.6 var(--font-text)', color: 'var(--fg-2)', maxWidth: 460 }}>
              {T({
                hant: '我們透過 Bókun 即時整合 800+ 在地嚮導的庫存。沒有層層轉售、沒有匯率手續費、沒有信用卡跨境費 — 一次刷卡，全行程鎖票。',
                hans: '我们通过 Bókun 实时整合 800+ 当地向导的库存。没有层层转售、没有汇率手续费、没有信用卡跨境费 — 一次刷卡,全行程锁票。',
                en:   'We aggregate 800+ verified operators in real-time via Bókun. No resellers, no FX fees, no surprises — one card swipe, your whole itinerary locked.',
              })}
            </p>
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { icon: 'shield-check', n: '800+',    l: { hant: '即時供應商', hans: '实时供应商', en: 'live operators' },  bg: 'var(--gradient-aurora-soft)' },
              { icon: 'wallet',       n: '0%',      l: { hant: '隱藏費用',   hans: '隐藏费用',   en: 'hidden fees' },     bg: 'var(--gradient-sun-soft)' },
              { icon: 'languages',    n: T({ hant:'中文', hans:'中文', en:'24h' }),  l: { hant: '24 h 客服', hans: '24 h 客服', en: 'support' },        bg: 'var(--gradient-mist)' },
              { icon: 'clock',        n: '< 5 min', l: { hant: '行程確認',   hans: '行程确认',   en: 'confirmation' },    bg: '#fff' },
            ].map((s, i) => (
              <div key={i} style={{
                background: s.bg, borderRadius: 16, padding: '18px 16px',
                display: 'flex', flexDirection: 'column', gap: 8,
                boxShadow: s.bg === '#fff' ? 'inset 0 0 0 1px var(--base-200)' : 'inset 0 0 0 1px rgba(255,255,255,0.6)',
              }}>
                <Icon name={s.icon} size={22} color="var(--fg-1)" />
                <span style={{ font: '700 26px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>{s.n}</span>
                <span style={{ font: '500 12px/1.3 var(--font-text)', color: 'var(--fg-2)' }}>{pick(lang, s.l)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function SampleTrip({ activities, onAdd, lang }) {
    const T = (opts) => pick(lang, opts);
    const days = T({
      hant: [
        ['Day 1', 'Reykjavík · 抵達'],
        ['Day 2', '黃金圈 · 蓋歇爾'],
        ['Day 3', '維克 · 黑沙灘'],
        ['Day 4', '冰河湖'],
        ['Day 5', '霍芬 · 龍蝦晚餐'],
        ['Day 6', '冰川健行'],
        ['Day 7', '雷克雅維克 · 藍湖'],
      ],
      hans: [
        ['Day 1', '雷克雅未克 · 抵达'],
        ['Day 2', '黄金圈 · 盖歇尔'],
        ['Day 3', '维克 · 黑沙滩'],
        ['Day 4', '冰河湖'],
        ['Day 5', '霍芬 · 龙虾晚餐'],
        ['Day 6', '冰川徒步'],
        ['Day 7', '雷克雅未克 · 蓝湖'],
      ],
      en: [
        ['Day 1', 'Reykjavík · arrival'],
        ['Day 2', 'Golden Circle · Geysir'],
        ['Day 3', 'Vík · Black Beach'],
        ['Day 4', 'Jökulsárlón lagoon'],
        ['Day 5', 'Höfn · langoustines'],
        ['Day 6', 'Glacier hike'],
        ['Day 7', 'Reykjavík · Blue Lagoon'],
      ],
    });
    const stripeColors = ['#2EFFB8', '#00D5FF', '#FF7A2E', '#FF5A6A', '#C6FF3F', '#B331E2', '#FFB347'];

    return (
      <section style={{
        padding: '72px 32px',
        background: 'linear-gradient(135deg, #3A1B7A 0%, #6B2FE6 35%, #B331E2 70%, #FF7A2E 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <PhotoSparkles density={30} color="#fff" />
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
          <div style={{ maxWidth: 620 }}>
            <span style={{ font: '600 11px/1 var(--font-text)', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C6FF3F' }}>
              {T({ hant: '範本行程 · 一鍵套用', hans: '范本行程 · 一键套用', en: 'Sample itinerary · one-click apply' })}
            </span>
            <h2 style={{ margin: '14px 0 16px', font: '700 56px/1 var(--font-display)', color: '#fff', letterSpacing: '-0.03em' }}>
              {T({
                hant: '南岸自駕 · 7 天 6 夜',
                hans: '南岸自驾 · 7 天 6 夜',
                en:   'South-coast self-drive · 7 days',
              })}
            </h2>
            <p style={{ margin: 0, font: '500 17px/1.5 var(--font-text)', color: 'rgba(255,255,255,0.86)', maxWidth: 520 }}>
              {T({
                hant: '由在地嚮導 Eliza H. 編排：從黃金圈、瓦特納冰川到傑古沙龍冰河湖。中文嚮導、免費取消、保險全包。',
                hans: '由当地向导 Eliza H. 编排：从黄金圈、瓦特纳冰川到杰古沙龙冰河湖。中文向导、免费取消、保险全包。',
                en:   'Crafted by guide Eliza H. From Golden Circle to Vatnajökull and Jökulsárlón. Mandarin guide, free cancellation, insurance included.',
              })}
            </p>
            <div style={{ display: 'flex', gap: 14, marginTop: 28 }}>
              <button onClick={() => { const t = activities && activities[4]; if (t) onAdd(t); }} style={{
                height: 52, padding: '0 26px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: '#C6FF3F', color: '#11151F',
                font: '700 14px/1 var(--font-text)',
                boxShadow: '0 12px 32px rgba(198,255,63,0.35)',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>{T({ hant: '套用範本', hans: '套用范本', en: 'Apply this trip' })} <Icon name="arrow-right" size={16} /></button>
              <button style={{
                height: 52, padding: '0 22px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: 'rgba(255,255,255,0.18)', color: '#fff',
                backdropFilter: 'blur(20px)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)',
                font: '600 14px/1 var(--font-text)',
              }}>{T({ hant: '查看完整行程', hans: '查看完整行程', en: 'See full plan' })}</button>
            </div>
          </div>

          {/* Day-pill stack */}
          <div style={{ position: 'absolute', right: 0, top: 0, width: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {days.map(([d, t], i) => (
              <div key={d} style={{
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(16px) saturate(1.2)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.35)',
                borderRadius: 14, padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ width: 6, height: 26, borderRadius: 3, background: stripeColors[i], flex: 'none' }}/>
                <span style={{ font: '700 13px/1 var(--font-display)', color: '#fff', width: 60 }}>{d}</span>
                <span style={{ font: '500 13px/1 var(--font-text)', color: 'rgba(255,255,255,0.88)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ============================================================ TOURS screen ===

  function ToursScreen({ activities, loading, error, tripIdSet, onAdd, activeSupplier, onSupplier, activeCats, onToggleCat, lang }) {
    const T = (opts) => pick(lang, opts);

    // Filter activities by supplier (numeric Bókun vendor id or 'all') + categories.
    const filtered = useMemo(() => {
      return activities.filter(vm => {
        if (activeSupplier !== 'all' && vm.vendor && vm.vendor.id !== activeSupplier) return false;
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
      <section style={{ padding: '32px 32px 80px', background: 'var(--bg-page)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ font: '500 12px/1 var(--font-text)', color: 'var(--fg-3)', marginBottom: 8 }}>
            {T({ hant: '探索 / 雷克雅維克', hans: '探索 / 雷克雅未克', en: 'Discover / Reykjavík' })}
          </div>
          <h1 style={{ margin: 0, font: '700 40px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
            {T({
              hant: '1,247 個體驗等你挑選',
              hans: '1,247 个体验等你挑选',
              en:   '1,247 experiences in Iceland',
            })}
          </h1>
          <div style={{ font: '500 14px/1 var(--font-text)', color: 'var(--fg-3)', marginTop: 8 }}>
            {T({
              hant: '12 → 19 Mar 2026 · 2 位旅人',
              hans: '12 → 19 Mar 2026 · 2 位旅客',
              en:   '12 → 19 Mar 2026 · 2 travelers',
            })}
          </div>

          <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
            <SupplierFilter
              activeSupplier={activeSupplier} onSupplier={onSupplier}
              activeCats={activeCats} onToggleCat={onToggleCat}
              priceMin={1000} priceMax={20000}
              lang={lang}
            />
            <div style={{ flex: 1 }}>
              <div style={{
                background: '#fff', borderRadius: 16, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: 'var(--shadow-1)', marginBottom: 18,
              }}>
                <span style={{ font: '500 13px/1 var(--font-text)', color: 'var(--fg-3)' }}>
                  {T({ hant: `顯示 ${filtered.length} / ${activities.length}`, hans: `显示 ${filtered.length} / ${activities.length}`, en: `Showing ${filtered.length} of ${activities.length}` })}
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
                {loading
                  ? Array.from({ length: 4 }, (_, i) => <TourCardSkeleton key={i} />)
                  : filtered.length === 0
                    ? <EmptyState lang={lang} />
                    : filtered.map(t => <TourCard key={t.id} tour={t} onAdd={onAdd} inTrip={tripIdSet.has(t.id)} lang={lang} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ============================================================== TRIP screen ===

  function TripScreen({ trip, onRemove, onCheckout, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <MapPanel lang={lang} trip={trip}>
        <TripPanel trip={trip} onRemove={onRemove} onCheckout={onCheckout} lang={lang} />
        {/* Stat pills */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 12, alignSelf: 'flex-start' }}>
          {[
            { i: 'route',     n: '1,420 km',     l: { hant: '總里程',   hans: '总里程',   en: 'total drive' } },
            { i: 'snowflake', n: '−3°C',         l: { hant: '平均氣溫', hans: '平均气温', en: 'avg temp' } },
            { i: 'sparkles',  n: '92%',          l: { hant: '極光機率', hans: '极光概率', en: 'aurora chance' } },
            { i: 'fuel',      n: 'NT$ 4,200',    l: { hant: '預估油費', hans: '预估油费', en: 'est. fuel' } },
          ].map(s => (
            <div key={s.i} className="glass" style={{
              padding: '10px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12, minWidth: 180,
            }}>
              <Icon name={s.i} size={18} color="var(--aurora-deep)" />
              <div>
                <div style={{ font: '700 16px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>{s.n}</div>
                <div style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {pick(lang, s.l)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </MapPanel>
    );
  }

  // ============================================================ Screen Switcher ===

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

  function ScreenSwitcher({ screen, setScreen, lang }) {
    const screens = [
      { id: 'home',     label: { hant: '探索',         hans: '探索',         en: 'Discover' } },
      { id: 'tours',    label: { hant: '行程',         hans: '行程',         en: 'Tours' } },
      { id: 'trip',     label: { hant: '我的旅程 · 地圖', hans: '我的旅程 · 地图', en: 'Trip · Map' } },
      { id: 'checkout', label: { hant: '結帳',         hans: '结账',         en: 'Checkout' } },
    ];
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: 6, borderRadius: 999,
        background: 'rgba(17,21,31,0.85)', backdropFilter: 'blur(20px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}>
        <span style={{ padding: '0 10px', font: '600 10px/1 var(--font-text)', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {pick(lang, { hant: '螢幕', hans: '屏幕', en: 'Screen' })}
        </span>
        {screens.map(s => (
          <button key={s.id} onClick={() => setScreen(s.id)}
                  style={{
                    height: 34, padding: '0 14px', borderRadius: 999, border: 0, cursor: 'pointer',
                    background: screen === s.id ? 'var(--gradient-aurora)' : 'transparent',
                    color: screen === s.id ? '#062F2A' : '#fff',
                    font: '700 12px/1 var(--font-text)',
                    transition: 'all var(--dur-fast) var(--ease-out)',
                  }}>
            {pick(lang, s.label)}
          </button>
        ))}
      </div>
    );
  }

  window.AuralisApp = App;
})();
