/* TripPanel — fixed right-side itinerary panel and full-bleed map view. */

(function () {
  const { Icon, formatDisplayPrice, formatTotalDisplay, tripTotalUsd, pick } = window.AuralisUI;

  // --- Iceland silhouette + pins -------------------------------------------------
  const ICELAND_PATH = "M120 320 Q 100 250 160 200 Q 200 160 280 170 Q 340 130 420 145 Q 510 110 600 150 Q 690 130 770 180 Q 850 200 890 260 Q 920 320 870 380 Q 830 430 740 440 Q 670 470 580 450 Q 500 480 420 470 Q 340 490 260 460 Q 180 440 140 390 Z";

  // Project (lat, lng) → SVG (x, y) for our 1000×600 viewBox.
  // Bbox tuned so points land inside the decorative silhouette path above.
  const PROJ = {
    lngMin: -24.5, lngMax: -13.5,   // → x 80..920 (width 840)
    latMin:  63.0, latMax:  67.0,   // → y 470..130 (inverted; height 340)
    xMin: 80, xMax: 920,
    yMin: 130, yMax: 470,
  };
  function project(lat, lng) {
    const x = PROJ.xMin + (lng - PROJ.lngMin) / (PROJ.lngMax - PROJ.lngMin) * (PROJ.xMax - PROJ.xMin);
    const y = PROJ.yMin + (PROJ.latMax - lat) / (PROJ.latMax - PROJ.latMin) * (PROJ.yMax - PROJ.yMin);
    return { x, y };
  }

  // Each trip activity plots ONE pin (the first stop, or meetingPoint as fallback).
  // Day number is the activity's position in the trip array.
  function deriveTripPins(trip) {
    const palette = [
      ['#2EFFB8', '#00D5FF'],
      ['#00D5FF', '#6B2FE6'],
      ['#FF7A2E', '#B331E2'],
      ['#FF5A6A', '#FF7A2E'],
      ['#C6FF3F', '#2EFFB8'],
      ['#B331E2', '#FF5A6A'],
      ['#FFB347', '#FF7A2E'],
    ];
    return trip.map((vm, i) => {
      const stop = vm.stops && vm.stops[0];
      const geo = stop?.geo || vm.raw?.meetingPoint?.geoPoint;
      if (!geo) return null;
      const { x, y } = project(geo.latitude, geo.longitude);
      const [c1, c2] = palette[i % palette.length];
      return { id: vm.id, x, y, day: i + 1, name: stop?.name || vm.title, c1, c2 };
    }).filter(Boolean);
  }

  function MapPanel({ children, lang = 'hant', trip = [] }) {
    const pins = deriveTripPins(trip);
    return (
      <div
        className="trip-map-shell"
        style={{
          background:
            'radial-gradient(60% 80% at 20% 30%, rgba(46,255,184,0.4) 0%, transparent 60%),' +
            'radial-gradient(55% 70% at 80% 20%, rgba(0,213,255,0.4) 0%, transparent 60%),' +
            'radial-gradient(70% 90% at 60% 90%, rgba(107,47,230,0.3) 0%, transparent 60%),' +
            'var(--brand-panel)',
        }}
      >
        {/* SVG map */}
        <svg className="trip-map-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
          {/* grid lines */}
          <g opacity="0.18" stroke="#11151F" strokeWidth="0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={'h'+i} x1="0" y1={i*50} x2="1000" y2={i*50}/>
            ))}
            {Array.from({ length: 20 }, (_, i) => (
              <line key={'v'+i} x1={i*50} y1="0" x2={i*50} y2="600"/>
            ))}
          </g>
          {/* Iceland body */}
          <path d={ICELAND_PATH} fill="rgba(255,255,255,0.78)" stroke="rgba(11,21,31,0.18)" strokeWidth="1.5"/>
          {/* Ring road */}
          <path d="M 200 280 Q 320 220 460 230 Q 580 260 660 290 Q 760 330 820 380 Q 800 420 720 430 Q 600 460 480 440 Q 360 430 260 400 Q 220 360 200 280 Z"
                fill="none" stroke="rgba(0,213,255,0.55)" strokeWidth="2.5" strokeDasharray="6 8"/>
          {/* Pin lines */}
          {pins.map((p, i) => {
            const next = pins[i + 1];
            if (!next) return null;
            return (
              <line key={'l'+p.id} x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                    stroke="rgba(107,47,230,0.5)" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round"/>
            );
          })}
          {/* Pins */}
          {pins.map(p => (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <defs>
                <linearGradient id={`pg-${p.id}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={p.c1}/>
                  <stop offset="1" stopColor={p.c2}/>
                </linearGradient>
              </defs>
              <circle r="20" fill={`url(#pg-${p.id})`} stroke="#fff" strokeWidth="3"
                      filter="drop-shadow(0 4px 10px rgba(0,0,0,0.25))"/>
              <text x="0" y="6" textAnchor="middle" fill="#fff"
                    fontFamily="Sora, system-ui" fontSize="18" fontWeight="700">{p.day}</text>
              <text x="0" y="42" textAnchor="middle" fill="#11151F"
                    fontFamily="Sora, 'Noto Sans TC', 'Noto Sans SC', system-ui" fontSize="13" fontWeight="600"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.9)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                {p.name}
              </text>
            </g>
          ))}
        </svg>

        {/* Children (overlay panels) sit on top */}
        <div className="trip-map-inner">
          {children}
        </div>
      </div>
    );
  }

  // --- Itinerary side panel -----------------------------------------------------
  // `trip` is an array of TourViewModel objects (already localised by the adapter).
  function TripPanel({ trip, onRemove, onCheckout, lang, displayCurrency = 'USD', fxRates = { USD: 1 } }) {
    const T = (opts) => pick(lang, opts);
    const totalUsd = tripTotalUsd(trip);
    const tripTitle = trip.length === 0
      ? T({ hant: '我的行程', hans: '我的行程', en: 'My itinerary' })
      : T({
          hant: `${trip.length} 個體驗`,
          hans: `${trip.length} 个体验`,
          en: `${trip.length} experience${trip.length === 1 ? '' : 's'}`,
        });

    function tripItemPriceUsd(item) {
      const selected = Number(item.tripPricing && item.tripPricing.totalUsd);
      if (Number.isFinite(selected) && selected > 0) return selected;
      return Number(item.priceUsd ?? item.price) || 0;
    }

    return (
      <div className="glass trip-panel">
        <div>
          <span className="overline" style={{ color: 'var(--coral)' }}>
            {T({ hant: '我的行程', hans: '我的行程', en: 'My itinerary' })}
          </span>
          <h3 style={{ margin: '6px 0 0', font: '700 26px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            {tripTitle}
          </h3>
          {trip.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 8, color: 'var(--fg-3)', font: '500 12px/1 var(--font-text)' }}>
              <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Icon name="calendar" size={12} />
                {trip.some((item) => item.tripDate)
                  ? T({ hant: '已儲存預訂偏好', hans: '已保存预订偏好', en: 'Booking preferences saved' })
                  : T({ hant: '日期待選', hans: '日期待选', en: 'Dates not set' })}
              </span>
            </div>
          )}
        </div>

        {/* Day-by-day */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trip.length === 0 ? (
            <div className="trip-panel-empty">
              {T({
                hant: '行程還是一張白紙。加入第一個體驗開始規劃。',
                hans: '行程还是一张白纸。加入第一个体验开始规划。',
                en:   'Your itinerary is a blank canvas. Add a tour to begin.',
              })}
            </div>
          ) : (
            trip.map((t, i) => {
              const colors = ['#2EFFB8', '#00D5FF', '#6B2FE6', '#FF7A2E', '#FF5A6A'];
              const c = colors[i % colors.length];
              return (
                <div key={t.id} className="trip-item" style={{ '--trip-accent': c }}>
                  <div className="trip-item__accent" />
                  <div className="trip-item__day">
                    <span className="trip-item__day-label">
                      {T({ hant: '第', hans: '第', en: 'Day' })}
                    </span>
                    <span className="trip-item__day-num">{i + 1}</span>
                  </div>
                  <div className="trip-item__body">
                    <div className="trip-item__title">{t.title}</div>
                    <div className="trip-item__meta">
                      {t.supplier} · {t.duration}
                    </div>
                    {(t.tripDate || t.tripGuests || t.tripExtras?.length > 0) && (
                      <div style={{ marginTop: 6, font: '500 12px/1.45 var(--font-text)', color: 'var(--fg-3)' }}>
                        {[
                          t.tripDate || null,
                          t.tripStartTimeLabel || null,
                          t.tripGuests
                            ? T({
                                hant: `${t.tripGuests.adults + t.tripGuests.children} 位`,
                                hans: `${t.tripGuests.adults + t.tripGuests.children} 位`,
                                en: `${t.tripGuests.adults + t.tripGuests.children} travelers`,
                              })
                            : null,
                          t.tripPickupTitle
                            ? T({ hant: `接送：${t.tripPickupTitle}`, hans: `接送：${t.tripPickupTitle}`, en: `Pickup: ${t.tripPickupTitle}` })
                            : null,
                          t.tripExtras?.length
                            ? T({
                                hant: `加購 ${t.tripExtras.length} 項`,
                                hans: `加购 ${t.tripExtras.length} 项`,
                                en: `${t.tripExtras.length} extras`,
                              })
                            : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="trip-item__aside">
                    <span className="trip-item__price">
                      {formatDisplayPrice(tripItemPriceUsd(t), displayCurrency, fxRates)}
                    </span>
                    {t.tripPricing?.source === 'estimate' && (
                      <span style={{ marginTop: 4, font: '500 11px/1.3 var(--font-text)', color: 'var(--fg-3)' }}>
                        {T({ hant: '預估價', hans: '预估价', en: 'Estimate' })}
                      </span>
                    )}
                    <button type="button" className="trip-item__remove" onClick={() => onRemove(t.id)}>
                      <Icon name="x" size={11} />{T({ hant: '移除', hans: '移除', en: 'remove' })}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Total + CTA */}
        <div className="trip-panel-footer">
          <div className="trip-panel-total">
            <span className="trip-panel-total-label">
              {T({ hant: '總計', hans: '总计', en: 'Total' })}
            </span>
            <span className="trip-panel-total-value">
              {formatTotalDisplay(totalUsd, displayCurrency, fxRates)}
            </span>
          </div>
          <button type="button" className="trip-panel-cta" onClick={onCheckout} disabled={trip.length === 0}>
            {T({ hant: '前往結帳', hans: '前往结账', en: 'Continue to checkout' })}
            <Icon name="arrow-right" size={18} />
          </button>
          <div className="trip-panel-trust">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="wallet" size={12} />
              {T({ hant: '一筆交易', hans: '一笔交易', en: 'One transaction' })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  window.AuralisUI.MapPanel = MapPanel;
  window.AuralisUI.TripPanel = TripPanel;
})();
