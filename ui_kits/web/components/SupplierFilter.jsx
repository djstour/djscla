/* SupplierFilter — left rail on the Tours screen. */

(function () {
  const { useMemo } = React;
  const {
    Icon, CATEGORIES, ROUTES, FACETS, getSupplierOptions, formatDisplayPrice, pick,
  } = window.AuralisUI;

  function FilterChip({ active, onClick, children, compact }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`filter-chip${active ? ' is-active' : ''}${compact ? ' filter-chip--compact' : ''}`}
      >
        {children}
      </button>
    );
  }

  function SupplierFilter({
    activities = [],
    activeSupplier,
    onSupplier,
    activeCats,
    onToggleCat,
    activeRoutes = [],
    onToggleRoute,
    activeFacets = [],
    onToggleFacet,
    lang = 'hant',
    displayCurrency = 'USD',
    fxRates = { USD: 1 },
  }) {
    const T = (opts) => pick(lang, opts);
    const supplierOptions = getSupplierOptions(lang, activities);

    const priceRange = useMemo(() => {
      const prices = activities
        .map((a) => Number(a.priceUsd ?? a.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!prices.length) return null;
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [activities]);

    return (
      <aside className="supplier-filter">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, font: '600 18px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
            {T({ hant: '篩選', hans: '筛选', en: 'Filters' })}
          </h3>
        </div>

        <Section title={T({ hant: '體驗類型', hans: '体验类型', en: 'Experience' })}>
          <div className="filter-chip-list filter-chip-list--stack">
            {CATEGORIES.map((c) => {
              const active = activeCats.includes(c.id);
              return (
                <FilterChip key={c.id} active={active} onClick={() => onToggleCat(c.id)}>
                  <Icon name={c.icon} size={16} />
                  <span>{pick(lang, c.label)}</span>
                  {active && <Icon name="check" size={14} />}
                </FilterChip>
              );
            })}
          </div>
        </Section>

        <Section title={T({ hant: '經典路線', hans: '经典路线', en: 'Routes' })}>
          <div className="filter-chip-list">
            {ROUTES.map((r) => {
              const active = activeRoutes.includes(r.id);
              return (
                <FilterChip key={r.id} active={active} compact onClick={() => onToggleRoute(r.id)}>
                  {pick(lang, r.label)}
                </FilterChip>
              );
            })}
          </div>
        </Section>

        <Section title={T({ hant: '進階', hans: '进阶', en: 'More' })}>
          <div className="filter-chip-list">
            {FACETS.map((f) => {
              const active = activeFacets.includes(f.id);
              return (
                <FilterChip key={f.id} active={active} compact onClick={() => onToggleFacet(f.id)}>
                  {pick(lang, f.label)}
                </FilterChip>
              );
            })}
          </div>
        </Section>

        <Section title={T({ hant: '供應商', hans: '供应商', en: 'Supplier' })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {supplierOptions.length <= 1 ? (
              <p style={{ margin: 0, font: '500 12px/1.5 var(--font-text)', color: 'var(--fg-3)' }}>
                {T({ hant: '載入目錄後顯示供應商', hans: '加载目录后显示供应商', en: 'Suppliers appear after catalog loads' })}
              </p>
            ) : (
              supplierOptions.map((s) => {
                const active = activeSupplier === s.id;
                return (
                  <button key={String(s.id)} type="button" onClick={() => onSupplier(s.id)}
                          style={{
                            height: 36, padding: '0 12px',
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: active ? 'var(--base-100)' : 'transparent',
                            border: 0, borderRadius: 10, cursor: 'pointer',
                            color: active ? 'var(--fg-1)' : 'var(--fg-2)',
                            font: active ? '700 13px/1 var(--font-text)' : '500 13px/1 var(--font-text)',
                            textAlign: 'left',
                          }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 4,
                      border: '1.5px solid ' + (active ? 'var(--aurora-deep)' : 'var(--base-300)'),
                      background: active ? 'var(--aurora-cyan)' : 'transparent',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>{active && <Icon name="check" size={11} color="#fff" />}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </Section>

        {priceRange && (
          <Section title={T({ hant: '價格範圍（目錄）', hans: '价格范围（目录）', en: 'Price range (catalog)' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)' }}>
              <span>{formatDisplayPrice(priceRange.min, displayCurrency, fxRates)}</span>
              <span>{formatDisplayPrice(priceRange.max, displayCurrency, fxRates)}</span>
            </div>
          </Section>
        )}
      </aside>
    );
  }

  function Section({ title, subtitle, children }) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <h4 style={{ margin: 0, font: '600 12px/1 var(--font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
            {title}
          </h4>
          {subtitle && <span style={{ font: '500 10px/1 var(--font-text)', color: 'var(--fg-4)' }}>{subtitle}</span>}
        </div>
        {children}
      </div>
    );
  }

  window.AuralisUI.SupplierFilter = SupplierFilter;
})();
