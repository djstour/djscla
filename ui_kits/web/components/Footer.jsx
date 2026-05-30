/* Footer — newsletter capture + link columns. */

(function () {
  const { Icon, pick, brandLogoSrc, brandLogoAlt, brandZhName } = window.AuralisUI;

  function Footer({ lang, siteThemeId }) {
    const T = (opts) => pick(lang, opts);

    const cols = [
      {
        h: T({ hant: '探索', hans: '探索', en: 'Explore' }),
        items: [
          T({ hant: '自駕', hans: '自驾', en: 'Self-drive' }),
          T({ hant: '極光', hans: '极光', en: 'Northern Lights' }),
          T({ hant: '冰川', hans: '冰川', en: 'Glacier' }),
          T({ hant: '溫泉', hans: '温泉', en: 'Hot springs' }),
        ],
      },
      {
        h: T({ hant: '行程', hans: '行程', en: 'Trips' }),
        items: [
          T({ hant: '經典 7 日',     hans: '经典 7 日',     en: 'Sample 7-day' }),
          T({ hant: '冬季極光',     hans: '冬季极光',     en: 'Winter aurora' }),
          T({ hant: '夏季環島',     hans: '夏季环岛',     en: 'Summer ring road' }),
          T({ hant: '頂級管家',     hans: '顶级管家',     en: 'Premium concierge' }),
        ],
      },
      {
        h: T({ hant: '幫助', hans: '帮助', en: 'Help' }),
        items: [
          T({ hant: '常見問題',       hans: '常见问题',       en: 'FAQ' }),
          T({ hant: '取消政策',       hans: '取消政策',       en: 'Cancellation' }),
          T({ hant: '保險',           hans: '保险',           en: 'Insurance' }),
          T({ hant: '中文客服 LINE @djstour', hans: '中文客服 微信 djstour-cs', en: 'Mandarin support · LINE @djstour' }),
        ],
      },
      {
        h: T({ hant: '公司', hans: '公司', en: 'Company' }),
        items: [
          T({ hant: '關於我們',     hans: '关于我们',     en: 'About' }),
          T({ hant: '在地嚮導',     hans: '当地向导',     en: 'Local operators' }),
          T({ hant: '媒體報導',     hans: '媒体报道',     en: 'Press' }),
          T({ hant: '加入我們',     hans: '加入我们',     en: 'Careers' }),
        ],
      },
    ];

    return (
      <footer className="auralis-section" style={{
        background: 'var(--brand-footer)',
        paddingTop: 'clamp(48px, 10vw, 64px)',
        paddingBottom: 32,
      }}>
        <div className="auralis-container">
          <div className="glass footer-newsletter" style={{
            padding: 'clamp(20px, 4vw, 28px) clamp(20px, 4vw, 32px)',
            borderRadius: 28,
          }}>
            <div>
              <span className="overline" style={{ color: 'var(--coral)' }}>
                {T({ hant: '加入旅誌', hans: '加入旅志', en: 'DJS Tour journal' })}
              </span>
              <h3 style={{ margin: '8px 0 0', font: '700 28px/1.1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
                {T({
                  hant: '每月一封冰島來信。',
                  hans: '每月一封冰岛来信。',
                  en:   'A letter from Iceland, once a month.',
                })}
              </h3>
              <p style={{ margin: '8px 0 0', font: '500 14px/1.5 var(--font-text)', color: 'var(--fg-2)' }}>
                {T({
                  hant: '極光日曆、隱藏路線、嚮導推薦 — 不轉售訂閱資料。',
                  hans: '极光日历、隐藏路线、向导推荐 — 不转售订阅数据。',
                  en:   'Aurora forecasts, hidden routes, guide picks. We never sell your email.',
                })}
              </p>
            </div>
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', gap: 8 }}>
              <input placeholder={T({ hant: '你的 email', hans: '你的 email', en: 'your@email.com' })}
                     style={{
                       flex: 1, height: 52, padding: '0 18px', borderRadius: 16,
                       background: 'var(--surface-field)', border: 0, outline: 0,
                       font: '500 15px/1 var(--font-text)', color: 'var(--fg-1)',
                       boxShadow: 'inset 0 0 0 1px var(--base-200)',
                     }} />
              <button style={{
                height: 52, padding: '0 22px', borderRadius: 16, border: 0, cursor: 'pointer',
                background: 'var(--gradient-aurora)', color: 'var(--brand-on-gradient)',
                font: '700 14px/1 var(--font-text)', boxShadow: 'var(--shadow-glow-aurora)',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>{T({ hant: '訂閱', hans: '订阅', en: 'Subscribe' })} <Icon name="arrow-right" size={16} /></button>
            </form>
          </div>

          {/* Link columns */}
          <div className="footer-cols">
            <div>
              <img src={brandLogoSrc(lang, siteThemeId)} style={{ height: 44, width: 'auto', display: 'block' }} alt={brandLogoAlt(lang)} />
              <p style={{ margin: '14px 0 0', font: '400 13px/1.6 var(--font-text)', color: 'var(--fg-3)', maxWidth: 240 }}>
                {T({
                  hant: '為華語旅人精選的冰島 OTA。一次規劃，無縫預訂。',
                  hans: '为华语旅人精选的冰岛 OTA。一次规划，无缝预订。',
                  en:   'A premium Iceland OTA for Mandarin-speaking adventurers. Plan once, book seamlessly.',
                })}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                {['instagram', 'youtube', 'send'].map(i => (
                  <button key={i} style={{
                    width: 36, height: 36, borderRadius: 999, border: 0, cursor: 'pointer',
                    background: 'var(--glass-medium)', backdropFilter: 'blur(12px)',
                    boxShadow: 'inset 0 0 0 1px var(--glass-border)',
                    color: 'var(--fg-1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Icon name={i} size={16} /></button>
                ))}
              </div>
            </div>
            {cols.map(c => (
              <div key={c.h}>
                <h4 style={{ margin: 0, font: '600 12px/1 var(--font-text)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-1)' }}>
                  {c.h}
                </h4>
                <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {c.items.map(i => (
                    <li key={i}>
                      <button
                        type="button"
                        style={{
                          font: '500 13px/1 var(--font-text)',
                          color: 'var(--fg-2)',
                          textDecoration: 'none',
                          background: 'transparent',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {i}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Legal bar */}
          <div style={{
            marginTop: 48, paddingTop: 24,
            borderTop: '1px solid rgba(20,30,60,0.1)',
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
            font: '500 12px/1.5 var(--font-text)', color: 'var(--fg-3)',
          }}>
            <span>{lang === 'en'
              ? '© 2026 DJS Tour Ltd. · Reykjavík · Taipei'
              : `© 2026 DJS Tour · ${brandZhName(lang)} Ltd. · Reykjavík · Taipei`}
            </span>
            <span>{T({
              hant: '庫存由 Bókun 提供 · ISO 27001 · GDPR 合規',
              hans: '库存由 Bókun 提供 · ISO 27001 · GDPR 合规',
              en:   'Inventory powered by Bókun · ISO 27001 · GDPR compliant',
            })}</span>
          </div>
        </div>
      </footer>
    );
  }

  window.AuralisUI.Footer = Footer;
})();
