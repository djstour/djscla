/* TripPanel — fixed right-side itinerary panel and full-bleed map view. */

(function () {
  const { Icon, formatPrice, formatTotalAmount, pick } = window.AuralisUI;

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
      <div style={{
        position: 'relative', minHeight: 720, overflow: 'hidden',
        background:
          'radial-gradient(60% 80% at 20% 30%, rgba(46,255,184,0.4) 0%, transparent 60%),' +
          'radial-gradient(55% 70% at 80% 20%, rgba(0,213,255,0.4) 0%, transparent 60%),' +
          'radial-gradient(70% 90% at 60% 90%, rgba(107,47,230,0.3) 0%, transparent 60%),' +
          'linear-gradient(135deg, #DBF7FF 0%, #E8E2FF 60%, #FFD3A8 100%)',
      }}>
        {/* SVG map */}
        <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice"
             style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
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
        <div style={{ position: 'relative', padding: 32, display: 'flex', gap: 24, minHeight: 720 }}>
          {children}
        </div>
      </div>
    );
  }

  // --- Itinerary side panel -----------------------------------------------------
  // `trip` is an array of TourViewModel objects (already localised by the adapter).
  function TripPanel({ trip, onRemove, onCheckout, lang }) {
    const T = (opts) => pick(lang, opts);
    const total = trip.reduce((s, t) => s + t.price, 0);

    return (
      <div className="glass" style={{
        width: 420, padding: 24, borderRadius: 28,
        display: 'flex', flexDirection: 'column', gap: 16,
        alignSelf: 'flex-start',
      }}>
        <div>
          <span className="overline" style={{ color: 'var(--coral)' }}>
            {T({ hant: '我的行程', hans: '我的行程', en: 'My itinerary' })}
          </span>
          <h3 style={{ margin: '6px 0 0', font: '700 26px/1.05 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            {T({ hant: '南岸自駕 7 日', hans: '南岸自驾 7 日', en: 'South-coast self-drive · 7 days' })}
          </h3>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, color: 'var(--fg-3)', font: '500 12px/1 var(--font-text)' }}>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="calendar" size={12} />12 → 19 Mar 2026
            </span>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Icon name="users" size={12} />{T({ hant: '2 位旅人', hans: '2 位旅客', en: '2 adults' })}
            </span>
          </div>
        </div>

        {/* Day-by-day */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trip.length === 0 ? (
            <div style={{
              padding: '32px 16px', textAlign: 'center',
              background: 'rgba(255,255,255,0.5)', borderRadius: 16, border: '1.5px dashed rgba(20,30,60,0.18)',
              color: 'var(--fg-3)', font: '500 13px/1.5 var(--font-text)',
            }}>
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
                <div key={t.id} style={{
                  display: 'flex', gap: 12, alignItems: 'center',
                  background: '#fff', borderRadius: 14, padding: '10px 12px',
                  boxShadow: 'var(--shadow-1)', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', inset: 0, left: 0, width: 4, background: c }}/>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: c + '22', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ font: '500 9px/1 var(--font-text)', letterSpacing: '0.1em', color: 'var(--fg-3)', textTransform: 'uppercase' }}>
                      {T({ hant: '第', hans: '第', en: 'Day' })}
                    </span>
                    <span style={{ font: '700 18px/1 var(--font-display)', color: 'var(--fg-1)' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 13px/1.25 var(--font-display)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                    <div style={{ font: '400 11px/1.3 var(--font-text)', color: 'var(--fg-3)' }}>
                      {t.supplier} · {t.duration}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ font: '700 13px/1 var(--font-display)', color: 'var(--fg-1)' }}>{formatPrice(t.price, t.priceCurrency)}</span>
                    <button onClick={() => onRemove(t.id)}
                            style={{ border: 0, background: 'transparent', color: 'var(--fg-4)', cursor: 'pointer', font: '500 11px/1 var(--font-text)', display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                      <Icon name="x" size={11} />{T({ hant: '移除', hans: '移除', en: 'remove' })}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Total + CTA */}
        <div style={{ marginTop: 4, paddingTop: 16, borderTop: '1px solid rgba(20,30,60,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ font: '500 13px/1 var(--font-text)', color: 'var(--fg-3)' }}>
              {T({ hant: '總計', hans: '总计', en: 'Total' })}
            </span>
            <span style={{ font: '700 28px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>{formatTotalAmount(trip, total, lang)}</span>
          </div>
          <button onClick={onCheckout} disabled={trip.length === 0}
                  style={{
                    width: '100%', height: 52, borderRadius: 16, border: 0,
                    cursor: trip.length === 0 ? 'not-allowed' : 'pointer',
                    background: trip.length === 0 ? 'var(--base-200)' : 'var(--gradient-aurora)',
                    color: trip.length === 0 ? 'var(--fg-4)' : '#062F2A',
                    boxShadow: trip.length === 0 ? 'none' : 'var(--shadow-glow-aurora)',
                    font: '700 15px/1 var(--font-text)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
            {T({ hant: '前往結帳', hans: '前往结账', en: 'Continue to checkout' })}
            <Icon name="arrow-right" size={18} />
          </button>
          <div style={{ marginTop: 10, display: 'flex', gap: 12, justifyContent: 'center', color: 'var(--fg-3)', font: '500 11px/1 var(--font-text)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="shield-check" size={12} color="var(--success)" />
              {T({ hant: '24 小時免費取消', hans: '24 小时免费取消', en: 'Free cancel 24 h' })}
            </span>
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
