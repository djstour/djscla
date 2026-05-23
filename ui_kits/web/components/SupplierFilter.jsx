/* SupplierFilter — left rail on the Tours screen. */

(function () {
  const { Icon, CATEGORIES, getSupplierOptions, pick } = window.AuralisUI;

  function SupplierFilter({ activeSupplier, onSupplier, activeCats, onToggleCat, priceMin, priceMax, lang = 'hant' }) {
    const T = (opts) => pick(lang, opts);
    const supplierOptions = getSupplierOptions(lang);

    return (
      <aside style={{
        width: 280, flexShrink: 0,
        background: '#fff', borderRadius: 24,
        padding: 22,
        boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column', gap: 22,
        alignSelf: 'flex-start',
        position: 'sticky', top: 96,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, font: '600 18px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
            {T({ hant: '篩選 · Filters', hans: '筛选 · Filters', en: 'Filters' })}
          </h3>
          <button style={{ border: 0, background: 'transparent', color: 'var(--coral)', cursor: 'pointer', font: '600 12px/1 var(--font-text)' }}>
            {T({ hant: '重設', hans: '重置', en: 'Reset' })}
          </button>
        </div>

        {/* Categories */}
        <Section title={T({ hant: '體驗類型', hans: '体验类型', en: 'Experience' })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CATEGORIES.map(c => {
              const active = activeCats.includes(c.id);
              return (
                <button key={c.id} onClick={() => onToggleCat(c.id)}
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

        {/* Suppliers */}
        <Section title={T({ hant: '供應商', hans: '供应商', en: 'Supplier' })} subtitle="via Bókun">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {supplierOptions.map(s => {
              const active = activeSupplier === s.id;
              return (
                <button key={s.id} onClick={() => onSupplier(s.id)}
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
            })}
          </div>
        </Section>

        {/* Price */}
        <Section title={T({ hant: '預算', hans: '预算', en: 'Price' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)', marginBottom: 8 }}>
            <span>NT$ {priceMin.toLocaleString()}</span>
            <span>NT$ {priceMax.toLocaleString()}</span>
          </div>
          <div style={{ position: 'relative', height: 6, background: 'var(--base-100)', borderRadius: 999 }}>
            <div style={{ position: 'absolute', left: '8%', right: '20%', top: 0, bottom: 0,
                          background: 'var(--gradient-aurora)', borderRadius: 999 }}/>
            <div style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translate(-50%,-50%)',
                          width: 18, height: 18, borderRadius: 999, background: '#fff', boxShadow: 'var(--shadow-2), inset 0 0 0 2px var(--aurora-cyan)' }}/>
            <div style={{ position: 'absolute', left: '80%', top: '50%', transform: 'translate(-50%,-50%)',
                          width: 18, height: 18, borderRadius: 999, background: '#fff', boxShadow: 'var(--shadow-2), inset 0 0 0 2px var(--aurora-cyan)' }}/>
          </div>
        </Section>

        {/* Language */}
        <Section title={T({ hant: '嚮導語言', hans: '向导语言', en: 'Guide language' })}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              T({ hant: '繁中', hans: '简中', en: '中文' }),
              'English',
              T({ hant: '日本語', hans: '日本語', en: '日本語' }),
            ].map((l, i) => (
              <span key={l} style={{
                padding: '6px 10px', borderRadius: 999,
                font: '600 12px/1 var(--font-text)',
                background: i === 0 ? '#D6F7E8' : 'var(--base-100)',
                color: i === 0 ? '#0A7B4F' : 'var(--fg-2)',
                boxShadow: i === 0 ? 'inset 0 0 0 1px #16C68333' : 'none',
              }}>{l}</span>
            ))}
          </div>
        </Section>
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
