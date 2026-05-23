/* Auralis top nav — sticky, glass-backed.
   Logo · primary nav · locale controls (language + display currency) · account · cart. */

(function () {
  const { useState, useEffect, useRef } = React;
  const { Icon, LANGS, CURRENCIES, pick, currencyLabel } = window.AuralisUI;

  const LOCALE_STRIP = {
    display: 'inline-flex',
    alignItems: 'center',
    height: 32,
    padding: 2,
    borderRadius: 999,
    background: 'var(--base-100)',
    boxShadow: 'inset 0 0 0 1px var(--base-200)',
    flexShrink: 0,
  };

  const LANG_SHELL = {
    position: 'relative',
    display: 'inline-flex',
    height: 28,
    padding: 2,
    borderRadius: 999,
    alignItems: 'center',
  };

  function useClickOutside(ref, onClose, enabled) {
    useEffect(() => {
      if (!enabled) return undefined;
      function onPointerDown(e) {
        if (ref.current && !ref.current.contains(e.target)) onClose();
      }
      document.addEventListener('mousedown', onPointerDown);
      return () => document.removeEventListener('mousedown', onPointerDown);
    }, [enabled, onClose]);
  }

  function Nav({ currentScreen, onNav, cartCount = 0, lang, onCycleLang, displayCurrency, onCurrencyChange, fxDate }) {
    const T = (opts) => pick(lang, opts);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
      setMenuOpen(false);
    }, [currentScreen]);

    const navItems = [
      { id: 'home',    label: { hant: '探索',     hans: '探索',     en: 'Discover' } },
      { id: 'tours',   label: { hant: '行程',     hans: '行程',     en: 'Tours' } },
      { id: 'trip',    label: { hant: '我的旅程', hans: '我的旅程', en: 'My trip' } },
      { id: 'journal', label: { hant: '旅誌',     hans: '旅志',     en: 'Journal' } },
    ];

    const linkStyle = (active) => ({
      padding: '10px 14px',
      borderRadius: 999,
      font: '600 14px/1 var(--font-text)',
      color: active ? 'var(--fg-1)' : 'var(--fg-2)',
      background: active ? 'var(--base-100)' : 'transparent',
      textDecoration: 'none',
      transition: 'background var(--dur-fast) var(--ease-out)',
      display: 'block',
    });

    return (
      <header className="nav-header">
        <a href="#" className="nav-logo" onClick={(e) => { e.preventDefault(); onNav('home'); }}
           style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <img src="../../assets/logo-wordmark.svg" alt="Auralis · 極光旅" />
        </a>

        <button
          type="button"
          className="nav-menu-btn"
          aria-expanded={menuOpen}
          aria-label={T({ hant: '選單', hans: '菜单', en: 'Menu' })}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
        </button>

        <nav className="nav-links" aria-label={T({ hant: '主要導覽', hans: '主要导航', en: 'Main' })}>
          {navItems.map((item) => {
            const active = currentScreen === item.id;
            return (
              <a key={item.id} href="#" style={linkStyle(active)}
                 onClick={(e) => { e.preventDefault(); onNav(item.id); }}>
                {T(item.label)}
              </a>
            );
          })}
        </nav>

        <nav className={`nav-mobile-sheet${menuOpen ? ' is-open' : ''}`} aria-hidden={!menuOpen}>
          {navItems.map((item) => {
            const active = currentScreen === item.id;
            return (
              <a key={`m-${item.id}`} href="#" style={linkStyle(active)}
                 onClick={(e) => { e.preventDefault(); onNav(item.id); setMenuOpen(false); }}>
                {T(item.label)}
              </a>
            );
          })}
        </nav>

        <div className="nav-actions">
          <LocaleControls
            lang={lang}
            onLangChange={onCycleLang}
            displayCurrency={displayCurrency}
            onCurrencyChange={onCurrencyChange}
            fxDate={fxDate}
          />

          <button type="button" className="u-hide-sm" aria-label={T({ hant: '帳戶', hans: '账户', en: 'Account' })}
                  style={{
                    width: 40, height: 40, borderRadius: 999, border: 0, cursor: 'pointer',
                    background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--fg-1)',
                  }}>
            <Icon name="user" size={20} />
          </button>

          <button type="button" className="nav-cart-btn" onClick={() => onNav('checkout')}
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
            <span className="nav-cart-label">{cartCount} {T({ hant: '個', hans: '个', en: 'in trip' })}</span>
          </button>
        </div>
      </header>
    );
  }

  function LocaleControls({ lang, onLangChange, displayCurrency, onCurrencyChange, fxDate }) {
    const T = (opts) => pick(lang, opts);

    return (
      <div
        className="locale-strip"
        role="group"
        aria-label={T({ hant: '語言與幣別', hans: '语言与币别', en: 'Language and currency' })}
        style={LOCALE_STRIP}
      >
        <LangToggle lang={lang} onChange={onLangChange} />
        <span className="locale-divider" aria-hidden="true" />
        <CurrencyPicker
          lang={lang}
          value={displayCurrency}
          onChange={onCurrencyChange}
          fxDate={fxDate}
        />
      </div>
    );
  }

  function LangToggle({ lang, onChange }) {
    const activeIdx = Math.max(0, LANGS.findIndex((l) => l.id === lang));
    const titles = {
      hant: { hant: '繁體中文', hans: '繁体中文', en: 'Traditional Chinese' },
      hans: { hant: '簡體中文', hans: '简体中文', en: 'Simplified Chinese' },
      en:   { hant: 'English',  hans: 'English',  en: 'English' },
    };

    return (
      <div role="group" aria-label="Language" style={LANG_SHELL}>
        <span aria-hidden="true" style={{
          position: 'absolute',
          top: 2, bottom: 2,
          left: 2,
          width: 'calc((100% - 4px) / 3)',
          transform: `translateX(${activeIdx * 100}%)`,
          background: 'var(--gradient-aurora)',
          borderRadius: 999,
          boxShadow: '0 2px 8px rgba(0,213,255,0.28)',
          transition: 'transform var(--dur-base) var(--ease-out)',
          pointerEvents: 'none',
        }} />
        {LANGS.map((l) => {
          const active = lang === l.id;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onChange(l.id)}
              aria-pressed={active}
              aria-label={pick(lang, titles[l.id])}
              title={pick(lang, titles[l.id])}
              style={{
                position: 'relative',
                zIndex: 1,
                flex: 1,
                minWidth: 28,
                padding: '0 7px',
                height: 24,
                border: 0,
                background: 'transparent',
                cursor: 'pointer',
                font: '700 11px/1 var(--font-text)',
                color: active ? '#062F2A' : 'var(--fg-2)',
                letterSpacing: l.id === 'en' ? '0.03em' : 0,
                transition: 'color var(--dur-fast) var(--ease-out)',
              }}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    );
  }

  function CurrencyPicker({ lang, value, onChange, fxDate }) {
    const T = (opts) => pick(lang, opts);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useClickOutside(rootRef, () => setOpen(false), open);

    useEffect(() => {
      if (!open) return undefined;
      function onKey(e) {
        if (e.key === 'Escape') setOpen(false);
      }
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const current = CURRENCIES.find((c) => c.code === value) || CURRENCIES[0];
    const fxHint = fxDate
      ? T({
          hant: `匯率基準日 ${fxDate}（ECB 參考）`,
          hans: `汇率基准日 ${fxDate}（ECB 参考）`,
          en: `Rates as of ${fxDate} (ECB reference)`,
        })
      : T({ hant: '匯率載入中…', hans: '汇率加载中…', en: 'Loading exchange rates…' });

    return (
      <div ref={rootRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={T({
            hant: `顯示幣別：${currencyLabel(value, lang)}`,
            hans: `显示币别：${currencyLabel(value, lang)}`,
            en: `Display currency: ${currencyLabel(value, lang)}`,
          })}
          title={pick(lang, current.name)}
          className="locale-currency-btn"
          style={{
            height: 28,
            padding: '0 8px 0 9px',
            marginRight: 2,
            borderRadius: 999,
            border: 0,
            cursor: 'pointer',
            background: open ? 'rgba(255,255,255,0.95)' : 'transparent',
            boxShadow: open ? 'inset 0 0 0 1.5px var(--aurora-cyan)' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            font: '700 11px/1 var(--font-text)',
            letterSpacing: '0.04em',
            color: 'var(--fg-1)',
            transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
          }}
        >
          <span>{current.code}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--fg-3)" />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={T({ hant: '選擇顯示幣別', hans: '选择显示币别', en: 'Choose display currency' })}
            className="locale-currency-menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              zIndex: 60,
              width: 248,
              padding: 6,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(20px) saturate(1.2)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
              boxShadow: 'var(--shadow-4), inset 0 0 0 1px rgba(255,255,255,0.8)',
            }}
          >
            <div style={{
              padding: '6px 8px 8px',
              font: '500 10px/1.35 var(--font-text)',
              color: 'var(--fg-3)',
              borderBottom: '1px solid var(--base-200)',
              marginBottom: 2,
            }}>
              {fxHint}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 280, overflowY: 'auto' }}>
              {CURRENCIES.map((c) => {
                const selected = c.code === value;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      background: selected ? 'var(--gradient-aurora-soft)' : 'transparent',
                      boxShadow: selected ? 'inset 0 0 0 1px rgba(0,213,255,0.35)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'background var(--dur-fast) var(--ease-out)',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--base-50)';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                      <span style={{ font: '700 11px/1 var(--font-text)', color: 'var(--fg-3)', letterSpacing: '0.04em' }}>
                        {c.code}
                      </span>
                      <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)' }}>
                        {pick(lang, c.name)}
                      </span>
                    </span>
                    {selected && <Icon name="check" size={14} color="var(--aurora-deep)" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  window.AuralisUI.Nav = Nav;
})();
