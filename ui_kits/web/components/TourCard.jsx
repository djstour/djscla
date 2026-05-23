/* TourCard — the atomic product tile.
 * --------------------------------------------------------------------------
 * Consumes a flat TourViewModel produced by bokunAdapter.toViewModel().
 */

(function () {
  const { useState, useEffect, useRef } = React;
  const {
    Icon, formatDisplayPrice, fakePhoto, PhotoSparkles, pick, proxyImageUrl, prefetchProxiedImage,
    imageProfileForViewport,
  } = window.AuralisUI;

  function TourCardImage({ src, alt, height, fallbackPhoto, priority }) {
    const [loaded, setLoaded] = useState(!src);
    const [failed, setFailed] = useState(false);
    const showImg = src && !failed;

    return (
      <div style={{
        position: 'relative',
        height,
        overflow: 'hidden',
        background: fallbackPhoto || 'var(--base-100)',
      }}>
        {!loaded && (
          <div className="tour-card-image-shimmer" aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
            backgroundSize: '200% 100%',
          }} />
        )}
        {showImg && (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={() => setLoaded(true)}
            onError={() => { setFailed(true); setLoaded(true); }}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.28s var(--ease-out)',
            }}
          />
        )}
      </div>
    );
  }

  function TourCard({
    tour, onAdd, onView, inTrip, compact = false, lang = 'hant',
    displayCurrency = 'USD', fxRates = { USD: 1 }, imagePriority = false,
  }) {
    const T = (opts) => pick(lang, opts);
    const capacity = tour.availability && tour.availability.capacityRemaining;
    const showLowCapacity = typeof capacity === 'number' && capacity <= 8;
    const photoHeight = compact ? 150 : 200;
    const imgProfile = imageProfileForViewport();
    const cardThumb = compact
      ? { w: Math.min(imgProfile.card.w, 400), q: imgProfile.card.q }
      : imgProfile.card;
    const coverSrc = tour.coverImageUrl ? proxyImageUrl(tour.coverImageUrl, cardThumb) : null;
    const cardRef = useRef(null);

    function prefetchCardAssets() {
      if (!onView) return;
      if (tour.coverImageUrl) prefetchProxiedImage(tour.coverImageUrl, imgProfile.prefetch);
      if (window.AuralisData && window.AuralisData.BokunAdapter) {
        window.AuralisData.BokunAdapter.prefetchActivityById(tour.id, { lang });
      }
    }

    useEffect(() => {
      if (!onView || !tour.coverImageUrl || !cardRef.current) return undefined;
      if (typeof IntersectionObserver === 'undefined') return undefined;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            prefetchCardAssets();
            obs.disconnect();
          }
        },
        { rootMargin: '80px 0px', threshold: 0.01 },
      );
      obs.observe(cardRef.current);
      return () => obs.disconnect();
    }, [tour.coverImageUrl, onView]); // eslint-disable-line react-hooks/exhaustive-deps

    function openDetail(e) {
      if (onView) onView(tour);
    }

    return (
      <article
        ref={cardRef}
        role={onView ? 'button' : undefined}
        tabIndex={onView ? 0 : undefined}
        onClick={onView ? openDetail : undefined}
        onKeyDown={onView ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(e); } } : undefined}
        style={{
          background: '#fff',
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-2)',
          display: 'flex', flexDirection: 'column',
          cursor: onView ? 'pointer' : 'default',
          transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-3px)';
          e.currentTarget.style.boxShadow = 'var(--shadow-4)';
          prefetchCardAssets();
        }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-2)'; }}
        onTouchStart={prefetchCardAssets}
      >
        <div style={{ position: 'relative' }}>
          <TourCardImage
            src={coverSrc}
            alt={tour.title}
            height={photoHeight}
            fallbackPhoto={tour.coverImageUrl ? null : fakePhoto(tour.photo)}
            priority={imagePriority}
          />
          {!tour.coverImageUrl && tour.photo === 'aurora' && <PhotoSparkles density={12} color="#2EFFB8" />}
          {!tour.coverImageUrl && tour.photo === 'sunset' && <PhotoSparkles density={6} color="#FFD3A8" />}

          {tour.badge && (
            <span style={{
              position: 'absolute', top: 12, left: 12,
              background: tour.badgeKey === 'premium' ? 'var(--gradient-sun)'
                        : tour.badgeKey === 'top_pick' ? '#C6FF3F'
                        : '#FFEBC9',
              color: tour.badgeKey === 'premium' ? '#fff' : '#11151F',
              padding: '6px 10px', borderRadius: 999,
              font: '700 10px/1 var(--font-text)', letterSpacing: '0.08em', textTransform: 'uppercase',
              boxShadow: tour.badgeKey === 'premium' ? 'var(--shadow-glow-sun)' : 'var(--shadow-1)',
            }}>{tour.badge}</span>
          )}

          <button type="button" onClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: 12, right: 12,
            width: 36, height: 36, borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-1)',
          }}><Icon name="heart" size={16} color="var(--fg-1)" /></button>

          <span style={{
            position: 'absolute', bottom: 12, left: 12,
            color: '#fff', font: '500 10px/1 var(--font-text)', letterSpacing: '0.12em', textTransform: 'uppercase',
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}>{tour.supplier}</span>
        </div>

        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div>
            <div style={{ font: '600 16px/1.25 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
              {tour.title}
            </div>
            <div style={{ font: '500 13px/1.4 var(--font-text)', color: 'var(--fg-3)', marginTop: 2 }}>
              {tour.supplierRole || '\u00A0'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, color: 'var(--fg-3)', font: '500 12px/1 var(--font-text)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={12} />{tour.duration}
            </span>
            {tour.mode && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="car-front" size={12} />{tour.mode}
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="star" size={12} color="#FFB347" />
              <b style={{ color: 'var(--fg-1)' }}>{tour.rating}</b>
              <span>· {tour.reviews.toLocaleString()}</span>
            </span>
          </div>

          {tour.tags && tour.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tour.tags.map(tag => {
                const isMandarin = tag.key === 'mandarin_guide';
                return (
                  <span key={tag.key} style={{
                    font: '600 11px/1 var(--font-text)',
                    padding: '5px 9px', borderRadius: 999,
                    background: isMandarin ? '#D6F7E8' : 'var(--base-100)',
                    color: isMandarin ? '#0A7B4F' : 'var(--fg-2)',
                  }}>{tag.label}</span>
                );
              })}
            </div>
          )}

          {showLowCapacity && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              font: '600 11px/1 var(--font-text)', color: 'var(--coral)',
            }}>
              <Icon name="flame" size={12} color="var(--coral)" />
              {T({
                hant: `名額僅剩 ${capacity} 位`,
                hans: `名额仅剩 ${capacity} 位`,
                en:   `Only ${capacity} spots left`,
              })}
            </div>
          )}
          {tour.availability && tour.availability.warning && !showLowCapacity && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)',
            }}>
              <Icon name="cloud-sun" size={12} />
              {tour.availability.warning}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ font: '500 11px/1 var(--font-text)', color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {T({ hant: '起', hans: '起', en: 'from' })}
              </div>
              <div style={{ font: '700 22px/1 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.02em', marginTop: 4 }}>
                {formatDisplayPrice(tour.priceUsd ?? tour.price, displayCurrency, fxRates)}
              </div>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); onAdd && onAdd(tour); }}
                    disabled={inTrip}
                    style={{
                      height: 38, padding: inTrip ? '0 12px' : '0 16px', borderRadius: 999, border: 0,
                      cursor: inTrip ? 'default' : 'pointer',
                      background: inTrip ? 'var(--success-soft)' : 'var(--gradient-aurora)',
                      color: inTrip ? '#0A7B4F' : 'var(--brand-on-gradient)',
                      boxShadow: inTrip ? 'none' : 'var(--shadow-glow-aurora)',
                      font: '700 13px/1 var(--font-text)',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      transition: 'all var(--dur-fast) var(--ease-out)',
                    }}>
              {inTrip
                ? <><Icon name="check" size={14} /> {T({ hant: '已加入', hans: '已加入', en: 'Added' })}</>
                : <>{T({ hant: '加入', hans: '加入', en: 'Add' })} <Icon name="plus" size={14} /></>}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function TourCardSkeleton({ compact = false }) {
    return (
      <article style={{
        background: '#fff', borderRadius: 24, overflow: 'hidden',
        boxShadow: 'var(--shadow-1)', display: 'flex', flexDirection: 'column',
      }}>
        <div className="tour-card-image-shimmer" style={{
          height: compact ? 150 : 200,
          background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
          backgroundSize: '200% 100%',
        }}/>
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Bar w="80%" h={18}/>
          <Bar w="60%" h={12}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <Bar w={60} h={12}/><Bar w={70} h={12}/><Bar w={80} h={12}/>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Bar w={56} h={20} rounded/><Bar w={72} h={20} rounded/>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
            <Bar w={90} h={26}/>
            <Bar w={92} h={36} rounded/>
          </div>
        </div>
      </article>
    );
  }

  function Bar({ w, h, rounded }) {
    return (
      <span className="tour-card-image-shimmer" style={{
        display: 'inline-block', width: w, height: h, borderRadius: rounded ? 999 : 6,
        background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
        backgroundSize: '200% 100%',
      }}/>
    );
  }

  window.AuralisUI.TourCard = TourCard;
  window.AuralisUI.TourCardSkeleton = TourCardSkeleton;
})();
