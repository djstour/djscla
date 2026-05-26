/* SupplierFilter — left rail on the Tours screen; SupplierStrip — vendor pills above results. */

(function () {
  const { useMemo, useState, useCallback } = React;
  const {
    Icon, CATEGORIES, ROUTES, FACETS, getSupplierOptions, formatDisplayPrice, pick, vendorIdsMatch,
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

  /** Horizontal supplier pills (vendor-first; scales to ~6 before wrapping). */
  function SupplierStrip({
    activities = [],
    activeSupplier,
    onSupplier,
    lang = 'hant',
    layout = 'inline',
    vendorContractCounts = null,
    vendors = null,
  }) {
    const T = (opts) => pick(lang, opts);
    const options = useMemo(
      () => getSupplierOptions(lang, activities, { vendorContractCounts, vendors }),
      [lang, activities, vendorContractCounts, vendors],
    );

    if (options.length <= 1) {
      return (
        <p className="supplier-strip__empty">
          {T({ hant: '載入目錄後顯示供應商', hans: '加载目录后显示供应商', en: 'Suppliers appear after catalog loads' })}
        </p>
      );
    }

    return (
      <div
        className={`supplier-strip${layout === 'sidebar' ? ' supplier-strip--sidebar' : ''}`}
        role="listbox"
        aria-label={T({ hant: '供應商', hans: '供应商', en: 'Supplier' })}
      >
        {options.map((s) => {
          const active = s.id === 'all'
            ? activeSupplier === 'all'
            : vendorIdsMatch(activeSupplier, s.id);
          return (
            <button
              key={String(s.id)}
              type="button"
              role="option"
              aria-selected={active}
              className={`supplier-pill${active ? ' is-active' : ''}`}
              onClick={() => onSupplier(s.id)}
            >
              <span className="supplier-pill__label">{s.label}</span>
              {Number.isFinite(s.count) && s.count > 0 && (
                <span className="supplier-pill__count" aria-hidden="true">{s.count}</span>
              )}
            </button>
          );
        })}
      </div>
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
    vendorContractCounts = null,
    vendors = null,
  }) {
    const T = (opts) => pick(lang, opts);

    // Mobile accordion: track which sections are open
    const [openSections, setOpenSections] = useState({
      supplier: true,
      category: true,
      routes: false,
      more: false,
      price: false,
    });

    const toggleSection = useCallback((key) => {
      setOpenSections((s) => ({ ...s, [key]: !s[key] }));
    }, []);

    const priceRange = useMemo(() => {
      const prices = activities
        .map((a) => Number(a.priceUsd ?? a.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!prices.length) return null;
      return { min: Math.min(...prices), max: Math.max(...prices) };
    }, [activities]);

    // Count active filters for badge
    const activeCatCount = activeCats.length;
    const activeRouteCount = activeRoutes.length;
    const activeFacetCount = activeFacets.length;
    const activeSupplierCount = activeSupplier !== 'all' ? 1 : 0;

    return (
      <aside className="supplier-filter">
        <div className="supplier-filter__header">
          <h3 className="supplier-filter__title">
            {T({ hant: '篩選', hans: '筛选', en: 'Filters' })}
          </h3>
          {(activeCatCount + activeRouteCount + activeFacetCount + activeSupplierCount) > 0 && (
            <span className="supplier-filter__active-badge">
              {activeCatCount + activeRouteCount + activeFacetCount + activeSupplierCount}
            </span>
          )}
        </div>

        <Section
          title={T({ hant: '供應商', hans: '供应商', en: 'Supplier' })}
          badge={activeSupplierCount}
          open={openSections.supplier}
          onToggle={() => toggleSection('supplier')}
        >
          <SupplierStrip
            activities={activities}
            activeSupplier={activeSupplier}
            onSupplier={onSupplier}
            lang={lang}
            layout="sidebar"
            vendorContractCounts={vendorContractCounts}
            vendors={vendors}
          />
        </Section>

        <Section
          title={T({ hant: '體驗類型', hans: '体验类型', en: 'Experience' })}
          badge={activeCatCount}
          open={openSections.category}
          onToggle={() => toggleSection('category')}
        >
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

        <Section
          title={T({ hant: '經典路線', hans: '经典路线', en: 'Routes' })}
          badge={activeRouteCount}
          open={openSections.routes}
          onToggle={() => toggleSection('routes')}
        >
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

        <Section
          title={T({ hant: '進階', hans: '进阶', en: 'More' })}
          badge={activeFacetCount}
          open={openSections.more}
          onToggle={() => toggleSection('more')}
        >
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

        {priceRange && (
          <Section
            title={T({ hant: '價格範圍', hans: '价格范围', en: 'Price range' })}
            open={openSections.price}
            onToggle={() => toggleSection('price')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)' }}>
              <span>{formatDisplayPrice(priceRange.min, displayCurrency, fxRates)}</span>
              <span>{formatDisplayPrice(priceRange.max, displayCurrency, fxRates)}</span>
            </div>
          </Section>
        )}
      </aside>
    );
  }

  /* Section — always rendered; accordion chevron is CSS-only on mobile. */
  function Section({ title, badge, open, onToggle, children }) {
    return (
      <div className={`filter-section${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="filter-section__head"
          onClick={onToggle}
          aria-expanded={open}
        >
          <h4 className="filter-section__title">{title}</h4>
          <div className="filter-section__head-right">
            {badge > 0 && (
              <span className="filter-section__badge">{badge}</span>
            )}
            <span className={`filter-section__chevron${open ? ' is-open' : ''}`} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" strokeWidth="2"
                   stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,4 6,8 10,4"/>
              </svg>
            </span>
          </div>
        </button>
        <div className="filter-section__body">
          {children}
        </div>
      </div>
    );
  }

  window.AuralisUI.SupplierStrip = SupplierStrip;
  window.AuralisUI.SupplierFilter = SupplierFilter;
})();
