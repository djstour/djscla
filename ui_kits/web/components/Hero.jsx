/* Hero — full-bleed animated aurora backdrop + glass search panel.
   Used on the Discover screen. */

(function () {
  const { useMemo, useState, useRef } = React;
  const {
    Icon, pick, formatCatalogCount, TRIP_HUBS, HERO_POPULAR_CHIPS,
    normalizeTripSearch, todayIsoDate, DateRangePicker, formatTripSearchPax,
    HeroPaxPicker,
  } = window.AuralisUI;

  function heroDateLocale(lang) {
    return lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
  }

  function formatHeroDateFull(iso, lang) {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString(heroDateLocale(lang), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function Hero({
    onSearch,
    onPopularChip,
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
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [paxOpen, setPaxOpen] = useState(false);
    const datesAnchorRef = useRef(null);
    const paxAnchorRef = useRef(null);
    const singleHub = TRIP_HUBS.length <= 1;
    const hub = TRIP_HUBS[0] || null;
    const paxSummary = formatTripSearchPax(search, lang);
    const startDateLabel = formatHeroDateFull(search.startDate, lang);
    const endDateLabel = formatHeroDateFull(search.endDate, lang);
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

    const headlineGrad = T({
      hant: ['為你而轉的', '冰島旅程。'],
      hans: ['为你而转的', '冰岛旅程。'],
      en: ['The Iceland trip', 'that bends to you.'],
    });

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

    return (
      <section
        className={`hero-section ${theme.sectionClass}`}
        data-hero-theme={theme.id}
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
              {T({ hant: '冰島 · 即時庫存', hans: '冰岛 · 即时库存', en: 'Iceland · live inventory' })}
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
              margin: '20px 0 0', maxWidth: 480,
              font: '500 18px/1.5 var(--font-text)',
            }}>{T({
              hant: '透過 Bókun 即時串接在地供應商 — 一次規劃，多家體驗，一筆結帳。',
              hans: '通过 Bókun 实时串接当地供应商 — 一次规划，多家体验，一笔结账。',
              en: 'Live operator inventory via Bókun — plan once, book many, pay once.',
            })}</p>
          </div>

          <div
            className="glass hero-search-panel"
            style={{ padding: 24, borderRadius: 28 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !calendarOpen && !paxOpen) {
                e.preventDefault();
                submitSearch();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Icon name="map-pin" size={16} color="var(--coral)" />
              <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-2)' }}>
                {T({ hant: '為你的冰島旅程開個頭', hans: '为你的冰岛旅程开个头', en: 'Start designing your Iceland trip' })}
              </span>
            </div>

            {singleHub && hub ? (
              <p className="hero-hub-static">
                <Icon name="map-pin" size={14} color="var(--fg-3)" />
                {pick(lang, hub.label)}
              </p>
            ) : (
              <Field label={T({ hant: '主要出發地', hans: '主要出发地', en: 'Starting from' })} icon="map-pin">
                <select
                  className="hero-field__input hero-field__select hero-field__select--full"
                  value={search.hubId}
                  onChange={(e) => patch({ hubId: e.target.value })}
                  aria-label={T({ hant: '主要出發地', hans: '主要出发地', en: 'Starting from' })}
                >
                  {TRIP_HUBS.map((h) => (
                    <option key={h.id} value={h.id}>{pick(lang, h.label)}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="hero-search-dates" style={{ marginTop: 10 }}>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setPaxOpen(false);
                      setCalendarOpen((open) => !open);
                    }}
                  >
                    <span className="hero-field__date-range-part">{startDateLabel}</span>
                    <span className="hero-field__date-sep" aria-hidden="true">→</span>
                    <span className="hero-field__date-range-part">{endDateLabel}</span>
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

            <button type="button" onClick={submitSearch} style={{
              marginTop: 16, width: '100%', height: 52, borderRadius: 16, border: 0, cursor: 'pointer',
              background: 'var(--gradient-aurora)', color: 'var(--brand-on-gradient)',
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

            <div className="hero-search-divider" style={{
              marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap',
              paddingTop: 14, borderTop: '1px solid var(--border-subtle)',
            }}>
              <span style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', alignSelf: 'center', marginRight: 6 }}>
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
          </div>
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
