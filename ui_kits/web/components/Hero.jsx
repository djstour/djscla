/* Hero — full-bleed animated aurora backdrop + glass search panel.
   Used on the Discover screen. */

(function () {
  const { useState } = React;
  const { Icon, pick } = window.AuralisUI;

  function Hero({ onSearch, lang }) {
    const T = (opts) => pick(lang, opts);

    const [city, setCity] = useState('Reykjavík (KEF)');
    const [dates, setDates] = useState('12 → 19 Mar 2026');
    // Travelers placeholder re-syncs when language changes — the input is
    // controlled, so without an effect React keeps the stale TC string.
    const defaultPeople = T({ hant: '2 位旅人', hans: '2 位旅客', en: '2 adults' });
    const [people, setPeople] = useState(defaultPeople);
    const [peopleDirty, setPeopleDirty] = useState(false);
    React.useEffect(() => {
      if (!peopleDirty) setPeople(defaultPeople);
    }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

    const headlineGrad = T({
      hant: ['為你而轉的', '冰島旅程。'],
      hans: ['为你而转的', '冰岛旅程。'],
      en:   ['The Iceland trip', 'that bends to you.'],
    });

    return (
      <section style={{ position: 'relative', minHeight: 640, overflow: 'hidden' }}
               className="bg-aurora-animated">
        {/* Decorative drift sparks */}
        <svg viewBox="0 0 1440 640" preserveAspectRatio="none"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.6 }}>
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={Math.random() * 1440} cy={Math.random() * 400} r={Math.random() * 1.6 + 0.4}
                    fill="#fff" opacity={0.3 + Math.random() * 0.5}/>
          ))}
        </svg>

        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '96px 32px 48px',
                      display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 48, alignItems: 'center' }}>
          {/* Copy */}
          <div>
            <span className="overline" style={{ color: 'var(--coral)' }}>
              {T({ hant: '限時 · 3 月 12 – 19 日', hans: '限时 · 3 月 12 – 19 日', en: 'Limited · 12 – 19 Mar' })}
            </span>
            <h1 style={{
              margin: '14px 0 0',
              font: '700 var(--t-display-1)/0.98 var(--font-display)',
              letterSpacing: '-0.03em',
              color: 'var(--fg-1)',
              textWrap: 'balance',
            }}>
              <span style={{
                display: 'inline-block',
                background: 'linear-gradient(120deg,#11151F 0%,#11151F 60%,#6B2FE6 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>{headlineGrad[0]}</span><br />
              <span style={{
                display: 'inline-block',
                background: 'var(--gradient-aurora)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>{headlineGrad[1]}</span>
            </h1>
            <p style={{
              margin: '20px 0 0', maxWidth: 480,
              font: '500 18px/1.5 var(--font-text)', color: 'var(--fg-2)',
            }}>{T({
              hant: '一次規劃，多家供應商無縫整合 — 800+ 在地嚮導任你挑選。',
              hans: '一次规划，多家供应商无缝整合 — 800+ 当地向导任你挑选。',
              en:   '800+ verified local operators, one fluid itinerary, one checkout.',
            })}</p>

            <div style={{ display: 'flex', gap: 14, marginTop: 32, alignItems: 'center' }}>
              <button onClick={() => onSearch && onSearch()} style={{
                height: 54, padding: '0 28px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: 'var(--gradient-aurora)', color: '#062F2A',
                font: '700 15px/1 var(--font-text)',
                boxShadow: 'var(--shadow-glow-aurora)',
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}>
                {T({ hant: '開始規劃', hans: '开始规划', en: 'Start your itinerary' })}
                <Icon name="arrow-right" size={18} />
              </button>
              <button style={{
                height: 54, padding: '0 24px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(20px)',
                color: 'var(--fg-1)', font: '600 15px/1 var(--font-text)',
                boxShadow: 'var(--ring-glass)',
              }}>{T({ hant: '查看樣板行程', hans: '查看样板行程', en: 'Browse sample trips' })}</button>
            </div>

            <div style={{ display: 'flex', gap: 28, marginTop: 36 }}>
              {[
                { n: '800+',  l: { hant: '在地嚮導', hans: '当地向导', en: 'local operators' } },
                { n: '4.8 ★', l: { hant: '平均評分', hans: '平均评分', en: 'avg rating' } },
                { n: '24 h',  l: { hant: '免費取消', hans: '免费取消', en: 'free cancel' } },
              ].map(s => (
                <div key={s.n}>
                  <div style={{ font: '700 24px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>{s.n}</div>
                  <div style={{ font: '500 12px/1.3 var(--font-text)', color: 'var(--fg-3)', marginTop: 4 }}>{T(s.l)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Search panel — glass */}
          <div className="glass" style={{ padding: 24, borderRadius: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Icon name="map-pin" size={16} color="var(--coral)" />
              <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-2)' }}>
                {T({ hant: '為你的冰島旅程開個頭', hans: '为你的冰岛旅程开个头', en: 'Start designing your Iceland trip' })}
              </span>
            </div>

            <Field label={T({ hant: '出發城市', hans: '出发城市', en: 'Departure' })} icon="search">
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginTop: 10 }}>
              <Field label={T({ hant: '日期', hans: '日期', en: 'Dates' })} icon="calendar" focused>
                <input value={dates} onChange={(e) => setDates(e.target.value)} style={inputStyle} />
              </Field>
              <Field label={T({ hant: '旅人', hans: '旅客', en: 'Travelers' })} icon="users">
                <input value={people} onChange={(e) => { setPeople(e.target.value); setPeopleDirty(true); }} style={inputStyle} />
              </Field>
            </div>

            <button onClick={() => onSearch && onSearch()} style={{
              marginTop: 16, width: '100%', height: 52, borderRadius: 16, border: 0, cursor: 'pointer',
              background: 'var(--gradient-aurora)', color: '#062F2A',
              font: '700 15px/1 var(--font-text)',
              boxShadow: 'var(--shadow-glow-aurora)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Icon name="search" size={18} />
              {T({ hant: '搜尋 1,247 個體驗', hans: '搜索 1,247 个体验', en: 'Search 1,247 experiences' })}
            </button>

            <div style={{
              marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap',
              paddingTop: 14, borderTop: '1px solid rgba(20,30,60,0.08)',
            }}>
              <span style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', alignSelf: 'center', marginRight: 6 }}>
                {T({ hant: '熱門：', hans: '热门：', en: 'Popular:' })}
              </span>
              {(T({
                hant: ['極光', '黃金圈', '藍湖', '自駕'],
                hans: ['极光', '黄金圈', '蓝湖', '自驾'],
                en:   ['Aurora', 'Golden Circle', 'Blue Lagoon', 'Self-drive'],
              })).map(t => (
                <span key={t} style={{
                  font: '600 12px/1 var(--font-text)', color: 'var(--fg-1)',
                  padding: '6px 10px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.7)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)',
                }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const inputStyle = {
    flex: 1, border: 0, outline: 0, background: 'transparent',
    font: '600 15px/1 var(--font-text)', color: 'var(--fg-1)', minWidth: 0,
  };

  function Field({ label, icon, focused, children }) {
    const { Icon } = window.AuralisUI;
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ font: '600 11px/1 var(--font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{label}</span>
        <span style={{
          height: 48, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', borderRadius: 14,
          boxShadow: focused
            ? '0 0 0 2px var(--aurora-cyan), 0 0 0 5px rgba(0,213,255,0.22)'
            : 'inset 0 0 0 1px var(--base-200)',
        }}>
          <Icon name={icon} size={16} color="var(--fg-3)" />
          {children}
        </span>
      </label>
    );
  }

  window.AuralisUI.Hero = Hero;
})();
