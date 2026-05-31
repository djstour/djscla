/* TourCardCompact — dense product tile for home horizontal rails.
   Whole card opens detail; no inline add-to-trip CTA (GYG-style). */

(function () {
  const { useState, useEffect, useRef } = React;
  const {
    Icon, formatDisplayPriceCompact, fakePhoto, pick, proxyImageUrl, prefetchProxiedImage,
    imageProfileForViewport, isMobileViewport, CATEGORIES,
  } = window.AuralisUI;

  function CompactCardImage({ src, alt, fallbackPhoto, priority, hovered }) {
    const [loaded, setLoaded] = useState(!src);
    const [failed, setFailed] = useState(false);
    const showImg = src && !failed;

    return (
      <div className="tour-card-compact__media" style={{ background: fallbackPhoto || 'var(--base-100)' }}>
        {!loaded && <div className="tour-card-image-shimmer tour-card-compact__shimmer" aria-hidden="true" />}
        {showImg && (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={() => setLoaded(true)}
            onError={() => { setFailed(true); setLoaded(true); }}
            className={`tour-card-compact__img${loaded ? ' is-loaded' : ''}${hovered ? ' is-hovered' : ''}`}
          />
        )}
      </div>
    );
  }

  function resolveBadge(tour, lang) {
    const T = (opts) => pick(lang, opts);
    const capacity = tour.availability && tour.availability.capacityRemaining;
    if (typeof capacity === 'number' && capacity <= 8) {
      return {
        key: 'scarce',
        label: T({ hant: '即將售罄', hans: '即将售罄', en: 'Likely to sell out' }),
        tone: 'urgent',
      };
    }
    if (tour.tripRank && tour.tripRank.liveAvailable === true) {
      return {
        key: 'available',
        label: T({ hant: '你的日期可訂', hans: '你的日期可订', en: 'Available on your dates' }),
        tone: 'positive',
      };
    }
    if (tour.badge) {
      return { key: tour.badgeKey || 'badge', label: tour.badge, tone: 'brand' };
    }
    const ids = Array.isArray(tour.chipIds) ? tour.chipIds : [];
    for (const id of ids) {
      const hit = CATEGORIES && CATEGORIES.find((c) => c.id === id);
      if (hit) {
        return { key: id, label: pick(lang, hit.label), tone: 'neutral' };
      }
    }
    return null;
  }

  function metaParts(tour) {
    const parts = [];
    if (tour.duration) parts.push(tour.duration);
    if (tour.mode) parts.push(tour.mode);
    if (tour.tags && tour.tags.length) {
      tour.tags.slice(0, 2).forEach((tag) => parts.push(tag.label));
    }
    return parts;
  }

  function TourCardCompact({
    tour, onView, lang = 'hant', displayCurrency = 'USD', fxRates = { USD: 1 }, imagePriority = false,
  }) {
    const T = (opts) => pick(lang, opts);
    const imgProfile = imageProfileForViewport();
    const cardThumb = { w: Math.min(imgProfile.card.w, 360), q: imgProfile.card.q };
    const mobile = isMobileViewport();
    const coverSrc = tour.coverImageCardUrl
      || tour.coverImageGalleryUrl
      || (tour.coverImageUrl ? proxyImageUrl(tour.coverImageUrl, cardThumb) : null);
    const cardRef = useRef(null);
    const [hovered, setHovered] = useState(false);
    const badge = resolveBadge(tour, lang);
    const meta = metaParts(tour);

    function prefetchCardAssets() {
      if (!onView) return;
      if (tour.coverImageCardUrl || tour.coverImageUrl) {
        prefetchProxiedImage(tour.coverImageCardUrl || tour.coverImageUrl, imgProfile.prefetch);
      }
      if (window.AuralisData && window.AuralisData.BokunAdapter) {
        window.AuralisData.BokunAdapter.prefetchActivityById(tour.id, { lang });
      }
    }

    useEffect(() => {
      if (!onView || !(tour.coverImageCardUrl || tour.coverImageUrl) || !cardRef.current) return undefined;
      if (typeof IntersectionObserver === 'undefined') return undefined;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            prefetchCardAssets();
            obs.disconnect();
          }
        },
        { rootMargin: mobile ? '48px 0px' : '120px 0px', threshold: 0.01 },
      );
      obs.observe(cardRef.current);
      return () => obs.disconnect();
    }, [tour.coverImageCardUrl, tour.coverImageUrl, onView]); // eslint-disable-line react-hooks/exhaustive-deps

    function openDetail(e) {
      if (onView) onView(tour);
    }

    return (
      <article
        className="tour-card-compact"
        ref={cardRef}
        role={onView ? 'button' : undefined}
        tabIndex={onView ? 0 : undefined}
        onClick={onView ? openDetail : undefined}
        onKeyDown={onView ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(e); }
        } : undefined}
        onMouseEnter={() => {
          setHovered(true);
          if (!mobile) prefetchCardAssets();
        }}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={prefetchCardAssets}
      >
        <div className="tour-card-compact__visual">
          <CompactCardImage
            src={coverSrc}
            alt={tour.title}
            fallbackPhoto={tour.coverImageUrl ? null : fakePhoto(tour.photo)}
            priority={imagePriority}
            hovered={hovered}
          />
          {badge ? (
            <span className={`tour-card-compact__badge tour-card-compact__badge--${badge.tone}`}>
              {badge.label}
            </span>
          ) : null}
        </div>

        <div className="tour-card-compact__body">
          <h3 className="tour-card-compact__title">{tour.title}</h3>

          {meta.length > 0 && (
            <p className="tour-card-compact__meta">{meta.join(' · ')}</p>
          )}

          {(tour.rating > 0 || tour.reviews > 0) && (
            <div className="tour-card-compact__rating">
              <Icon name="star" size={12} color="#FFB347" />
              {tour.rating > 0 && <span className="tour-card-compact__rating-value">{tour.rating.toFixed(1)}</span>}
              {tour.reviews > 0 && (
                <span className="tour-card-compact__reviews">({tour.reviews.toLocaleString()})</span>
              )}
            </div>
          )}

          <div className="tour-card-compact__price-row">
            {tour.priceTrusted !== false && (tour.priceUsd != null || tour.price != null) ? (
              <>
                <span className="tour-card-compact__from">{T({ hant: '起', hans: '起', en: 'From' })}</span>
                <span className="tour-card-compact__price">
                  {formatDisplayPriceCompact(tour.priceUsd ?? tour.price, displayCurrency, fxRates)}
                </span>
              </>
            ) : (
              <span className="tour-card-compact__price tour-card-compact__price--muted">
                {T({ hant: '查看價格', hans: '查看价格', en: 'See pricing' })}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  function TourCardCompactSkeleton() {
    return (
      <article className="tour-card-compact tour-card-compact--skeleton">
        <div className="tour-card-compact__visual">
          <div className="tour-card-image-shimmer tour-card-compact__shimmer" />
        </div>
        <div className="tour-card-compact__body">
          <span className="tour-card-compact__sk tour-card-compact__sk--title" />
          <span className="tour-card-compact__sk tour-card-compact__sk--meta" />
          <span className="tour-card-compact__sk tour-card-compact__sk--price" />
        </div>
      </article>
    );
  }

  window.AuralisUI.TourCardCompact = TourCardCompact;
  window.AuralisUI.TourCardCompactSkeleton = TourCardCompactSkeleton;
})();
