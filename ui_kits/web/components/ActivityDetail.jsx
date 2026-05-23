/* ActivityDetail — full product page from Bókun GET /activity.json/{id}. */

(function () {
  const { useState, useEffect } = React;
  const { Icon, formatDisplayPrice, fakePhoto, pick, proxyImageUrl } = window.AuralisUI;

  /** Reuse list-card proxy size (often cached), then fade in a sharper hero. */
  function DetailHeroImage({ heroUrl, placeholderKey }) {
    const [fastLoaded, setFastLoaded] = useState(false);
    const [hiLoaded, setHiLoaded] = useState(false);

    const fastSrc = heroUrl ? proxyImageUrl(heroUrl, { w: 520, q: 78 }) : null;
    const hiSrc = heroUrl ? proxyImageUrl(heroUrl, { w: 960, q: 82 }) : null;
    const useHiRes = hiSrc && hiSrc !== fastSrc;

    useEffect(() => {
      setFastLoaded(false);
      setHiLoaded(false);
    }, [heroUrl]);

    useEffect(() => {
      if (!useHiRes) return undefined;
      const img = new Image();
      img.onload = () => setHiLoaded(true);
      img.onerror = () => setHiLoaded(false);
      img.src = hiSrc;
      return () => { img.onload = null; img.onerror = null; };
    }, [hiSrc, useHiRes]);

    if (!heroUrl) {
      return (
        <div style={{ position: 'absolute', inset: 0, background: fakePhoto(placeholderKey) }} />
      );
    }

    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--base-100)' }}>
        {!fastLoaded && (
          <div className="tour-card-image-shimmer" aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
            backgroundSize: '200% 100%',
          }} />
        )}
        {fastSrc && (
          <img
            src={fastSrc}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setFastLoaded(true)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              opacity: useHiRes && hiLoaded ? 0 : (fastLoaded ? 1 : 0),
              transition: 'opacity 0.35s var(--ease-out)',
            }}
          />
        )}
        {useHiRes && (
          <img
            src={hiSrc}
            alt=""
            loading="eager"
            decoding="async"
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              opacity: hiLoaded ? 1 : 0,
              transition: 'opacity 0.35s var(--ease-out)',
            }}
          />
        )}
      </div>
    );
  }

  function ActivityDetail({
    tour,
    loading,
    error,
    onBack,
    onAdd,
    inTrip,
    lang,
    displayCurrency = 'USD',
    fxRates = { USD: 1 },
  }) {
    const T = (opts) => pick(lang, opts);

    if (!tour && loading) {
      return <DetailSkeleton onBack={onBack} lang={lang} />;
    }

    if (!tour && error) {
      return (
        <section style={{ padding: '48px 32px', maxWidth: 720, margin: '0 auto' }}>
          <BackButton onBack={onBack} lang={lang} />
          <p style={{ font: '500 15px/1.5 var(--font-text)', color: 'var(--coral)' }}>{error.message}</p>
        </section>
      );
    }

    if (!tour) return null;

    const photos = (tour.photoUrls && tour.photoUrls.length) ? tour.photoUrls : [];
    const heroUrl = photos[0] || tour.coverImageUrl;
    const cancelHrs = tour.availability && tour.cancellationCutoffMinutes != null
      ? Math.round(tour.cancellationCutoffMinutes / 60)
      : null;

    return (
      <div style={{ background: 'var(--bg-page)', minHeight: '100vh', paddingBottom: 100 }}>
        <div className="detail-hero">
          <DetailHeroImage heroUrl={heroUrl} placeholderKey={tour.photo} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(17,21,31,0.15) 0%, rgba(17,21,31,0.55) 100%)',
          }} />
          <div className="auralis-container" style={{ position: 'relative', paddingTop: 24, paddingBottom: 24 }}>
            <BackButton onBack={onBack} lang={lang} light />
          </div>
          {photos.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 8, maxWidth: '90%', overflowX: 'auto', padding: '0 8px',
            }}>
              {photos.slice(0, 6).map((url, i) => (
                <img
                  key={url + i}
                  src={proxyImageUrl(url, { w: 160, q: 75 })}
                  alt=""
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                  style={{
                    width: 72, height: 48, borderRadius: 10, flexShrink: 0,
                    objectFit: 'cover', objectPosition: 'center',
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.8)',
                    background: 'var(--base-100)',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="auralis-container detail-layout" style={{ paddingTop: 32, paddingBottom: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <header>
              {tour.badge && (
                <span style={{
                  display: 'inline-block', marginBottom: 10,
                  padding: '6px 10px', borderRadius: 999,
                  background: tour.badgeKey === 'premium' ? 'var(--gradient-sun)' : '#C6FF3F',
                  font: '700 10px/1 var(--font-text)', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>{tour.badge}</span>
              )}
              <h1 style={{ margin: 0, font: '700 40px/1.08 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.025em' }}>
                {tour.title}
              </h1>
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', color: 'var(--fg-2)', font: '500 14px/1 var(--font-text)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="building-2" size={16} />{tour.supplier}
                </span>
                {tour.duration && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="clock" size={16} />{tour.duration}
                  </span>
                )}
                {tour.rating > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="star" size={16} color="#FFB347" />
                    <b style={{ color: 'var(--fg-1)' }}>{tour.rating}</b>
                    <span>· {tour.reviews.toLocaleString()} {T({ hant: '則評價', hans: '条评价', en: 'reviews' })}</span>
                  </span>
                )}
              </div>
              {loading && (
                <p style={{ marginTop: 12, font: '500 13px/1 var(--font-text)', color: 'var(--fg-3)' }}>
                  {T({ hant: '正在載入完整內容…', hans: '正在加载完整内容…', en: 'Loading full details…' })}
                </p>
              )}
            </header>

            {tour.tags && tour.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tour.tags.map((tag) => (
                  <span key={tag.key} style={{
                    font: '600 12px/1 var(--font-text)', padding: '6px 12px', borderRadius: 999,
                    background: 'var(--base-100)', color: 'var(--fg-2)',
                  }}>{tag.label}</span>
                ))}
              </div>
            )}

            {tour.description && (
              <Section title={T({ hant: '體驗介紹', hans: '体验介绍', en: 'About this experience' })}>
                <p style={{ margin: 0, font: '500 16px/1.65 var(--font-text)', color: 'var(--fg-2)', whiteSpace: 'pre-wrap' }}>
                  {tour.description}
                </p>
              </Section>
            )}

            {tour.stops && tour.stops.length > 0 && (
              <Section title={T({ hant: '行程站點', hans: '行程站点', en: 'Itinerary stops' })}>
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {tour.stops.map((stop, i) => (
                    <li key={stop.id} style={{
                      display: 'flex', gap: 14, alignItems: 'flex-start',
                      padding: 14, borderRadius: 14, background: '#fff', boxShadow: 'var(--shadow-1)',
                    }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: 999, flexShrink: 0,
                        background: 'var(--gradient-aurora-soft)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        font: '700 14px/1 var(--font-display)', color: 'var(--aurora-deep)',
                      }}>{i + 1}</span>
                      <div>
                        <div style={{ font: '600 15px/1.3 var(--font-display)', color: 'var(--fg-1)' }}>{stop.name}</div>
                        {stop.durationMinutes > 0 && (
                          <div style={{ font: '500 12px/1.4 var(--font-text)', color: 'var(--fg-3)', marginTop: 4 }}>
                            {stop.durationMinutes} min
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {tour.meetingPoint && (
              <Section title={T({ hant: '集合地點', hans: '集合地点', en: 'Meeting point' })}>
                <div style={{
                  padding: 16, borderRadius: 14, background: '#fff', boxShadow: 'var(--shadow-1)',
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <Icon name="map-pin" size={20} color="var(--coral)" />
                  <div style={{ font: '500 14px/1.5 var(--font-text)', color: 'var(--fg-2)' }}>
                    <div style={{ font: '600 15px/1.3 var(--font-text)', color: 'var(--fg-1)', marginBottom: 4 }}>
                      {tour.meetingPoint.title || tour.meetingPoint.name || T({ hant: '集合點', hans: '集合点', en: 'Meeting point' })}
                    </div>
                    {tour.meetingPoint.address && <div>{tour.meetingPoint.address}</div>}
                    {tour.meetingPoint.geoPoint && (
                      <div style={{ marginTop: 6, color: 'var(--fg-3)', fontSize: 12 }}>
                        {tour.meetingPoint.geoPoint.latitude?.toFixed(4)}, {tour.meetingPoint.geoPoint.longitude?.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {tour.startTimes && tour.startTimes.length > 0 && (
              <Section title={T({ hant: '出發時段', hans: '出发时段', en: 'Start times' })}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tour.startTimes.map((st, i) => {
                    const label = st.label || (st.hour != null
                      ? `${String(st.hour).padStart(2, '0')}:${String(st.minute || 0).padStart(2, '0')}`
                      : null);
                    if (!label) return null;
                    return (
                      <span key={i} style={{
                        padding: '8px 14px', borderRadius: 999, background: 'var(--base-100)',
                        font: '600 13px/1 var(--font-text)', color: 'var(--fg-1)',
                      }}>{label}</span>
                    );
                  })}
                </div>
              </Section>
            )}

            {tour.languages && tour.languages.length > 0 && (
              <Section title={T({ hant: '導覽語言', hans: '导览语言', en: 'Guide languages' })}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tour.languages.map((l) => (
                    <span key={l} style={{
                      padding: '6px 12px', borderRadius: 999, background: '#D6F7E8',
                      font: '600 12px/1 var(--font-text)', color: '#0A7B4F',
                    }}>{l}</span>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <aside className="detail-sticky-book">
            <div style={{
              background: '#fff', borderRadius: 24, padding: 24,
              boxShadow: 'var(--shadow-3)',
            }}>
              <div style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {T({ hant: '每人起價', hans: '每人起价', en: 'From per person' })}
              </div>
              <div style={{ font: '700 36px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em', marginTop: 8 }}>
                {formatDisplayPrice(tour.priceUsd ?? tour.price, displayCurrency, fxRates)}
              </div>

              {tour.priceTable && tour.priceTable.length > 1 && (
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ font: '600 12px/1 var(--font-text)', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {T({ hant: '票種', hans: '票种', en: 'Ticket types' })}
                  </div>
                  {tour.priceTable.map((row) => (
                    <div key={row.categoryId} style={{ display: 'flex', justifyContent: 'space-between', font: '500 14px/1 var(--font-text)' }}>
                      <span style={{ color: 'var(--fg-2)' }}>{row.label}</span>
                      <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>
                        {formatDisplayPrice(row.amount, displayCurrency, fxRates)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {cancelHrs != null && cancelHrs > 0 && (
                <div style={{
                  marginTop: 18, padding: 12, borderRadius: 12, background: 'var(--gradient-aurora-soft)',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <Icon name="shield-check" size={18} color="var(--aurora-deep)" />
                  <span style={{ font: '500 13px/1.45 var(--font-text)', color: 'var(--fg-2)' }}>
                    {T({
                      hant: `出發 ${cancelHrs} 小時前可免費取消`,
                      hans: `出发 ${cancelHrs} 小时前可免费取消`,
                      en: `Free cancellation up to ${cancelHrs} h before departure`,
                    })}
                  </span>
                </div>
              )}

              <button type="button" onClick={() => onAdd && onAdd(tour)} disabled={inTrip}
                      style={{
                        width: '100%', height: 52, marginTop: 22, borderRadius: 16, border: 0,
                        cursor: inTrip ? 'default' : 'pointer',
                        background: inTrip ? 'var(--success-soft)' : 'var(--gradient-aurora)',
                        color: inTrip ? '#0A7B4F' : '#062F2A',
                        font: '700 15px/1 var(--font-text)',
                        boxShadow: inTrip ? 'none' : 'var(--shadow-glow-aurora)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                {inTrip
                  ? <><Icon name="check" size={18} /> {T({ hant: '已在行程中', hans: '已在行程中', en: 'In your trip' })}</>
                  : <>{T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' })} <Icon name="plus" size={18} /></>}
              </button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function Section({ title, children }) {
    return (
      <section>
        <h2 style={{ margin: '0 0 14px', font: '600 20px/1.2 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
          {title}
        </h2>
        {children}
      </section>
    );
  }

  function BackButton({ onBack, lang, light }) {
    const T = (opts) => pick(lang, opts);
    return (
      <button type="button" onClick={onBack} style={{
        border: 0, cursor: 'pointer', background: light ? 'rgba(255,255,255,0.85)' : 'var(--base-100)',
        backdropFilter: light ? 'blur(12px)' : 'none',
        height: 40, padding: '0 16px', borderRadius: 999,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        font: '600 13px/1 var(--font-text)',
        color: light ? 'var(--fg-1)' : 'var(--fg-2)',
        boxShadow: 'var(--shadow-1)',
      }}>
        <Icon name="arrow-left" size={16} />
        {T({ hant: '返回', hans: '返回', en: 'Back' })}
      </button>
    );
  }

  function DetailSkeleton({ onBack, lang }) {
    return (
      <div style={{ padding: 32 }}>
        <BackButton onBack={onBack} lang={lang} />
        <div style={{ marginTop: 24, height: 320, borderRadius: 24, background: 'var(--base-100)' }} />
      </div>
    );
  }

  window.AuralisUI.ActivityDetail = ActivityDetail;
})();
