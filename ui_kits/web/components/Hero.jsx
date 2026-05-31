/* Hero — full-bleed animated aurora backdrop + glass search panel.
   Used on the Discover screen. */

(function () {
  const { useMemo, useState, useRef, useEffect } = React;
  const {
    Icon, pick, formatCatalogCount, TRIP_HUBS, HERO_POPULAR_CHIPS,
    normalizeTripSearch, todayIsoDate, DateRangePicker, formatTripSearchPax,
    HeroPaxPicker, TripPlaybookPicker,
  } = window.AuralisUI;

  const HERO_MODE_KEY = 'auralis.heroMode';

  function loadHeroMode() {
    try {
      const saved = sessionStorage.getItem(HERO_MODE_KEY);
      return saved === 'planner' ? 'planner' : 'quick';
    } catch (_) {
      return 'quick';
    }
  }

  function heroDateLocale(lang) {
    return lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
  }

  function formatHeroDateShort(iso, lang) {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString(heroDateLocale(lang), {
      day: 'numeric',
      month: 'short',
    });
  }

  function formatHeroDateFull(iso, lang) {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString(heroDateLocale(lang), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function tripNightCount(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(`${startDate}T12:00:00`).getTime();
    const end = new Date(`${endDate}T12:00:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  function formatTripNightsLabel(nights, lang) {
    if (nights <= 0) {
      return pick(lang, { hant: '當日', hans: '当日', en: 'Same day' });
    }
    return pick(lang, {
      hant: `${nights} 晚`,
      hans: `${nights} 晚`,
      en: `${nights} night${nights === 1 ? '' : 's'}`,
    });
  }

  function Hero({
    onSearch,
    onBrowseAll,
    onSelectPlaybook,
    onPopularChip,
    onOpenSearch,
    onQuickSearch,
    tripSearch,
    onTripSearchChange,
    lang,
    catalogTotal = 0,
    theme,
  }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);
    if (!theme) return null;

    const search = normalizeTripSearch(tripSearch);
    const minDate = todayIsoDate();
    const [heroMode, setHeroMode] = useState(loadHeroMode);
    const [quickQuery, setQuickQuery] = useState('');
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [paxOpen, setPaxOpen] = useState(false);
    const datesAnchorRef = useRef(null);
    const paxAnchorRef = useRef(null);
    const singleHub = TRIP_HUBS.length <= 1;
    const hub = TRIP_HUBS.find((h) => h.id === search.hubId) || TRIP_HUBS[0] || null;
    const paxSummary = formatTripSearchPax(search, lang);
    const startDateShort = formatHeroDateShort(search.startDate, lang);
    const endDateShort = formatHeroDateShort(search.endDate, lang);
    const tripNights = tripNightCount(search.startDate, search.endDate);
    const tripNightsLabel = formatTripNightsLabel(tripNights, lang);
    const dateRangeAria = `${formatHeroDateFull(search.startDate, lang)} – ${formatHeroDateFull(search.endDate, lang)}, ${tripNightsLabel}`;
    const popularLabels = T({
      hant: ['極光', '黃金圈', '藍湖', '自駕'],
      hans: ['极光', '黄金圈', '蓝湖', '自驾'],
      en: ['Aurora', 'Golden Circle', 'Blue Lagoon', 'Self-drive'],
    });

    const stars = useMemo(
      () => Array.from({ length: 40 }, (_, i) => ({
        id: i,
        cx: Math.random() * 1440,
        cy: Math.random() * 400,
        r: Math.random() * 1.6 + 0.4,
        opacity: 0.3 + Math.random() * 0.5,
      })),
      [],
    );

    const headlineGrad = heroMode === 'quick'
      ? T({
        hant: ['探索並預訂', '你的冰島體驗。'],
        hans: ['探索并预订', '你的冰岛体验。'],
        en: ['Discover & book', 'things to do in Iceland.'],
      })
      : T({
        hant: ['為你而轉的', '冰島旅程。'],
        hans: ['为你而转的', '冰岛旅程。'],
        en: ['The Iceland trip', 'that bends to you.'],
      });

    const leadCopy = heroMode === 'quick'
      ? T({
        hant: `${countLabel !== '—' ? `${countLabel} 個即時行程 · ` : ''}中文客服 · 可自由組合多日行程`,
        hans: `${countLabel !== '—' ? `${countLabel} 个即时行程 · ` : ''}中文客服 · 可自由组合多日行程`,
        en: `${countLabel !== '—' ? `${countLabel} live tours · ` : ''}Mandarin support · mix multi-day plans`,
      })
      : T({
        hant: '在地供應商即時串接 — 先排行程，再逐項確認空位與價格。',
        hans: '当地供应商实时串接 — 先排行程，再逐项确认空位与价格。',
        en: 'Live operator inventory — plan your days first, then confirm each booking.',
      });

    useEffect(() => {
      try { sessionStorage.setItem(HERO_MODE_KEY, heroMode); } catch (_) { /* ignore */ }
    }, [heroMode]);

    function patch(partial) {
      onTripSearchChange(normalizeTripSearch({ ...search, ...partial }));
    }

    function handleDateRangeChange({ startDate, endDate }) {
      patch({ startDate, endDate });
    }

    function handlePaxChange({ adults, children }) {
      patch({ adults, children });
    }

    function submitSearch() {
      if (onSearch) onSearch(search);
    }

    function submitQuickSearch(e) {
      if (e) e.preventDefault();
      const q = quickQuery.trim();
      if (q && onQuickSearch) {
        onQuickSearch(q);
        return;
      }
      if (onBrowseAll) onBrowseAll(search);
      else if (onSearch) onSearch(search);
    }

    function renderPopularChips() {
      return (
        <div className="hero-search-divider hero-search-divider--chips">
          <span className="hero-search-divider__label">
            {T({ hant: '熱門：', hans: '热门：', en: 'Popular:' })}
          </span>
          {HERO_POPULAR_CHIPS.map((chip, i) => (
            <button
              key={popularLabels[i]}
              type="button"
              className="hero-popular-chip"
              onClick={() => onPopularChip && onPopularChip(search, chip)}
            >
              {popularLabels[i]}
            </button>
          ))}
        </div>
      );
    }

    function renderQuickPanel() {
      return (
        <div className="glass hero-search-panel hero-search-panel--quick">
          <form className="hero-quick-search" onSubmit={submitQuickSearch}>
            <label className="hero-quick-search__field">
              <Icon name="search" size={18} color="var(--fg-3)" />
              <input
                type="search"
                value={quickQuery}
                onChange={(e) => setQuickQuery(e.target.value)}
                placeholder={T({
                  hant: '搜尋行程、地點或主題…',
                  hans: '搜索行程、地点或主题…',
                  en: 'Search tours, places, or themes…',
                })}
                enterKeyHint="search"
              />
              {onOpenSearch && (
                <button
                  type="button"
                  className="hero-quick-search__kbd"
                  onClick={onOpenSearch}
                  aria-label={T({ hant: '開啟快速搜尋', hans: '开启快速搜索', en: 'Open quick search' })}
                >
                  ⌘K
                </button>
              )}
            </label>
            <button type="submit" className="hero-quick-search__submit">
              {T({ hant: '搜尋', hans: '搜索', en: 'Search' })}
            </button>
          </form>

          <button
            type="button"
            className="hero-mode-toggle"
            onClick={() => setHeroMode('planner')}
          >
            {T({ hant: '建立多日行程表', hans: '建立多日行程表', en: 'Build a multi-day itinerary' })}
            <Icon name="arrow-right" size={16} />
          </button>

          {renderPopularChips()}
        </div>
      );
    }

    function renderPlannerPanel() {
      return (
        <div
          className="glass hero-search-panel hero-search-panel--planner"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !calendarOpen && !paxOpen) {
              e.preventDefault();
              submitSearch();
            }
          }}
        >
          <button
            type="button"
            className="hero-mode-toggle hero-mode-toggle--back"
            onClick={() => setHeroMode('quick')}
          >
            <Icon name="arrow-left" size={16} />
            {T({ hant: '返回快速搜尋', hans: '返回快速搜索', en: 'Back to quick search' })}
          </button>

          <div className="hero-planner-head">
            <Icon name="calendar-range" size={16} color="var(--coral)" />
            <span>{T({ hant: '建立你的冰島行程表', hans: '建立你的冰岛行程表', en: 'Build your Iceland itinerary' })}</span>
          </div>

          {singleHub && hub ? (
            <p className="hero-hub-static">
              <Icon name="map-pin" size={14} color="var(--fg-3)" />
              {pick(lang, hub.label)}
            </p>
          ) : (
            <div
              className="hero-hub-chips"
              role="group"
              aria-label={T({ hant: '主要出發地', hans: '主要出发地', en: 'Starting from' })}
            >
              {TRIP_HUBS.map((h) => {
                const active = search.hubId === h.id;
                const chipText = pick(lang, h.chipLabel || h.label);
                return (
                  <button
                    key={h.id}
                    type="button"
                    className={`hero-hub-chip${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => patch({ hubId: h.id })}
                  >
                    {chipText}
                  </button>
                );
              })}
            </div>
          )}

          <div className="hero-search-primary">
            <div className="hero-search-dates">
              <Field
                label={T({ hant: '日期', hans: '日期', en: 'Dates' })}
                focused={calendarOpen}
                controlClass="hero-field__control--dates"
              >
                <div className="hero-field__dates-wrap" ref={datesAnchorRef}>
                  <button
                    type="button"
                    className="hero-field__date-range-trigger"
                    aria-expanded={calendarOpen}
                    aria-label={dateRangeAria}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaxOpen(false);
                      setCalendarOpen((open) => !open);
                    }}
                  >
                    <span className="hero-field__date-range-compact">
                      <span className="hero-field__date-range-part">{startDateShort}</span>
                      <span className="hero-field__date-sep" aria-hidden="true">→</span>
                      <span className="hero-field__date-range-part">{endDateShort}</span>
                    </span>
                    <span className="hero-field__date-nights">{tripNightsLabel}</span>
                  </button>
                  <DateRangePicker
                    open={calendarOpen}
                    anchorRef={datesAnchorRef}
                    startDate={search.startDate}
                    endDate={search.endDate}
                    minDate={minDate}
                    onChange={handleDateRangeChange}
                    onClose={() => setCalendarOpen(false)}
                    lang={lang}
                  />
                </div>
              </Field>

              <Field
                label={T({ hant: '旅人', hans: '旅客', en: 'Travelers' })}
                icon="users"
                focused={paxOpen}
                controlClass="hero-field__control--pax-trigger"
              >
                <div className="hero-field__pax-trigger-wrap" ref={paxAnchorRef}>
                  <button
                    type="button"
                    className="hero-field__pax-trigger"
                    aria-expanded={paxOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCalendarOpen(false);
                      setPaxOpen((open) => !open);
                    }}
                  >
                    {paxSummary}
                  </button>
                  <HeroPaxPicker
                    open={paxOpen}
                    anchorRef={paxAnchorRef}
                    adults={search.adults}
                    children={search.children}
                    onChange={handlePaxChange}
                    onClose={() => setPaxOpen(false)}
                    lang={lang}
                  />
                </div>
              </Field>
            </div>
          </div>

          <TripPlaybookPicker
            tripSearch={search}
            lang={lang}
            onBrowseAll={() => {
              if (onBrowseAll) onBrowseAll(search);
              else if (onSearch) onSearch(search);
            }}
            onSelectPlaybook={(playbook) => {
              if (onSelectPlaybook) onSelectPlaybook(search, playbook);
            }}
          />

          {renderPopularChips()}
        </div>
      );
    }

    return (
      <section
        className={`hero-section ${theme.sectionClass}`}
        data-hero-theme={theme.id}
        data-hero-mode={heroMode}
        style={{
          background: theme.heroBackground,
          backgroundSize: '220% 220%',
        }}
      >
        <svg viewBox="0 0 1440 640" preserveAspectRatio="none"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.6 }}
             aria-hidden="true">
          {stars.map((s) => (
            <circle key={s.id} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.opacity} />
          ))}
        </svg>

        <div className="hero-inner">
          <div>
            <span className="hero-overline overline">
              {T({
                hant: heroMode === 'quick' ? '冰島 · 探索預訂' : '冰島 · 行程編排',
                hans: heroMode === 'quick' ? '冰岛 · 探索预订' : '冰岛 · 行程编排',
                en: heroMode === 'quick' ? 'Iceland · discover & book' : 'Iceland · trip planning',
              })}
            </span>
            <h1 className="hero-headline" style={{
              margin: '14px 0 0',
              font: '700 var(--t-display-1)/0.98 var(--font-display)',
              letterSpacing: '-0.03em',
              textWrap: 'balance',
            }}>
              <span className="hero-headline__line">{headlineGrad[0]}</span><br />
              <span className="hero-headline__line hero-headline__line--accent">{headlineGrad[1]}</span>
            </h1>
            <p className="hero-lead" style={{
              margin: '20px 0 0', maxWidth: 520,
              font: '500 18px/1.5 var(--font-text)',
            }}>{leadCopy}</p>
          </div>

          {heroMode === 'quick' ? renderQuickPanel() : renderPlannerPanel()}
        </div>
      </section>
    );
  }

  function Field({ label, icon, focused, controlClass = '', children }) {
    const { Icon } = window.AuralisUI;
    const isPaxTrigger = controlClass.includes('pax-trigger');
    const isDates = controlClass.includes('dates');
    return (
      <div className="hero-field" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ font: '600 11px/1 var(--font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{label}</span>
        <span
          className={`hero-field__control${controlClass ? ` ${controlClass}` : ''}`}
          style={{
            height: isPaxTrigger ? 48 : (isDates ? 48 : 48),
            minHeight: 48,
            padding: icon ? '0 12px' : '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--surface-field)',
            borderRadius: 14,
            boxShadow: focused
              ? '0 0 0 2px var(--aurora-cyan), 0 0 0 5px rgba(0,213,255,0.22)'
              : 'inset 0 0 0 1px var(--border-field)',
            ...(isDates || isPaxTrigger ? { position: 'relative', overflow: 'visible' } : {}),
          }}
        >
          {icon ? <Icon name={icon} size={16} color="var(--fg-3)" className="hero-field__icon" /> : null}
          {children}
        </span>
      </div>
    );
  }

  window.AuralisUI.Hero = Hero;
})();
