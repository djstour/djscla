/* ActivityDetail — full product page from Bókun GET /activity.json/{id}. */

(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const {
    Icon, formatDisplayPrice, fakePhoto, pick, proxyImageUrl,
    useResponsiveImageProfile, useMobileViewport,
  } = window.AuralisUI;

  const DESC_PREVIEW_CHARS = 320;
  const MOBILE_STOPS_PREVIEW = 3;
  const COMPACT_HEADER_SCROLL = 180;

  function mapsSearchUrl(meetingPoint) {
    if (!meetingPoint) return null;
    const { geoPoint, address, title, name } = meetingPoint;
    const lat = geoPoint?.latitude;
    const lng = geoPoint?.longitude;
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    }
    const q = address || title || name;
    if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    return null;
  }

  /** Prefer catalog price; fall back to cheapest ticket row while detail loads. */
  function resolvePriceUsd(tour) {
    const direct = Number(tour.priceUsd ?? tour.price);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const rows = tour.priceTable || [];
    const amounts = rows
      .map((r) => Number(r.amount))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (amounts.length) return Math.min(...amounts);
    return null;
  }

  function cancelLabel(cancelHrs, T) {
    if (cancelHrs == null || cancelHrs <= 0) return null;
    return T({
      hant: `出發 ${cancelHrs} 小時前可免費取消`,
      hans: `出发 ${cancelHrs} 小时前可免费取消`,
      en: `Free cancellation up to ${cancelHrs} h before departure`,
    });
  }

  /** Reuse list-card proxy size (often cached), then fade in a sharper hero on desktop. */
  function DetailHeroImage({ heroUrl, placeholderKey }) {
    const profile = useResponsiveImageProfile();
    const [fastLoaded, setFastLoaded] = useState(false);
    const [hiLoaded, setHiLoaded] = useState(false);

    const fastSrc = heroUrl ? proxyImageUrl(heroUrl, profile.heroFast) : null;
    const hiSrc = profile.heroHi && heroUrl ? proxyImageUrl(heroUrl, profile.heroHi) : null;
    const useHiRes = !!(hiSrc && hiSrc !== fastSrc);

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
    const imgProfile = useResponsiveImageProfile();
    const isMobile = useMobileViewport();
    const [activePhoto, setActivePhoto] = useState(0);
    const [compactHeader, setCompactHeader] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [stopsExpanded, setStopsExpanded] = useState(false);
    const [priceSheetOpen, setPriceSheetOpen] = useState(false);
    const touchStart = useRef({ x: 0, y: 0 });

    const galleryPhotos = tour
      ? ((tour.photoUrls && tour.photoUrls.length)
        ? tour.photoUrls
        : (tour.coverImageUrl ? [tour.coverImageUrl] : []))
      : [];

    useEffect(() => {
      setActivePhoto(0);
      setDescExpanded(false);
      setStopsExpanded(false);
      setPriceSheetOpen(false);
      setCompactHeader(false);
    }, [tour && tour.id, galleryPhotos.length]);

    useEffect(() => {
      const onScroll = () => setCompactHeader(window.scrollY > COMPACT_HEADER_SCROLL);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, [tour && tour.id]);

    useEffect(() => {
      if (!priceSheetOpen) return undefined;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }, [priceSheetOpen]);

    const goPhoto = useCallback((delta) => {
      if (galleryPhotos.length < 2) return;
      setActivePhoto((i) => {
        const next = i + delta;
        if (next < 0) return galleryPhotos.length - 1;
        if (next >= galleryPhotos.length) return 0;
        return next;
      });
    }, [galleryPhotos.length]);

    const onHeroTouchStart = (e) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onHeroTouchEnd = (e) => {
      if (galleryPhotos.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      goPhoto(dx < 0 ? 1 : -1);
    };

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

    const safeIndex = Math.min(activePhoto, Math.max(0, galleryPhotos.length - 1));
    const heroUrl = galleryPhotos[safeIndex] || tour.coverImageUrl;
    const cancelHrs = tour.availability && tour.cancellationCutoffMinutes != null
      ? Math.round(tour.cancellationCutoffMinutes / 60)
      : null;
    const cancelText = cancelLabel(cancelHrs, T);
    const hasMultiPrice = tour.priceTable && tour.priceTable.length > 1;
    const stopsNamed = (tour.stops || []).filter((s) => s.name);
    const stopsHidden = isMobile && !stopsExpanded && stopsNamed.length > MOBILE_STOPS_PREVIEW;
    const stopsVisible = stopsHidden
      ? stopsNamed.slice(0, MOBILE_STOPS_PREVIEW)
      : stopsNamed;
    const descNeedsCollapse = tour.description && tour.description.length > DESC_PREVIEW_CHARS;
    const descPreview = descNeedsCollapse && !descExpanded
      ? `${tour.description.slice(0, DESC_PREVIEW_CHARS).trim()}…`
      : tour.description;
    const mapsUrl = mapsSearchUrl(tour.meetingPoint);

    const anchorItems = [
      tour.description && { id: 'detail-about', label: T({ hant: '介紹', hans: '介绍', en: 'About' }) },
      stopsNamed.length > 0 && { id: 'detail-stops', label: T({ hant: '站點', hans: '站点', en: 'Stops' }) },
      tour.meetingPoint && { id: 'detail-meeting', label: T({ hant: '集合', hans: '集合', en: 'Meet' }) },
      tour.startTimes && tour.startTimes.length > 0 && { id: 'detail-times', label: T({ hant: '時段', hans: '时段', en: 'Times' }) },
    ].filter(Boolean);

    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    return (
      <div className="detail-page">
        <header
          className={`detail-mini-header${compactHeader ? ' is-visible' : ''}`}
          aria-hidden={!compactHeader}
        >
          <button type="button" className="detail-mini-header__back" onClick={onBack} aria-label={T({ hant: '返回', hans: '返回', en: 'Back' })}>
            <Icon name="arrow-left" size={18} />
          </button>
          <h1 className="detail-mini-header__title">{tour.title}</h1>
        </header>

        <div
          className="detail-hero"
          onTouchStart={onHeroTouchStart}
          onTouchEnd={onHeroTouchEnd}
        >
          <DetailHeroImage heroUrl={heroUrl} placeholderKey={tour.photo} />
          <div className="detail-hero-scrim" aria-hidden="true" />
          <div className="auralis-container detail-hero-top">
            <BackButton onBack={onBack} lang={lang} light className="detail-hero-back" />
          </div>
          {galleryPhotos.length > 1 && (
            <>
              <div className="detail-hero-counter" aria-live="polite">
                {safeIndex + 1} / {galleryPhotos.length}
              </div>
              <div
                className="detail-photo-strip"
                role="tablist"
                aria-label={T({ hant: '行程照片', hans: '行程照片', en: 'Tour photos' })}
              >
                {galleryPhotos.slice(0, isMobile ? 8 : 8).map((url, i) => {
                  const selected = safeIndex === i;
                  return (
                    <button
                      key={url + i}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-label={T({
                        hant: `照片 ${i + 1}`,
                        hans: `照片 ${i + 1}`,
                        en: `Photo ${i + 1}`,
                      })}
                      className={`detail-photo-thumb-btn${selected ? ' is-selected' : ''}`}
                      onClick={() => setActivePhoto(i)}
                    >
                      <img
                        src={proxyImageUrl(url, imgProfile.gallery)}
                        alt=""
                        loading={i === 0 || i === safeIndex ? 'eager' : 'lazy'}
                        decoding="async"
                        draggable={false}
                        className="detail-photo-thumb"
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="auralis-container detail-layout">
          <div className="detail-main">
            <header className="detail-header">
              {tour.badge && (
                <span className={`detail-badge${tour.badgeKey === 'premium' ? ' detail-badge--premium' : ''}`}>
                  {tour.badge}
                </span>
              )}
              <h1 className="detail-page-title">{tour.title}</h1>
              <div className="detail-meta">
                {tour.rating > 0 && (
                  <span className="detail-meta__item detail-meta__item--rating">
                    <Icon name="star" size={16} color="#FFB347" />
                    <b>{tour.rating}</b>
                    <span className="detail-meta__reviews">
                      {tour.reviews.toLocaleString()} {T({ hant: '則評價', hans: '条评价', en: 'reviews' })}
                    </span>
                  </span>
                )}
                {tour.duration && (
                  <span className="detail-meta__item">
                    <Icon name="clock" size={16} />
                    {tour.duration}
                  </span>
                )}
                {tour.supplier && (
                  <span className="detail-meta__item detail-meta__item--supplier">
                    <Icon name="building-2" size={16} />
                    <span className="detail-meta__ellipsis">{tour.supplier}</span>
                  </span>
                )}
              </div>
              {loading && (
                <p className="detail-loading-hint">
                  {T({ hant: '正在載入完整內容…', hans: '正在加载完整内容…', en: 'Loading full details…' })}
                </p>
              )}
            </header>

            {isMobile && anchorItems.length > 1 && (
              <nav className="detail-anchor-nav" aria-label={T({ hant: '頁面章節', hans: '页面章节', en: 'Page sections' })}>
                {anchorItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="detail-anchor-nav__chip"
                    onClick={() => scrollToSection(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            )}

            {tour.tags && tour.tags.length > 0 && (
              <div className="detail-tags">
                {tour.tags.map((tag) => (
                  <span key={tag.key} className="detail-tag">{tag.label}</span>
                ))}
              </div>
            )}

            {(tour.description || loading) && (
              <Section
                id="detail-about"
                title={T({ hant: '體驗介紹', hans: '体验介绍', en: 'About this experience' })}
              >
                {tour.description ? (
                  <>
                    <p className={`detail-description${descNeedsCollapse && !descExpanded ? ' is-clamped' : ''}`}>
                      {descPreview}
                    </p>
                    {descNeedsCollapse && (
                      <button
                        type="button"
                        className="detail-description-toggle"
                        onClick={() => setDescExpanded((v) => !v)}
                        aria-expanded={descExpanded}
                      >
                        {descExpanded
                          ? T({ hant: '收合', hans: '收起', en: 'Show less' })
                          : T({ hant: '閱讀全文', hans: '阅读全文', en: 'Read more' })}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="detail-description-skeleton" aria-hidden="true">
                    {[0.92, 1, 0.78, 0.55].map((w, i) => (
                      <div key={i} className="tour-card-image-shimmer" style={{ width: `${w * 100}%` }} />
                    ))}
                  </div>
                )}
              </Section>
            )}

            {stopsNamed.length > 0 && (
              <Section
                id="detail-stops"
                title={T({ hant: '行程站點', hans: '行程站点', en: 'Itinerary stops' })}
              >
                <ol className="detail-stops-list">
                  {stopsVisible.map((stop, i) => (
                    <li key={stop.id} className="detail-stop">
                      <span className="detail-stop__num">{i + 1}</span>
                      <div>
                        <div className="detail-stop__name">{stop.name}</div>
                        {stop.durationMinutes > 0 && (
                          <div className="detail-stop__dur">{stop.durationMinutes} min</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                {stopsHidden && (
                  <button
                    type="button"
                    className="detail-stops-more"
                    onClick={() => setStopsExpanded(true)}
                  >
                    {T({
                      hant: `還有 ${stopsNamed.length - MOBILE_STOPS_PREVIEW} 個站點`,
                      hans: `还有 ${stopsNamed.length - MOBILE_STOPS_PREVIEW} 个站点`,
                      en: `${stopsNamed.length - MOBILE_STOPS_PREVIEW} more stops`,
                    })}
                  </button>
                )}
              </Section>
            )}

            {tour.meetingPoint && (
              <Section
                id="detail-meeting"
                title={T({ hant: '集合地點', hans: '集合地点', en: 'Meeting point' })}
              >
                <div className="detail-meeting">
                  <Icon name="map-pin" size={20} color="var(--coral)" />
                  <div className="detail-meeting__body">
                    <div className="detail-meeting__title">
                      {tour.meetingPoint.title || tour.meetingPoint.name || T({ hant: '集合點', hans: '集合点', en: 'Meeting point' })}
                    </div>
                    {tour.meetingPoint.address && (
                      <div className="detail-meeting__address">{tour.meetingPoint.address}</div>
                    )}
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="detail-meeting__maps"
                      >
                        <Icon name="external-link" size={14} />
                        {T({ hant: '在地圖中開啟', hans: '在地图中打开', en: 'Open in Maps' })}
                      </a>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {tour.startTimes && tour.startTimes.length > 0 && (
              <Section
                id="detail-times"
                title={T({ hant: '出發時段', hans: '出发时段', en: 'Start times' })}
              >
                <div className="detail-chips">
                  {tour.startTimes.map((st, i) => {
                    const label = st.label || (st.hour != null
                      ? `${String(st.hour).padStart(2, '0')}:${String(st.minute || 0).padStart(2, '0')}`
                      : null);
                    if (!label) return null;
                    return <span key={i} className="detail-chip">{label}</span>;
                  })}
                </div>
              </Section>
            )}

            {tour.languages && tour.languages.length > 0 && (
              <Section title={T({ hant: '導覽語言', hans: '导览语言', en: 'Guide languages' })}>
                <div className="detail-chips">
                  {tour.languages.map((l) => (
                    <span key={l} className="detail-chip detail-chip--lang">{l}</span>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <BookPanel
            tour={tour}
            T={T}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
            priceUsd={resolvePriceUsd(tour)}
            loading={loading}
            cancelText={cancelText}
            hasMultiPrice={hasMultiPrice}
            inTrip={inTrip}
            onAdd={onAdd}
            isMobile={isMobile}
            onOpenPrices={() => setPriceSheetOpen(true)}
          />
        </div>

        {priceSheetOpen && hasMultiPrice && (
          <PriceSheet
            tour={tour}
            T={T}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
            onClose={() => setPriceSheetOpen(false)}
          />
        )}
      </div>
    );
  }

  function BookPanel({
    tour, T, displayCurrency, fxRates, priceUsd, loading, cancelText, hasMultiPrice, inTrip, onAdd, isMobile, onOpenPrices,
  }) {
    const priceLabel = priceUsd != null
      ? formatDisplayPrice(priceUsd, displayCurrency, fxRates)
      : (loading
        ? '…'
        : T({ hant: '價格載入中', hans: '价格加载中', en: 'Price loading' }));

    return (
      <aside
        className="detail-sticky-book"
        role="complementary"
        aria-label={T({ hant: '預訂', hans: '预订', en: 'Booking' })}
      >
        <div className="detail-sticky-book__card">
          <div className="detail-book-summary">
            <div className="detail-book-label">
              {T({ hant: '每人起價', hans: '每人起价', en: 'From per person' })}
            </div>
            <div className={`detail-book-price${priceUsd == null && loading ? ' is-loading' : ''}`}>
              {priceLabel}
            </div>
            {isMobile && cancelText && (
              <p className="detail-book-trust">
                <Icon name="shield-check" size={14} color="var(--aurora-deep)" />
                {cancelText}
              </p>
            )}
            {isMobile && hasMultiPrice && (
              <button type="button" className="detail-book-prices-link" onClick={onOpenPrices}>
                {T({ hant: '查看票價', hans: '查看票价', en: 'View ticket prices' })}
              </button>
            )}
          </div>

          {hasMultiPrice && (
            <div className="detail-book-extra detail-book-extra--desktop">
              <div className="detail-book-extra__title">
                {T({ hant: '票種', hans: '票种', en: 'Ticket types' })}
              </div>
              <PriceRows tour={tour} displayCurrency={displayCurrency} fxRates={fxRates} />
            </div>
          )}

          {cancelText && (
            <div className="detail-book-extra detail-book-extra--desktop detail-book-cancel">
              <Icon name="shield-check" size={18} color="var(--aurora-deep)" />
              <span>{cancelText}</span>
            </div>
          )}

          <button
            type="button"
            className="detail-book-cta"
            onClick={() => onAdd && onAdd(tour)}
            disabled={inTrip}
          >
            {inTrip
              ? <><Icon name="check" size={18} /> {T({ hant: '已在行程中', hans: '已在行程中', en: 'In your trip' })}</>
              : <>{T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' })} <Icon name="plus" size={18} /></>}
          </button>
        </div>
      </aside>
    );
  }

  function PriceRows({ tour, displayCurrency, fxRates }) {
    return tour.priceTable.map((row) => (
      <div key={row.categoryId} className="detail-price-row">
        <span>{row.label}</span>
        <span>{formatDisplayPrice(row.amount, displayCurrency, fxRates)}</span>
      </div>
    ));
  }

  function PriceSheet({ tour, T, displayCurrency, fxRates, onClose }) {
    return (
      <div className="detail-sheet-backdrop" onClick={onClose} role="presentation">
        <div
          className="detail-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-sheet-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="detail-sheet__handle" aria-hidden="true" />
          <div className="detail-sheet__head">
            <h2 id="detail-sheet-title" className="detail-sheet__title">
              {T({ hant: '票種與價格', hans: '票种与价格', en: 'Ticket prices' })}
            </h2>
            <button type="button" className="detail-sheet__close" onClick={onClose} aria-label={T({ hant: '關閉', hans: '关闭', en: 'Close' })}>
              <Icon name="x" size={20} />
            </button>
          </div>
          <div className="detail-sheet__body">
            <PriceRows tour={tour} displayCurrency={displayCurrency} fxRates={fxRates} />
          </div>
        </div>
      </div>
    );
  }

  function Section({ id, title, children }) {
    return (
      <section id={id} className="detail-section">
        <h2 className="detail-section__title">{title}</h2>
        {children}
      </section>
    );
  }

  function BackButton({ onBack, lang, light, className = '' }) {
    const T = (opts) => pick(lang, opts);
    return (
      <button
        type="button"
        onClick={onBack}
        className={`detail-back-btn${light ? ' detail-back-btn--light' : ''} ${className}`.trim()}
      >
        <Icon name="arrow-left" size={16} />
        {T({ hant: '返回', hans: '返回', en: 'Back' })}
      </button>
    );
  }

  function DetailSkeleton({ onBack, lang }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div className="detail-page detail-page--skeleton">
        <div className="detail-hero detail-hero--skeleton">
          <div className="tour-card-image-shimmer detail-hero-shimmer" aria-hidden="true" />
          <div className="auralis-container detail-hero-top">
            <BackButton onBack={onBack} lang={lang} light />
          </div>
        </div>
        <aside className="detail-sticky-book detail-sticky-book--skeleton" aria-hidden="true">
          <div className="detail-sticky-book__card">
            <div className="detail-book-summary">
              <div className="tour-card-image-shimmer" style={{ height: 10, width: 72, borderRadius: 6 }} />
              <div className="tour-card-image-shimmer detail-book-price" style={{ height: 28, width: 100, marginTop: 8, borderRadius: 8 }} />
            </div>
            <div className="tour-card-image-shimmer" style={{ height: 44, width: 132, borderRadius: 14 }} />
          </div>
        </aside>
      </div>
    );
  }

  window.AuralisUI.ActivityDetail = ActivityDetail;
})();
