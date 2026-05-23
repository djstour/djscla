/* SupplierFilter — left rail on the Tours screen. */

(function () {
  const { useMemo } = React;
  const { Icon, CATEGORIES, getSupplierOptions, formatDisplayPrice, pick } = window.AuralisUI;

  function SupplierFilter({
    activities = [],
    activeSupplier,
    onSupplier,
    activeCats,
    onToggleCat,
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
      <aside className="supplier-filter" style={{
        background: '#fff', borderRadius: 24,
        padding: 22,
        boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column', gap: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, font: '600 18px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
            {T({ hant: '篩選', hans: '筛选', en: 'Filters' })}
          </h3>
        </div>

        <Section title={T({ hant: '體驗類型', hans: '体验类型', en: 'Experience' })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CATEGORIES.map(c => {
              const active = activeCats.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => onToggleCat(c.id)}
                        style={{
                          height: 40, padding: '0 12px',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: active ? '#C6FF3F' : 'transparent',
                          border: 0, borderRadius: 12, cursor: 'pointer',
                          color: active ? '#11151F' : 'var(--fg-2)',
                          font: '600 13px/1 var(--font-text)',
                          transition: 'background var(--dur-fast) var(--ease-out)',
                          textAlign: 'left',
                        }}>
                  <Icon name={c.icon} size={16} />
                  <span style={{ flex: 1 }}>{pick(lang, c.label)}</span>
                  {active && <Icon name="check" size={14} />}
                </button>
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
              supplierOptions.map(s => {
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
