/**
 * Checkout — 3-step pre-checkout mirroring Bókun back-office:
 *
 *   Step 1 · Main contact          (name / email / phone+country / opt-in)
 *   Step 2 · Booking questions     (dynamic per-activity questions)
 *   Step 3 · Payment & confirmation (final review → redirect to Bókun)
 *
 * The actual money movement happens on Bókun's hosted checkout page
 * (chosen for fastest time-to-launch). We collect contact + answers
 * here, persist a `redirected_to_bokun` inquiry to Supabase, and then
 * hand the visitor over with selections pre-filled in the URL.
 *
 * Layout: top-mounted collapsible order summary (mobile-friendly) +
 * a centered single-column form per step. No sticky sidebar so the
 * form gets the full reading width on phones.
 */

(function () {
  const { Icon, formatDisplayPrice, formatTotalDisplay, tripTotalUsd, pick } = window.AuralisUI;
  const { useState, useMemo, useEffect } = React;

  // Reseller-defined ITU calling codes — kept narrow on purpose (most
  // bookings come from East-Asia/SEA + the AU/NZ/IS pipeline). Easy to
  // extend; UI alpha-sorts by the dial code, not by label, so adding
  // entries doesn't reshuffle the list at random.
  const COUNTRY_CODES = [
    { code: '+886', flag: '🇹🇼', label: { hant: '台灣',   hans: '台湾',   en: 'Taiwan' } },
    { code: '+86',  flag: '🇨🇳', label: { hant: '中國',   hans: '中国',   en: 'China' } },
    { code: '+852', flag: '🇭🇰', label: { hant: '香港',   hans: '香港',   en: 'Hong Kong' } },
    { code: '+853', flag: '🇲🇴', label: { hant: '澳門',   hans: '澳门',   en: 'Macao' } },
    { code: '+65',  flag: '🇸🇬', label: { hant: '新加坡', hans: '新加坡', en: 'Singapore' } },
    { code: '+60',  flag: '🇲🇾', label: { hant: '馬來西亞', hans: '马来西亚', en: 'Malaysia' } },
    { code: '+81',  flag: '🇯🇵', label: { hant: '日本',   hans: '日本',   en: 'Japan' } },
    { code: '+82',  flag: '🇰🇷', label: { hant: '韓國',   hans: '韩国',   en: 'Korea' } },
    { code: '+1',   flag: '🇺🇸', label: { hant: '美國',   hans: '美国',   en: 'United States' } },
    { code: '+44',  flag: '🇬🇧', label: { hant: '英國',   hans: '英国',   en: 'United Kingdom' } },
    { code: '+61',  flag: '🇦🇺', label: { hant: '澳洲',   hans: '澳洲',   en: 'Australia' } },
    { code: '+354', flag: '🇮🇸', label: { hant: '冰島',   hans: '冰岛',   en: 'Iceland' } },
  ];

  /**
   * Convert UI trip items into the Bókun item shape required by
   * /api/checkout/questions and /api/checkout/booking. `priceTable`
   * is preferred (already keyed by `categoryId`) and falls back to
   * `raw.pricingCategories` for resilience.
   */
  function tripToBokunItems(trip) {
    return trip.map((t) => {
      const cats = (t.pricingCategories && t.pricingCategories.length)
        ? t.pricingCategories
        : ((t.raw && t.raw.pricingCategories) || []);

      const paxCounts = t.tripGuests && t.tripGuests.paxCounts;
      let pricingCategoryBookings = [];

      // Detail page stores per-category counts in tripGuests.paxCounts — prefer that
      // over legacy adults/children so multi-tier products (resident, teen, etc.) work.
      if (paxCounts && typeof paxCounts === 'object' && cats.length) {
        pricingCategoryBookings = cats
          .map((cat) => ({
            pricingCategoryId: cat.id,
            quantity: Number(paxCounts[String(cat.id)]) || 0,
          }))
          .filter((row) => row.quantity > 0);
      }

      const adults = (t.tripGuests && Number(t.tripGuests.adults)) || 0;
      const children = (t.tripGuests && Number(t.tripGuests.children)) || 0;

      if (!pricingCategoryBookings.length) {
        const findCat = (re) => cats.find((c) => re.test((c.title || c.fullTitle || '').toString()));
        const adultCat = cats.find((c) => c.defaultCategory) || findCat(/adult/i) || cats[0] || null;
        const childCat = findCat(/child|youth|kid/i) || null;
        if (adults > 0 && adultCat) {
          pricingCategoryBookings.push({ pricingCategoryId: adultCat.id, quantity: adults });
        }
        if (children > 0 && childCat) {
          pricingCategoryBookings.push({ pricingCategoryId: childCat.id, quantity: children });
        }
      }

      const extras = Array.isArray(t.tripExtras)
        ? t.tripExtras.map((ex) => ({ extraId: Number(ex.id), quantity: Number(ex.quantity) || 1 }))
        : [];

      return {
        activityId: t.id,
        title: t.title,
        supplier: t.supplier,
        date: t.tripDate || null,
        startTimeId: t.tripStartTimeId || null,
        startTimeLabel: t.tripStartTimeLabel || null,
        pickupPlaceId: t.tripPickupPlaceId || null,
        pickupTitle: t.tripPickupTitle || null,
        pricingCategoryBookings,
        extras,
        // Echoed back for UI use only — backend ignores these.
        _adults: adults,
        _children: children,
        _paxTotal: pricingCategoryBookings.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
      };
    });
  }

  function checkoutItemPriceUsd(item) {
    const selected = Number(item.tripPricing && item.tripPricing.totalUsd);
    if (Number.isFinite(selected) && selected > 0) return selected;
    return Number(item.priceUsd ?? item.price) || 0;
  }

  function Checkout({ trip, onBack, onPaid, lang, displayCurrency = 'USD', fxRates = { USD: 1 } }) {
    const T = (opts) => pick(lang, opts);
    const [step, setStep] = useState(0); // 0 contact · 1 questions · 2 review/pay
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [contact, setContact] = useState({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      phoneCountryCode: COUNTRY_CODES[0].code,
      marketingOptIn: false,
    });
    const [contactErrors, setContactErrors] = useState({});

    const items = useMemo(() => tripToBokunItems(trip), [trip]);

    const [questionsState, setQuestionsState] = useState({ loading: false, error: '', source: null, questions: [] });
    const [answers, setAnswers] = useState({});

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const subtotalUsd = tripTotalUsd(trip);
    const feeUsd = 0; // Bókun hosted checkout adds its own fees on their page
    const totalUsd = subtotalUsd + feeUsd;

    const steps = [
      { id: 'contact',   label: { hant: '聯絡資訊', hans: '联系信息', en: 'Main contact' } },
      { id: 'questions', label: { hant: '預訂問題', hans: '预订问题', en: 'Booking questions' } },
      { id: 'review',    label: { hant: '付款確認', hans: '付款确认', en: 'Payment' } },
    ];

    // -- Step 1 → 2 transition: fetch questions on demand so we don't waste
    //    a Bókun API call if the visitor bounces before reaching Step 2.
    useEffect(() => {
      if (step !== 1) return;
      if (questionsState.questions.length || questionsState.loading) return;
      let cancelled = false;
      setQuestionsState((s) => ({ ...s, loading: true, error: '' }));
      fetch('/api/checkout/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lang,
          items: items.map((it) => ({
            activityId: it.activityId,
            date: it.date,
            startTimeId: it.startTimeId,
            pickupPlaceId: it.pickupPlaceId,
            pricingCategoryBookings: it.pricingCategoryBookings,
            extras: it.extras,
          })),
        }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          return data;
        })
        .then((data) => {
          if (cancelled) return;
          setQuestionsState({ loading: false, error: '', source: data.source, questions: data.questions || [] });
        })
        .catch((err) => {
          if (cancelled) return;
          setQuestionsState({ loading: false, error: err.message, source: null, questions: [] });
        });
      return () => { cancelled = true; };
    }, [step, lang, items]); // eslint-disable-line react-hooks/exhaustive-deps

    function validateContact() {
      const errs = {};
      if (!contact.firstName.trim()) errs.firstName = T({ hant: '請填寫名字', hans: '请填写名字', en: 'First name required' });
      if (!contact.lastName.trim()) errs.lastName = T({ hant: '請填寫姓氏', hans: '请填写姓氏', en: 'Last name required' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) errs.email = T({ hant: '電子郵件格式不正確', hans: '电子邮件格式不正确', en: 'Invalid email' });
      if (!contact.phone.trim()) errs.phone = T({ hant: '請填寫手機號碼', hans: '请填写手机号', en: 'Phone required' });
      setContactErrors(errs);
      return Object.keys(errs).length === 0;
    }

    function validateAnswers() {
      // Required-questions only — optional ones can be filled on Bókun's page.
      const missing = questionsState.questions.filter((q) => q.required && !answers[`${q.scope}:${q.id}`]);
      return missing.length === 0;
    }

    function handleNextFromContact() {
      if (validateContact()) setStep(1);
    }

    function handleNextFromQuestions() {
      if (validateAnswers()) setStep(2);
    }

    async function handleSubmit() {
      setSubmitError('');
      setSubmitting(true);
      try {
        const res = await fetch('/api/checkout/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lang,
            contact,
            items: items.map((it) => ({
              activityId: it.activityId,
              date: it.date,
              startTimeId: it.startTimeId,
              pickupPlaceId: it.pickupPlaceId,
              pricingCategoryBookings: it.pricingCategoryBookings,
              extras: it.extras,
            })),
            answers,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          const detail = Array.isArray(data.details) && data.details.length
            ? data.details.join('; ')
            : '';
          throw new Error(detail || data.error || `HTTP ${res.status}`);
        }
        // Hand off to Bókun. We replace history so the back button returns
        // to our trip page instead of bouncing through the redirect.
        window.location.assign(data.hostedCheckoutUrl);
      } catch (err) {
        setSubmitting(false);
        setSubmitError(err.message || 'Could not start checkout. Please try again.');
      }
    }

    if (!trip || trip.length === 0) {
      return (
        <section className="checkout-page">
          <div className="auralis-container" style={{ maxWidth: 720, paddingTop: 60, paddingBottom: 60 }}>
            <h2 style={{ margin: 0, font: '700 22px/1.2 var(--font-display)', color: 'var(--fg-1)' }}>
              {T({ hant: '行程是空的', hans: '行程是空的', en: 'Your trip is empty' })}
            </h2>
            <button onClick={onBack} className="checkout-cta-secondary" style={{ marginTop: 20 }}>
              {T({ hant: '回到探索', hans: '回到探索', en: 'Back to discover' })}
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="checkout-page">
        <div className="auralis-container checkout-container">
          <button onClick={onBack} className="checkout-back-link" type="button">
            <Icon name="arrow-left" size={14} />
            {T({ hant: '回到行程', hans: '返回行程', en: 'Back to itinerary' })}
          </button>

          <OrderSummary
            trip={trip}
            items={items}
            totalUsd={totalUsd}
            open={summaryOpen}
            onToggle={() => setSummaryOpen((v) => !v)}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
          />

          <Stepper steps={steps} current={step} lang={lang} />

          <div className="checkout-step">
            {step === 0 && (
              <ContactStep
                contact={contact}
                onChange={setContact}
                errors={contactErrors}
                onNext={handleNextFromContact}
                lang={lang}
              />
            )}
            {step === 1 && (
              <QuestionsStep
                state={questionsState}
                answers={answers}
                onAnswer={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))}
                items={items}
                onBack={() => setStep(0)}
                onNext={handleNextFromQuestions}
                lang={lang}
              />
            )}
            {step === 2 && (
              <ReviewStep
                trip={trip}
                items={items}
                contact={contact}
                totalUsd={totalUsd}
                onBack={() => setStep(1)}
                onSubmit={handleSubmit}
                submitting={submitting}
                error={submitError}
                lang={lang}
                displayCurrency={displayCurrency}
                fxRates={fxRates}
              />
            )}
          </div>
        </div>
      </section>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Top-mounted collapsible order summary. Sits above the form so it's
  // visible by default on mobile (Klook-style "tap to expand") while
  // taking near-zero vertical space when collapsed.
  // ─────────────────────────────────────────────────────────────────
  function OrderSummary({ trip, items, totalUsd, open, onToggle, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    const totalCount = items.reduce((sum, it) => {
      if (Number(it._paxTotal) > 0) return sum + Number(it._paxTotal);
      return sum + (it._adults || 0) + (it._children || 0);
    }, 0);

    return (
      <div className="checkout-order-summary">
        <button type="button" className="checkout-order-summary__head" onClick={onToggle} aria-expanded={open}>
          <div className="checkout-order-summary__heading">
            <Icon name="receipt" size={16} color="var(--fg-2)" />
            <span>{T({ hant: '訂單摘要', hans: '订单摘要', en: 'Order summary' })}</span>
            <span className="checkout-order-summary__chip">
              {T({
                hant: `${trip.length} 項 · ${totalCount} 位旅客`,
                hans: `${trip.length} 项 · ${totalCount} 位旅客`,
                en: `${trip.length} item${trip.length === 1 ? '' : 's'} · ${totalCount} traveler${totalCount === 1 ? '' : 's'}`,
              })}
            </span>
          </div>
          <div className="checkout-order-summary__total">
            <strong>{formatTotalDisplay(totalUsd, displayCurrency, fxRates)}</strong>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color="var(--fg-2)" />
          </div>
        </button>
        {open && (
          <div className="checkout-order-summary__body">
            {trip.map((t, i) => (
              <div key={t.id} className="checkout-order-summary__row">
                <div className="checkout-order-summary__row-meta">
                  <div className="checkout-order-summary__row-title">{t.title}</div>
                  <div className="checkout-order-summary__row-sub">
                    {[
                      t.tripDate || null,
                      t.tripStartTimeLabel || null,
                      items[i]
                        ? T({
                            hant: `${(items[i]._adults || 0) + (items[i]._children || 0)} 位旅客`,
                            hans: `${(items[i]._adults || 0) + (items[i]._children || 0)} 位旅客`,
                            en: `${(items[i]._adults || 0) + (items[i]._children || 0)} traveler(s)`,
                          })
                        : null,
                      t.tripPickupTitle
                        ? T({ hant: `接送：${t.tripPickupTitle}`, hans: `接送：${t.tripPickupTitle}`, en: `Pickup: ${t.tripPickupTitle}` })
                        : null,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="checkout-order-summary__row-price">
                  {formatDisplayPrice(checkoutItemPriceUsd(t), displayCurrency, fxRates)}
                </span>
              </div>
            ))}
            <div className="checkout-order-summary__note">
              <Icon name="info" size={12} color="var(--fg-3)" />
              {T({
                hant: '最終費用（含 Bókun 服務費與稅）將於下一頁付款時顯示。',
                hans: '最终费用（含 Bókun 服务费与税）将在下一页付款时显示。',
                en: 'Final price (incl. Bókun fees & taxes) shown on the next page.',
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Stepper — 3-dot progress with current/done/upcoming states.
  // ─────────────────────────────────────────────────────────────────
  function Stepper({ steps, current, lang }) {
    return (
      <ol className="checkout-stepper" aria-label="Checkout progress">
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'upcoming';
          return (
            <li key={s.id} className={`checkout-stepper__step is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="checkout-stepper__dot">
                {state === 'done' ? <Icon name="check" size={14} color="#fff" /> : i + 1}
              </span>
              <span className="checkout-stepper__label">{pick(lang, s.label)}</span>
            </li>
          );
        })}
      </ol>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 1 · Main contact (minimal — Name / Email / Phone / Opt-in)
  // ─────────────────────────────────────────────────────────────────
  function ContactStep({ contact, onChange, errors, onNext, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <form className="checkout-card" onSubmit={(e) => { e.preventDefault(); onNext(); }}>
        <h2 className="checkout-card__title">
          {T({ hant: '聯絡資訊', hans: '联系信息', en: 'Main contact' })}
        </h2>
        <p className="checkout-card__lede">
          {T({
            hant: '我們會把確認信寄到這個電子郵件，並透過手機聯絡你做行前確認。',
            hans: '我们会把确认邮件发到这个邮箱，并通过手机联系你做行前确认。',
            en: 'We\u2019ll send your confirmation here and use the phone number for pre-trip updates.',
          })}
        </p>

        <div className="checkout-grid-2">
          <Field
            label={T({ hant: '名字', hans: '名字', en: 'First name' })}
            value={contact.firstName}
            onChange={(v) => onChange({ ...contact, firstName: v })}
            error={errors.firstName}
            autoComplete="given-name"
            required
          />
          <Field
            label={T({ hant: '姓氏', hans: '姓氏', en: 'Last name' })}
            value={contact.lastName}
            onChange={(v) => onChange({ ...contact, lastName: v })}
            error={errors.lastName}
            autoComplete="family-name"
            required
          />
        </div>

        <Field
          label={T({ hant: '電子郵件', hans: '电子邮箱', en: 'Email address' })}
          type="email"
          value={contact.email}
          onChange={(v) => onChange({ ...contact, email: v })}
          error={errors.email}
          autoComplete="email"
          required
        />

        <PhoneField
          countryCode={contact.phoneCountryCode}
          phone={contact.phone}
          onCountry={(code) => onChange({ ...contact, phoneCountryCode: code })}
          onPhone={(v) => onChange({ ...contact, phone: v })}
          error={errors.phone}
          lang={lang}
        />

        <label className="checkout-toggle">
          <input
            type="checkbox"
            checked={contact.marketingOptIn}
            onChange={(e) => onChange({ ...contact, marketingOptIn: e.target.checked })}
          />
          <span>
            {T({
              hant: '寄送行程靈感與優惠（可隨時取消訂閱）',
              hans: '订阅行程灵感与优惠（可随时取消订阅）',
              en: 'Email me with travel inspiration and offers (unsubscribe anytime)',
            })}
          </span>
        </label>

        <div className="checkout-card__actions">
          <span className="checkout-card__hint">
            {T({
              hant: '下一步：填寫供應商需要的訂購問題。',
              hans: '下一步：填写供应商需要的预订问题。',
              en: 'Next: supplier-specific booking questions.',
            })}
          </span>
          <button type="submit" className="checkout-cta-primary">
            {T({ hant: '下一步', hans: '下一步', en: 'Continue' })}
            <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </form>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 2 · Booking questions (dynamic, grouped by scope)
  // ─────────────────────────────────────────────────────────────────
  function QuestionsStep({ state, answers, onAnswer, items, onBack, onNext, lang }) {
    const T = (opts) => pick(lang, opts);
    const grouped = useMemo(() => {
      // Group: contact (skip — captured in Step 1) | participants | supplier
      const buckets = { participants: [], supplier: [], country: [], mixed: [], activity: [] };
      state.questions.forEach((q) => {
        // Skip contact-scope dups (Bókun sometimes returns name/email here too)
        if (q.scope === 'contact') return;
        const key = buckets[q.scope] ? q.scope : 'supplier';
        buckets[key].push(q);
      });
      return buckets;
    }, [state.questions]);

    return (
      <div className="checkout-card">
        <h2 className="checkout-card__title">
          {T({ hant: '預訂問題', hans: '预订问题', en: 'Booking questions' })}
        </h2>
        <p className="checkout-card__lede">
          {T({
            hant: '供應商需要這些資訊以準備你的行程。',
            hans: '供应商需要这些信息以准备你的行程。',
            en: 'Suppliers need this information to prepare your trip.',
          })}
        </p>

        {state.loading && (
          <div className="checkout-state">
            <span className="checkout-state__dot" />
            {T({ hant: '正在向供應商取得問題…', hans: '正在向供应商获取问题…', en: 'Loading supplier questions…' })}
          </div>
        )}

        {!state.loading && state.error && (
          <div className="checkout-state checkout-state--error">
            <Icon name="alert-circle" size={16} />
            {state.error}
          </div>
        )}

        {!state.loading && !state.error && state.questions.length === 0 && (
          <div className="checkout-state checkout-state--ok">
            <Icon name="check-circle" size={16} color="var(--success)" />
            {T({
              hant: '本次預訂沒有額外問題。',
              hans: '本次预订没有额外问题。',
              en: 'No additional questions for this booking.',
            })}
          </div>
        )}

        {!state.loading && state.questions.length > 0 && (
          <>
            {grouped.participants.length > 0 && (
              <QuestionGroup
                title={T({ hant: '旅客資訊', hans: '旅客信息', en: 'Traveler information' })}
                questions={grouped.participants}
                answers={answers}
                onAnswer={onAnswer}
                lang={lang}
              />
            )}
            {grouped.activity.length > 0 && (
              <QuestionGroup
                title={T({ hant: '行程細節', hans: '行程细节', en: 'Activity details' })}
                questions={grouped.activity}
                answers={answers}
                onAnswer={onAnswer}
                lang={lang}
              />
            )}
            {grouped.country.length > 0 && (
              <QuestionGroup
                title={T({ hant: '國籍', hans: '国籍', en: 'Nationality' })}
                questions={grouped.country}
                answers={answers}
                onAnswer={onAnswer}
                lang={lang}
              />
            )}
            {grouped.supplier.length > 0 && (
              <QuestionGroup
                title={T({ hant: '供應商問題', hans: '供应商问题', en: 'Supplier questions' })}
                questions={grouped.supplier}
                answers={answers}
                onAnswer={onAnswer}
                lang={lang}
              />
            )}
            {grouped.mixed.length > 0 && (
              <QuestionGroup
                title={T({ hant: '其他問題', hans: '其他问题', en: 'Other questions' })}
                questions={grouped.mixed}
                answers={answers}
                onAnswer={onAnswer}
                lang={lang}
              />
            )}
          </>
        )}

        {state.source === 'inferred' && (
          <p className="checkout-card__inferred">
            {T({
              hant: '提示：以上問題為系統推斷，完整供應商問題會於 Bókun 付款頁再次確認。',
              hans: '提示：以上问题为系统推断，完整供应商问题会在 Bókun 付款页再次确认。',
              en: 'Heads up: these are inferred. The full supplier questionnaire will be confirmed on Bókun\u2019s payment page.',
            })}
          </p>
        )}

        <div className="checkout-card__actions">
          <button type="button" className="checkout-cta-secondary" onClick={onBack}>
            <Icon name="arrow-left" size={16} />
            {T({ hant: '上一步', hans: '上一步', en: 'Back' })}
          </button>
          <button type="button" className="checkout-cta-primary" onClick={onNext}>
            {T({ hant: '下一步', hans: '下一步', en: 'Continue' })}
            <Icon name="arrow-right" size={16} />
          </button>
        </div>
      </div>
    );
  }

  function QuestionGroup({ title, questions, answers, onAnswer, lang }) {
    return (
      <div className="checkout-question-group">
        <h3 className="checkout-question-group__title">{title}</h3>
        {questions.map((q) => {
          const key = `${q.scope}:${q.id}`;
          return (
            <QuestionField
              key={key}
              q={q}
              value={answers[key] || ''}
              onChange={(v) => onAnswer(key, v)}
              lang={lang}
            />
          );
        })}
      </div>
    );
  }

  function QuestionField({ q, value, onChange, lang }) {
    const T = (opts) => pick(lang, opts);
    const label = `${q.label}${q.required ? ' *' : ''}`;
    const help = q.helpText;

    if (q.type === 'options' || q.type === 'country' || q.type === 'language') {
      return (
        <label className="checkout-field">
          <span className="checkout-field__label">{label}</span>
          <select
            className="checkout-field__select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={q.required}
          >
            <option value="">{T({ hant: '請選擇…', hans: '请选择…', en: 'Select…' })}</option>
            {(q.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {help && <span className="checkout-field__help">{help}</span>}
        </label>
      );
    }

    if (q.type === 'boolean') {
      return (
        <label className="checkout-toggle">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{q.label}{q.required ? ' *' : ''}</span>
        </label>
      );
    }

    if (q.type === 'textarea') {
      return (
        <label className="checkout-field">
          <span className="checkout-field__label">{label}</span>
          <textarea
            className="checkout-field__textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={q.required}
            placeholder={q.placeholder || ''}
            rows={3}
          />
          {help && <span className="checkout-field__help">{help}</span>}
        </label>
      );
    }

    return (
      <Field
        label={label}
        value={value}
        onChange={onChange}
        type={q.type === 'number' || q.type === 'date' || q.type === 'email' || q.type === 'tel' || q.type === 'datetime' ? q.type : 'text'}
        placeholder={q.placeholder || ''}
        helpText={help}
        required={q.required}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Step 3 · Review & payment hand-off
  // ─────────────────────────────────────────────────────────────────
  function ReviewStep({ trip, items, contact, totalUsd, onBack, onSubmit, submitting, error, lang, displayCurrency, fxRates }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div className="checkout-card">
        <h2 className="checkout-card__title">
          {T({ hant: '付款確認', hans: '付款确认', en: 'Payment & confirmation' })}
        </h2>
        <p className="checkout-card__lede">
          {T({
            hant: '按下「前往付款」後，我們會把你導到 Bókun 安全付款頁面完成扣款。',
            hans: '点击「前往付款」后，我们会把你导到 Bókun 安全付款页完成支付。',
            en: 'Press "Continue to payment" to be redirected to Bókun\u2019s secure checkout.',
          })}
        </p>

        <div className="checkout-review-box">
          <div className="checkout-review-box__row">
            <span className="checkout-review-box__label">{T({ hant: '聯絡人', hans: '联系人', en: 'Contact' })}</span>
            <span className="checkout-review-box__value">
              {contact.firstName} {contact.lastName}
              <br />
              <span className="checkout-review-box__sub">{contact.email} · {contact.phoneCountryCode} {contact.phone}</span>
            </span>
          </div>
          <div className="checkout-review-box__row">
            <span className="checkout-review-box__label">{T({ hant: '行程', hans: '行程', en: 'Trip' })}</span>
            <span className="checkout-review-box__value">
              {trip.map((t, i) => (
                <div key={t.id} className="checkout-review-box__item">
                  <span>{t.title}</span>
                  <span>{formatDisplayPrice(checkoutItemPriceUsd(t), displayCurrency, fxRates)}</span>
                </div>
              ))}
            </span>
          </div>
          <div className="checkout-review-box__row checkout-review-box__row--total">
            <span className="checkout-review-box__label">{T({ hant: '預估總計', hans: '预估总计', en: 'Estimated total' })}</span>
            <strong className="checkout-review-box__total">{formatTotalDisplay(totalUsd, displayCurrency, fxRates)}</strong>
          </div>
        </div>

        <div className="checkout-security">
          <Icon name="shield-check" size={16} color="var(--success)" />
          <div>
            <strong>{T({ hant: '由 Bókun 託管付款', hans: '由 Bókun 托管支付', en: 'Hosted by Bókun' })}</strong>
            <span>
              {T({
                hant: '我們不接觸或儲存信用卡資料；交易由 Bókun 與其支付服務商處理。',
                hans: '我们不接触或储存信用卡数据；交易由 Bókun 与其支付服务商处理。',
                en: 'We never touch or store card data — Bókun and its PSP handle the transaction.',
              })}
            </span>
          </div>
        </div>

        {error && (
          <div className="checkout-state checkout-state--error">
            <Icon name="alert-circle" size={16} />
            {error}
          </div>
        )}

        <div className="checkout-card__actions">
          <button type="button" className="checkout-cta-secondary" onClick={onBack} disabled={submitting}>
            <Icon name="arrow-left" size={16} />
            {T({ hant: '上一步', hans: '上一步', en: 'Back' })}
          </button>
          <button type="button" className="checkout-cta-primary" onClick={onSubmit} disabled={submitting}>
            {submitting
              ? T({ hant: '前往中…', hans: '正在跳转…', en: 'Redirecting…' })
              : T({ hant: '前往付款', hans: '前往支付', en: 'Continue to payment' })}
            {!submitting && <Icon name="arrow-right" size={16} />}
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Shared form primitives
  // ─────────────────────────────────────────────────────────────────
  function Field({ label, value, onChange, type = 'text', placeholder, error, helpText, autoComplete, required }) {
    return (
      <label className="checkout-field">
        <span className="checkout-field__label">{label}{required ? ' *' : ''}</span>
        <input
          className={`checkout-field__input${error ? ' is-error' : ''}`}
          type={type}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          autoComplete={autoComplete}
          required={required}
        />
        {helpText && !error && <span className="checkout-field__help">{helpText}</span>}
        {error && <span className="checkout-field__error">{error}</span>}
      </label>
    );
  }

  function PhoneField({ countryCode, phone, onCountry, onPhone, error, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <label className="checkout-field">
        <span className="checkout-field__label">{T({ hant: '手機號碼', hans: '手机号', en: 'Phone number' })} *</span>
        <span className={`checkout-field__phone${error ? ' is-error' : ''}`}>
          <select
            className="checkout-field__country"
            value={countryCode}
            onChange={(e) => onCountry(e.target.value)}
            aria-label={T({ hant: '國碼', hans: '国码', en: 'Country code' })}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
          <input
            className="checkout-field__phone-input"
            type="tel"
            value={phone || ''}
            onChange={(e) => onPhone(e.target.value)}
            placeholder="912 345 678"
            autoComplete="tel"
            required
          />
        </span>
        {error && <span className="checkout-field__error">{error}</span>}
      </label>
    );
  }

  window.AuralisUI.Checkout = Checkout;
})();
