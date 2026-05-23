/* Hero — full-bleed animated aurora backdrop + glass search panel.
   Used on the Discover screen. */

(function () {
  const { useState } = React;
  const { Icon, pick, formatCatalogCount } = window.AuralisUI;

  function Hero({ onSearch, lang, catalogTotal = 0 }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);

    const [city, setCity] = useState('');
    const [dates, setDates] = useState('');
    const [people, setPeople] = useState('');

    const headlineGrad = T({
      hant: ['為你而轉的', '冰島旅程。'],
      hans: ['为你而转的', '冰岛旅程。'],
      en:   ['The Iceland trip', 'that bends to you.'],
    });

    const datePlaceholder = T({ hant: '選擇日期', hans: '选择日期', en: 'Select dates' });
    const peoplePlaceholder = T({ hant: '旅人數', hans: '旅客数', en: 'Travelers' });
    const cityPlaceholder = T({ hant: '雷克雅維克 (KEF)', hans: '雷克雅未克 (KEF)', en: 'Reykjavík (KEF)' });

    return (
      <section className="hero-section bg-aurora-animated">
        <svg viewBox="0 0 1440 640" preserveAspectRatio="none"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.6 }}>
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={Math.random() * 1440} cy={Math.random() * 400} r={Math.random() * 1.6 + 0.4}
                    fill="#fff" opacity={0.3 + Math.random() * 0.5}/>
          ))}
        </svg>

        <div className="hero-inner">
          <div>
            <span className="overline" style={{ color: 'var(--coral)' }}>
              {T({ hant: '冰島 · 即時庫存', hans: '冰岛 · 即时库存', en: 'Iceland · live inventory' })}
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
              hant: '透過 Bókun 即時串接在地供應商 — 一次規劃，多家體驗，一筆結帳。',
              hans: '通过 Bókun 实时串接当地供应商 — 一次规划，多家体验，一笔结账。',
              en:   'Live operator inventory via Bókun — plan once, book many, pay once.',
            })}</p>

            <div style={{ display: 'flex', gap: 14, marginTop: 32, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onSearch && onSearch()} style={{
                height: 54, padding: '0 28px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: 'var(--gradient-aurora)', color: '#062F2A',
                font: '700 15px/1 var(--font-text)',
                boxShadow: 'var(--shadow-glow-aurora)',
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}>
                {T({ hant: '開始規劃', hans: '开始规划', en: 'Start your itinerary' })}
                <Icon name="arrow-right" size={18} />
              </button>
            </div>
          </div>

          <div className="glass" style={{ padding: 24, borderRadius: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Icon name="map-pin" size={16} color="var(--coral)" />
              <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-2)' }}>
                {T({ hant: '為你的冰島旅程開個頭', hans: '为你的冰岛旅程开个头', en: 'Start designing your Iceland trip' })}
              </span>
            </div>

            <Field label={T({ hant: '出發城市', hans: '出发城市', en: 'Departure' })} icon="search">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={cityPlaceholder} style={inputStyle} />
            </Field>
            <div className="hero-search-dates" style={{ marginTop: 10 }}>
              <Field label={T({ hant: '日期', hans: '日期', en: 'Dates' })} icon="calendar" focused>
                <input value={dates} onChange={(e) => setDates(e.target.value)} placeholder={datePlaceholder} style={inputStyle} />
              </Field>
              <Field label={T({ hant: '旅人', hans: '旅客', en: 'Travelers' })} icon="users">
                <input value={people} onChange={(e) => setPeople(e.target.value)} placeholder={peoplePlaceholder} style={inputStyle} />
              </Field>
            </div>

            <button type="button" onClick={() => onSearch && onSearch()} style={{
              marginTop: 16, width: '100%', height: 52, borderRadius: 16, border: 0, cursor: 'pointer',
              background: 'var(--gradient-aurora)', color: '#062F2A',
              font: '700 15px/1 var(--font-text)',
              boxShadow: 'var(--shadow-glow-aurora)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Icon name="search" size={18} />
              {T({
                hant: `搜尋 ${countLabel} 個體驗`,
                hans: `搜索 ${countLabel} 个体验`,
                en: `Search ${countLabel} experiences`,
              })}
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
