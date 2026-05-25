/* Hero — full-bleed animated aurora backdrop + glass search panel.
   Used on the Discover screen. */

(function () {
  const { useMemo, useState, useRef } = React;
  const {
    Icon, pick, formatCatalogCount, TRIP_HUBS, HERO_POPULAR_CHIPS, TRIP_PAX_LIMITS,
    normalizeTripSearch, todayIsoDate, DateRangePicker,
  } = window.AuralisUI;

  function rangeArr(start, end) {
    const out = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }

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
    const datesAnchorRef = useRef(null);
    const adultLabel = T({ hant: '成人', hans: '成人', en: 'Adult' });
    const childLabel = T({ hant: '孩童', hans: '孩童', en: 'Children' });
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

            <div style={{ display: 'flex', gap: 14, marginTop: 32, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onSearch && onSearch(search)} style={{
                height: 54, padding: '0 28px', borderRadius: 999, border: 0, cursor: 'pointer',
                background: 'var(--gradient-aurora)', color: 'var(--brand-on-gradient)',
                font: '700 15px/1 var(--font-text)',
                boxShadow: 'var(--shadow-glow-aurora)',
                display: 'inline-flex', alignItems: 'center', gap: 10,
              }}>
                {T({ hant: '開始規劃', hans: '开始规划', en: 'Start your itinerary' })}
                <Icon name="arrow-right" size={18} />
              </button>
            </div>
          </div>

          <div className="glass hero-search-panel" style={{ padding: 24, borderRadius: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Icon name="map-pin" size={16} color="var(--coral)" />
              <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-2)' }}>
                {T({ hant: '為你的冰島旅程開個頭', hans: '为你的冰岛旅程开个头', en: 'Start designing your Iceland trip' })}
              </span>
            </div>

            <Field label={T({ hant: '主要出發地', hans: '主要出发地', en: 'Starting from' })} icon="map-pin">
              <select
                className="hero-field__input hero-field__select hero-field__select--full"
                value={search.hubId}
                onChange={(e) => patch({ hubId: e.target.value })}
                aria-label={T({ hant: '主要出發地', hans: '主要出发地', en: 'Starting from' })}
              >
                {TRIP_HUBS.map((hub) => (
                  <option key={hub.id} value={hub.id}>{pick(lang, hub.label)}</option>
                ))}
              </select>
            </Field>

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
                controlClass="hero-field__control--pax"
              >
                <div className="hero-field__pax">
                  <div className="hero-field__pax-row">
                    <span className="hero-field__pax-label">{adultLabel}</span>
                    <select
                      className="hero-field__input hero-field__select hero-field__select--num"
                      value={search.adults}
                      onChange={(e) => patch({ adults: Number(e.target.value) })}
                      aria-label={adultLabel}
                    >
                      {rangeArr(TRIP_PAX_LIMITS.adultMin, TRIP_PAX_LIMITS.adultMax).map((n) => {
                        const disabled = n + search.children > TRIP_PAX_LIMITS.totalMax;
                        return (
                          <option key={n} value={n} disabled={disabled}>{n}</option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="hero-field__pax-row">
                    <span className="hero-field__pax-label">{childLabel}</span>
                    <select
                      className="hero-field__input hero-field__select hero-field__select--num"
                      value={search.children}
                      onChange={(e) => patch({ children: Number(e.target.value) })}
                      aria-label={childLabel}
                    >
                      {rangeArr(TRIP_PAX_LIMITS.childMin, TRIP_PAX_LIMITS.childMax).map((n) => {
                        const disabled = search.adults + n > TRIP_PAX_LIMITS.totalMax;
                        return (
                          <option key={n} value={n} disabled={disabled}>{n}</option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              </Field>
            </div>

            <button type="button" onClick={() => onSearch && onSearch(search)} style={{
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
    const isPax = controlClass.includes('pax');
    const isDates = controlClass.includes('dates');
    return (
      <div className="hero-field" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ font: '600 11px/1 var(--font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{label}</span>
        <span
          className={`hero-field__control${controlClass ? ` ${controlClass}` : ''}`}
          style={{
            height: isPax ? 'auto' : 48,
            minHeight: 48,
            padding: icon ? '0 12px' : '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: isPax ? 8 : 10,
            background: 'var(--surface-field)',
            borderRadius: 14,
            boxShadow: focused
              ? '0 0 0 2px var(--aurora-cyan), 0 0 0 5px rgba(0,213,255,0.22)'
              : 'inset 0 0 0 1px var(--border-field)',
            ...(isDates ? { position: 'relative', overflow: 'visible' } : {}),
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
