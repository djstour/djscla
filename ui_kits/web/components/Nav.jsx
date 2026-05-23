/* Auralis top nav — sticky, glass-backed.
   Logo · primary nav · language toggle (繁 ↔ 简 ↔ EN) · account · cart. */

(function () {
  const { Icon, LANGS, CURRENCIES, pick } = window.AuralisUI;

  function Nav({ currentScreen, onNav, cartCount = 0, lang, onCycleLang, displayCurrency, onCurrencyChange, fxDate }) {
    const T = (opts) => pick(lang, opts);

    const navItems = [
      { id: 'home',    label: { hant: '探索',     hans: '探索',     en: 'Discover' } },
      { id: 'tours',   label: { hant: '行程',     hans: '行程',     en: 'Tours' } },
      { id: 'trip',    label: { hant: '我的旅程', hans: '我的旅程', en: 'My trip' } },
      { id: 'journal', label: { hant: '旅誌',     hans: '旅志',     en: 'Journal' } },
    ];

    return (
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, height: 72,
        display: 'flex', alignItems: 'center', gap: 24,
        padding: '0 32px',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        boxShadow: 'inset 0 -1px 0 rgba(20,30,60,0.08)',
      }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onNav('home'); }}
           style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="../../assets/logo-wordmark.svg" alt="Auralis · 極光旅" style={{ height: 36, width: 'auto' }} />
        </a>

        <nav style={{ display: 'flex', gap: 4, marginLeft: 24, flex: 1 }}>
          {navItems.map(item => {
            const active = currentScreen === item.id;
            return (
              <a key={item.id} href="#"
                 onClick={(e) => { e.preventDefault(); onNav(item.id); }}
                 style={{
                   padding: '8px 14px',
                   borderRadius: 999,
                   font: '600 14px/1 var(--font-text)',
                   color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                   background: active ? 'var(--base-100)' : 'transparent',
                   textDecoration: 'none',
                   transition: 'background var(--dur-fast) var(--ease-out)',
                 }}>
                {T(item.label)}
              </a>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CurrencySelect value={displayCurrency} onChange={onCurrencyChange} fxDate={fxDate} />
          <LangToggle lang={lang} onCycle={onCycleLang} />

          <button style={{
            width: 40, height: 40, borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--fg-1)',
          }}>
            <Icon name="user" size={20} />
          </button>

          <button onClick={() => onNav('checkout')}
                  style={{
                    height: 40, padding: '0 14px 0 12px', borderRadius: 999,
                    border: 0, cursor: 'pointer',
                    background: 'var(--gradient-aurora)',
                    boxShadow: 'var(--shadow-glow-aurora)',
                    color: '#062F2A',
                    display: 'flex', alignItems: 'center', gap: 8,
                    font: '700 13px/1 var(--font-text)',
                  }}>
            <Icon name="shopping-bag" size={16} />
            <span>{cartCount} {T({ hant: '個', hans: '个', en: 'in trip' })}</span>
          </button>
        </div>
      </header>
    );
  }

  // Three-way pill: 繁 / 简 / EN. Clicking a segment selects it; the active
  // one rides a gradient capsule that slides between positions.
  function LangToggle({ lang, onCycle }) {
    const activeIdx = Math.max(0, LANGS.findIndex(l => l.id === lang));
    return (
      <div role="group" aria-label="Language"
           style={{
             position: 'relative',
             display: 'inline-flex',
             height: 36,
             padding: 3,
             borderRadius: 999,
             background: 'var(--base-100)',
             boxShadow: 'inset 0 0 0 1px var(--base-200)',
             alignItems: 'center',
           }}>
        {/* Sliding active capsule */}
        <span aria-hidden="true" style={{
          position: 'absolute',
          top: 3, bottom: 3,
          left: 3,
          width: 'calc((100% - 6px) / 3)',
          transform: `translateX(${activeIdx * 100}%)`,
          background: 'var(--gradient-aurora)',
          borderRadius: 999,
          boxShadow: '0 4px 12px rgba(0,213,255,0.35)',
          transition: 'transform var(--dur-base) var(--ease-out)',
        }}/>
        {LANGS.map((l) => {
          const active = lang === l.id;
          return (
            <button key={l.id}
                    onClick={() => onCycle(l.id)}
                    aria-pressed={active}
                    title={l.htmlLang}
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      flex: 1, minWidth: 36,
                      padding: '0 10px',
                      height: 30,
                      border: 0, background: 'transparent', cursor: 'pointer',
                      font: '700 13px/1 var(--font-text)',
                      color: active ? '#062F2A' : 'var(--fg-2)',
                      letterSpacing: l.id === 'en' ? '0.04em' : 0,
                      transition: 'color var(--dur-fast) var(--ease-out)',
                    }}>
              {l.label}
            </button>
          );
        })}
      </div>
    );
  }

  function CurrencySelect({ value, onChange, fxDate }) {
    return (
      <label style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Display currency"
          title={fxDate ? `FX as of ${fxDate} (Frankfurter / ECB)` : 'Loading exchange rates…'}
          style={{
            height: 36,
            padding: '0 10px',
            borderRadius: 999,
            border: 0,
            background: 'var(--base-100)',
            boxShadow: 'inset 0 0 0 1px var(--base-200)',
            font: '600 12px/1 var(--font-text)',
            color: 'var(--fg-1)',
            cursor: 'pointer',
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </label>
    );
  }

  window.AuralisUI.Nav = Nav;
})();
