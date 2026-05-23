/* Auralis top nav — sticky, glass-backed.
   Logo · primary nav · locale controls (language + display currency) · account · cart. */

(function () {
  const { useState, useEffect, useRef } = React;
  const { Icon, LANGS, DISPLAY_CURRENCIES, pick, currencyLabel, ThemePicker } = window.AuralisUI;

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

  const LOCALE_BTN = {
    height: 28,
    padding: '0 8px 0 9px',
    borderRadius: 999,
    border: 0,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    font: '700 11px/1 var(--font-text)',
    letterSpacing: '0.04em',
    color: 'var(--fg-1)',
    transition: 'background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
  };

  const LOCALE_MENU = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    zIndex: 60,
    width: 'max-content',
    minWidth: 0,
    padding: 4,
    borderRadius: 12,
    background: 'var(--surface-menu)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    boxShadow: 'var(--shadow-4), inset 0 0 0 1px var(--glass-border)',
  };

  const LOCALE_OPTION = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 8,
    border: 0,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    font: '700 11px/1 var(--font-text)',
    letterSpacing: '0.04em',
    transition: 'background var(--dur-fast) var(--ease-out)',
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

  function Nav({
    currentScreen, onNav, cartCount = 0, lang, onCycleLang,
    displayCurrency, onCurrencyChange, siteThemeId, onSiteThemeChange,
  }) {
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
          <MobileMenuSettings
            lang={lang}
            onLangChange={onCycleLang}
            displayCurrency={displayCurrency}
            onCurrencyChange={onCurrencyChange}
            siteThemeId={siteThemeId}
            onSiteThemeChange={onSiteThemeChange}
          />
        </nav>

        <div className="nav-actions">
          <div className="nav-toolbar-desktop">
            {onSiteThemeChange && (
              <ThemePicker
                themeId={siteThemeId || 'aurora'}
                onChange={onSiteThemeChange}
                lang={lang}
              />
            )}

            <LocaleControls
              lang={lang}
              onLangChange={onCycleLang}
              displayCurrency={displayCurrency}
              onCurrencyChange={onCurrencyChange}
            />
          </div>

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
                    color: 'var(--brand-on-gradient)',
                    display: 'flex', alignItems: 'center', gap: 8,
                    font: '700 13px/1 var(--font-text)',
                  }}>
            <Icon name="shopping-bag" size={16} />
            <span className="nav-cart-label">{cartCount} {T({ hant: '個', hans: '个', en: 'in trip' })}</span>
          </button>

          <button
            type="button"
            className="nav-menu-btn"
            aria-expanded={menuOpen}
            aria-label={T({ hant: '選單', hans: '菜单', en: 'Menu' })}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </header>
    );
  }

  function MobileMenuSettings({
    lang, onLangChange, displayCurrency, onCurrencyChange, siteThemeId, onSiteThemeChange,
  }) {
    const T = (opts) => pick(lang, opts);

    return (
      <div
        className="nav-mobile-settings"
        role="group"
        aria-label={T({ hant: '主題、語言與幣別', hans: '主题、语言与币别', en: 'Theme, language and currency' })}
      >
        <div className="nav-mobile-settings__bar">
          {onSiteThemeChange && (
            <ThemePicker
              themeId={siteThemeId || 'aurora'}
              onChange={onSiteThemeChange}
              lang={lang}
              className="theme-picker--compact"
            />
          )}
          <LangPicker lang={lang} onChange={onLangChange} layout="inline" />
          <CurrencyPicker
            lang={lang}
            value={displayCurrency}
            onChange={onCurrencyChange}
            layout="compact"
            inMobileSheet
          />
        </div>
      </div>
    );
  }

  function LocaleControls({ lang, onLangChange, displayCurrency, onCurrencyChange }) {
    const T = (opts) => pick(lang, opts);

    return (
      <div
        className="locale-strip"
        role="group"
        aria-label={T({ hant: '語言與幣別', hans: '语言与币别', en: 'Language and currency' })}
        style={LOCALE_STRIP}
      >
        <LangPicker lang={lang} onChange={onLangChange} />
        <span className="locale-divider" aria-hidden="true" />
        <CurrencyPicker
          lang={lang}
          value={displayCurrency}
          onChange={onCurrencyChange}
        />
      </div>
    );
  }

  function LangPicker({ lang, onChange, layout = 'compact' }) {
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

    const titles = {
      hant: { hant: '繁體中文', hans: '繁体中文', en: 'Traditional Chinese' },
      hans: { hant: '簡體中文', hans: '简体中文', en: 'Simplified Chinese' },
      en:   { hant: 'English',  hans: 'English',  en: 'English' },
    };
    const current = LANGS.find((l) => l.id === lang) || LANGS[0];

    if (layout === 'inline') {
      return (
        <div className="locale-inline" role="listbox" aria-label={T({ hant: '語言', hans: '语言', en: 'Language' })}>
          {LANGS.map((l) => {
            const selected = l.id === lang;
            return (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={pick(lang, titles[l.id])}
                title={pick(lang, titles[l.id])}
                className={`locale-inline__btn${selected ? ' is-active' : ''}`}
                onClick={() => onChange(l.id)}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div ref={rootRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={T({
            hant: `語言：${pick(lang, titles[current.id])}`,
            hans: `语言：${pick(lang, titles[current.id])}`,
            en: `Language: ${pick(lang, titles[current.id])}`,
          })}
          title={pick(lang, titles[current.id])}
          className="locale-picker-btn locale-lang-btn"
          style={{
            ...LOCALE_BTN,
            marginLeft: 2,
            background: open ? 'var(--base-0)' : 'transparent',
            boxShadow: open ? 'inset 0 0 0 1.5px var(--aurora-cyan)' : 'none',
          }}
        >
          <span>{current.label}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--fg-3)" />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={T({ hant: '選擇語言', hans: '选择语言', en: 'Choose language' })}
            className="locale-picker-menu locale-lang-menu"
            style={{ ...LOCALE_MENU, left: 0 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {LANGS.map((l) => {
                const selected = l.id === lang;
                const name = pick(lang, titles[l.id]);
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={name}
                    title={name}
                    onClick={() => {
                      onChange(l.id);
                      setOpen(false);
                    }}
                    style={{
                      ...LOCALE_OPTION,
                      color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
                      background: selected ? 'var(--gradient-aurora-soft)' : 'transparent',
                      boxShadow: selected ? 'inset 0 0 0 1px rgba(0,213,255,0.35)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--base-50)';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{l.label}</span>
                    {selected && <Icon name="check" size={12} color="var(--aurora-deep)" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function CurrencyPicker({ lang, value, onChange, layout = 'compact', inMobileSheet = false }) {
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

    const current = DISPLAY_CURRENCIES.find((c) => c.code === value) || DISPLAY_CURRENCIES[0];

    return (
      <div ref={rootRef} className={inMobileSheet ? 'locale-picker-root--sheet' : ''} style={{ position: 'relative' }}>
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
          className={`locale-picker-btn locale-currency-btn${inMobileSheet ? ' locale-currency-btn--sheet' : ''}`}
          style={{
            ...LOCALE_BTN,
            marginRight: inMobileSheet ? 0 : 2,
            background: open ? 'var(--base-0)' : 'transparent',
            boxShadow: open ? 'inset 0 0 0 1.5px var(--aurora-cyan)' : 'none',
          }}
        >
          <span>{current.code}</span>
          {!inMobileSheet && <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--fg-3)" />}
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={T({ hant: '選擇顯示幣別', hans: '选择显示币别', en: 'Choose display currency' })}
            className="locale-picker-menu locale-currency-menu"
            style={{ ...LOCALE_MENU, right: 0 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {DISPLAY_CURRENCIES.map((c) => {
                const selected = c.code === value;
                return (
                  <button
                    key={c.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-label={pick(lang, c.name)}
                    title={pick(lang, c.name)}
                    onClick={() => {
                      onChange(c.code);
                      setOpen(false);
                    }}
                    style={{
                      ...LOCALE_OPTION,
                      color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
                      background: selected ? 'var(--gradient-aurora-soft)' : 'transparent',
                      boxShadow: selected ? 'inset 0 0 0 1px rgba(0,213,255,0.35)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--base-50)';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>{c.code}</span>
                    {selected && <Icon name="check" size={12} color="var(--aurora-deep)" />}
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
