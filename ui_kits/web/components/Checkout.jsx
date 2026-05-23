/* Checkout — 3-step flow. Review → Payment → Done. */

(function () {
  const { Icon, formatDisplayPrice, formatTotalDisplay, tripTotalUsd, pick } = window.AuralisUI;
  const { useState } = React;

  function Checkout({ trip, onBack, onPaid, lang, displayCurrency = 'USD', fxRates = { USD: 1 } }) {
    const T = (opts) => pick(lang, opts);
    const [step, setStep] = useState('review'); // review | pay | done
    const subtotalUsd = tripTotalUsd(trip);
    const feeUsd = Math.round(subtotalUsd * 0.02);
    const totalUsd = subtotalUsd + feeUsd;

    const steps = [
      { id: 'review', label: { hant: '檢視行程', hans: '查看行程', en: 'Review trip' } },
      { id: 'pay',    label: { hant: '付款',     hans: '付款',     en: 'Payment' } },
      { id: 'done',   label: { hant: '完成',     hans: '完成',     en: 'Confirmation' } },
    ];

    return (
      <section className="auralis-section" style={{
        minHeight: 720,
        background: 'var(--brand-surface)',
        paddingTop: 40,
        paddingBottom: 40,
      }}>
        <div className="auralis-container" style={{ maxWidth: 1100 }}>
          <button onClick={onBack} style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            color: 'var(--fg-2)', font: '600 13px/1 var(--font-text)', marginBottom: 18,
          }}>
            <Icon name="arrow-left" size={14} />
            {T({ hant: '回到行程', hans: '返回行程', en: 'Back to itinerary' })}
          </button>

          {/* Stepper */}
          <div className="checkout-stepper">
            {steps.map((s, i) => {
              const stepIdx = step === 'review' ? 0 : step === 'pay' ? 1 : 2;
              const active = i === stepIdx;
              const done = i < stepIdx;
              return (
                <div key={s.id} style={{
                  flex: 1, height: 44, borderRadius: 12,
                  display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
                  background: active ? '#fff' : done ? 'var(--success-soft)' : 'var(--base-100)',
                  boxShadow: active ? 'var(--shadow-2), inset 0 0 0 2px var(--aurora-cyan)' : 'none',
                  color: active ? 'var(--fg-1)' : done ? '#0A7B4F' : 'var(--fg-3)',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'var(--gradient-aurora)' : done ? 'var(--success)' : 'var(--base-200)',
                    color: '#fff', font: '700 11px/1 var(--font-text)',
                  }}>{done ? <Icon name="check" size={12} color="#fff" /> : i + 1}</span>
                  <span style={{ font: '600 13px/1 var(--font-text)' }}>{pick(lang, s.label)}</span>
                </div>
              );
            })}
          </div>

          {step === 'review' && (
            <ReviewStep trip={trip} subtotalUsd={subtotalUsd} feeUsd={feeUsd} totalUsd={totalUsd}
                       onNext={() => setStep('pay')} lang={lang}
                       displayCurrency={displayCurrency} fxRates={fxRates} />
          )}
          {step === 'pay' && (
            <PayStep totalUsd={totalUsd} onPaid={() => setStep('done')} onBack={() => setStep('review')} lang={lang}
                     displayCurrency={displayCurrency} fxRates={fxRates} trip={trip} />
          )}
          {step === 'done' && (
            <DoneStep totalUsd={totalUsd} onClose={onPaid} lang={lang} trip={trip}
                      displayCurrency={displayCurrency} fxRates={fxRates} />
          )}
        </div>
      </section>
    );
  }

  // --- Step 1: review ----------------------------------------------------------
  function ReviewStep({ trip, subtotalUsd, feeUsd, totalUsd, onNext, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div className="checkout-grid">
        <div style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: 'var(--shadow-2)' }}>
          <h2 style={{ margin: '0 0 18px', font: '700 26px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            {T({ hant: '檢視你的行程', hans: '查看你的行程', en: 'Review your trip' })}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trip.map((t, i) => {
              return (
                <div key={t.id} style={{
                  display: 'flex', gap: 14, alignItems: 'center',
                  padding: 12, borderRadius: 14,
                  background: 'var(--base-50)', border: '1px solid var(--base-200)',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flex: 'none',
                    background: 'var(--gradient-aurora)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    <Icon name="ticket" size={20} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '600 15px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>{t.title}</div>
                    <div style={{ font: '400 13px/1.4 var(--font-text)', color: 'var(--fg-3)', marginTop: 2 }}>
                      {t.supplier} · {t.duration} · {T({ hant: '第', hans: '第', en: 'Day' })} {i + 1}
                    </div>
                  </div>
                  <span style={{ font: '700 15px/1 var(--font-display)', color: 'var(--fg-1)' }}>
                    {formatDisplayPrice(t.priceUsd ?? t.price, displayCurrency, fxRates)}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 22, padding: 16, borderRadius: 14, background: 'var(--gradient-aurora-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-1)' }}>
              <Icon name="shield-check" size={18} />
              <div>
                <div style={{ font: '600 13px/1.3 var(--font-text)' }}>
                  {T({
                    hant: '一筆交易，無縫保障',
                    hans: '一笔交易，无缝保障',
                    en:   'One transaction, seamless protection',
                  })}
                </div>
                <div style={{ font: '400 12px/1.4 var(--font-text)', color: 'var(--fg-2)', marginTop: 2 }}>
                  {T({
                    hant: '所有供應商透過 Bókun 即時鎖票。72 小時前可全額退款。',
                    hans: '所有供应商通过 Bókun 实时锁票。72 小时前可全额退款。',
                    en:   'All suppliers reserved live via Bókun. Full refund up to 72 hr before.',
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Summary
          subtotalUsd={subtotalUsd} feeUsd={feeUsd} totalUsd={totalUsd}
          cta={T({ hant: '前往付款', hans: '前往付款', en: 'Continue to payment' })}
          onNext={onNext}
          lang={lang}
          displayCurrency={displayCurrency}
          fxRates={fxRates}
        />
      </div>
    );
  }

  // --- Step 2: pay -------------------------------------------------------------
  function PayStep({ totalUsd, onPaid, onBack, lang, displayCurrency, fxRates, trip }) {
    const T = (opts) => pick(lang, opts);
    const [method, setMethod] = useState('card');
    const methods = [
      { id: 'card',  icon: 'credit-card', label: { hant: '信用卡', hans: '信用卡', en: 'Credit card' } },
      { id: 'apple', icon: 'apple',       label: { hant: 'Apple Pay', hans: 'Apple Pay', en: 'Apple Pay' } },
      { id: 'line',  icon: 'wallet',      label: { hant: 'LINE Pay', hans: '微信支付 · LINE', en: 'LINE Pay' } },
    ];
    return (
      <div className="checkout-grid">
        <div style={{ background: '#fff', borderRadius: 24, padding: 28, boxShadow: 'var(--shadow-2)' }}>
          <h2 style={{ margin: '0 0 18px', font: '700 26px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            {T({ hant: '付款方式', hans: '付款方式', en: 'How would you like to pay?' })}
          </h2>

          {/* Method selector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 22 }}>
            {methods.map(m => (
              <button key={m.id} onClick={() => setMethod(m.id)}
                      style={{
                        height: 76, borderRadius: 14, cursor: 'pointer',
                        background: '#fff',
                        boxShadow: method === m.id ? 'inset 0 0 0 2px var(--aurora-cyan), 0 0 0 4px rgba(0,213,255,0.2)' : 'inset 0 0 0 1px var(--base-200)',
                        border: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                <Icon name={m.icon} size={20} color={method === m.id ? 'var(--aurora-deep)' : 'var(--fg-2)'} />
                <span style={{ font: '600 12px/1 var(--font-text)', color: method === m.id ? 'var(--fg-1)' : 'var(--fg-2)' }}>{pick(lang, m.label)}</span>
              </button>
            ))}
          </div>

          {/* Card form */}
          {method === 'card' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label={T({ hant: '持卡人', hans: '持卡人', en: 'Cardholder' })} placeholder={T({ hant: '與卡片相同', hans: '与卡片相同', en: 'As on card' })} />
              <Field label={T({ hant: '卡號', hans: '卡号', en: 'Card number' })} placeholder="•••• •••• •••• ••••" icon="credit-card" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={T({ hant: '到期', hans: '到期', en: 'Expiry' })} placeholder="MM / YY" />
                <Field label="CVC" placeholder="•••" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: 'var(--fg-3)', font: '500 12px/1 var(--font-text)' }}>
                <Icon name="lock" size={12} />
                {T({
                  hant: '使用 Stripe 加密處理 · 我們不儲存你的卡片資料',
                  hans: '使用 Stripe 加密处理 · 我们不储存你的卡片资料',
                  en:   'Encrypted via Stripe · we never store card details',
                })}
              </div>
            </div>
          )}
          {method === 'apple' && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-2)', background: 'var(--base-50)', borderRadius: 14 }}>
              {T({
                hant: '按下「立即付款」後將喚出 Apple Pay 確認視窗。',
                hans: '点击「立即付款」后将弹出 Apple Pay 确认窗口。',
                en:   'You\u2019ll be prompted by Apple Pay when you confirm.',
              })}
            </div>
          )}
          {method === 'line' && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-2)', background: 'var(--base-50)', borderRadius: 14 }}>
              {T({
                hant: '系統將開啟 LINE Pay 進行授權。',
                hans: '系统将开启微信支付 / LINE Pay 进行授权。',
                en:   'Authorisation will open in LINE Pay.',
              })}
            </div>
          )}
        </div>

        <Summary
          totalUsd={totalUsd}
          cta={T({
            hant: `付款 ${formatTotalDisplay(totalUsd, displayCurrency, fxRates)}`,
            hans: `付款 ${formatTotalDisplay(totalUsd, displayCurrency, fxRates)}`,
            en: `Pay ${formatTotalDisplay(totalUsd, displayCurrency, fxRates)}`,
          })}
          onNext={onPaid}
          lang={lang}
          displayCurrency={displayCurrency}
          fxRates={fxRates}
        />
      </div>
    );
  }

  function Field({ label, placeholder, icon }) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ font: '600 11px/1 var(--font-text)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>{label}</span>
        <span style={{
          height: 48, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff', borderRadius: 12,
          boxShadow: 'inset 0 0 0 1px var(--base-200)',
        }}>
          {icon && <Icon name={icon} size={16} color="var(--fg-3)" />}
          <input placeholder={placeholder}
                 style={{ flex: 1, border: 0, outline: 0, background: 'transparent', font: '500 15px/1 var(--font-text)', color: 'var(--fg-1)' }} />
        </span>
      </label>
    );
  }

  // --- Step 3: done ------------------------------------------------------------
  function DoneStep({ totalUsd, onClose, trip, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div style={{
        background: 'var(--gradient-aurora-soft)',
        borderRadius: 28, padding: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: 999,
          background: 'var(--gradient-aurora)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-glow-aurora)',
        }}>
          <Icon name="check" size={32} color="var(--brand-on-gradient)" strokeWidth={2.5} />
        </div>
        <h2 style={{ margin: 0, font: '700 36px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
          {T({ hant: '預訂完成。', hans: '预订完成。', en: 'Booked.' })}
        </h2>
        <p style={{ margin: 0, maxWidth: 480, font: '500 16px/1.5 var(--font-text)', color: 'var(--fg-2)' }}>
          {T({
            hant: '確認信將寄至你填寫的電子郵件。',
            hans: '确认信将寄至你填写的电子邮件。',
            en:   'A confirmation email will be sent to the address you provide.',
          })}
        </p>

        <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
          <Stat n={trip.length} l={T({ hant: '個體驗', hans: '个体验', en: 'experiences' })} />
          <Stat n={formatTotalDisplay(totalUsd, displayCurrency, fxRates)} l={T({ hant: '已支付', hans: '已支付', en: 'paid' })} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={onClose} style={{
            height: 48, padding: '0 24px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'var(--gradient-aurora)', color: 'var(--brand-on-gradient)',
            font: '700 14px/1 var(--font-text)', boxShadow: 'var(--shadow-glow-aurora)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>{T({ hant: '回到首頁', hans: '回到首页', en: 'Back to discover' })} <Icon name="arrow-right" size={16} /></button>
          <button style={{
            height: 48, padding: '0 22px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'rgba(255,255,255,0.7)', color: 'var(--fg-1)',
            font: '600 14px/1 var(--font-text)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.7)',
            backdropFilter: 'blur(20px)',
          }}>{T({ hant: '下載 PDF', hans: '下载 PDF', en: 'Download PDF' })}</button>
        </div>
      </div>
    );
  }
  function Stat({ n, l }) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: '12px 18px', minWidth: 110 }}>
        <div style={{ font: '700 24px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>{n}</div>
        <div style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
      </div>
    );
  }

  // --- shared summary -----------------------------------------------------------
  function Summary({ subtotalUsd, feeUsd, totalUsd, cta, onNext, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div style={{
        background: '#fff', borderRadius: 24, padding: 24, boxShadow: 'var(--shadow-2)',
        position: 'sticky', top: 96,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <h3 style={{ margin: 0, font: '600 16px/1 var(--font-display)', color: 'var(--fg-1)' }}>
          {T({ hant: '訂單摘要', hans: '订单摘要', en: 'Order summary' })}
        </h3>
        {subtotalUsd != null && (
          <>
            <Row label={T({ hant: '小計', hans: '小计', en: 'Subtotal' })} value={formatDisplayPrice(subtotalUsd, displayCurrency, fxRates)} />
            <Row label={T({ hant: '服務費', hans: '服务费', en: 'Service fee' })} value={formatDisplayPrice(feeUsd, displayCurrency, fxRates)} />
            <div style={{ height: 1, background: 'var(--base-200)' }}/>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ font: '600 14px/1 var(--font-text)', color: 'var(--fg-2)' }}>
            {T({ hant: '總計', hans: '总计', en: 'Total' })}
          </span>
          <span style={{ font: '700 28px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            {formatTotalDisplay(totalUsd, displayCurrency, fxRates)}
          </span>
        </div>
        <button onClick={onNext} style={{
          width: '100%', height: 52, borderRadius: 16, border: 0, cursor: 'pointer',
          background: 'var(--gradient-aurora)', color: 'var(--brand-on-gradient)',
          font: '700 15px/1 var(--font-text)', boxShadow: 'var(--shadow-glow-aurora)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {cta} <Icon name="arrow-right" size={16} />
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--fg-3)', font: '500 11px/1.4 var(--font-text)' }}>
          <Icon name="shield-check" size={12} color="var(--success)" />
          {T({
            hant: '出發 72 小時前可全額退款。',
            hans: '出发 72 小时前可全额退款。',
            en:   'Free cancellation up to 72 h before departure.',
          })}
        </div>
      </div>
    );
  }

  function Row({ label, value }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ font: '500 13px/1 var(--font-text)', color: 'var(--fg-3)' }}>{label}</span>
        <span style={{ font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)' }}>{value}</span>
      </div>
    );
  }

  window.AuralisUI.Checkout = Checkout;
})();
