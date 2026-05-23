/* TourCard — the atomic product tile.
 * --------------------------------------------------------------------------
 * Consumes a flat TourViewModel produced by bokunAdapter.toViewModel().
 * Components are PURE — no translation logic, no Bókun knowledge.
 *
 * View-model shape (selected fields used here):
 *   {
 *     id, title, titleEn, supplier, supplierRole,
 *     duration, mode, rating, reviews, price, priceCurrency,
 *     badge (localised), badgeKey, photo, tags: [{key, label}],
 *     availability: { capacityRemaining, warning, ... }
 *   }
 */

(function () {
  const { Icon, formatPrice, fakePhoto, PhotoSparkles, pick } = window.AuralisUI;

  function TourCard({ tour, onAdd, inTrip, compact = false, lang = 'hant' }) {
    const T = (opts) => pick(lang, opts);
    const showSubtitle = lang !== 'en' && tour.titleEn && tour.titleEn !== tour.title;

    // "Only 4 left" urgency line — derived from live availability.
    const capacity = tour.availability && tour.availability.capacityRemaining;
    const showLowCapacity = typeof capacity === 'number' && capacity <= 8;

    return (
      <article style={{
        background: '#fff',
        borderRadius: 24,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-2)',
        display: 'flex', flexDirection: 'column',
        transition: 'transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-4)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-2)'; }}
      >
        {/* Photo area */}
        <div style={{
          position: 'relative',
          height: compact ? 150 : 200,
          ...(tour.coverImageUrl
            ? {
              backgroundImage: `url(${tour.coverImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
            : { background: fakePhoto(tour.photo) }),
          overflow: 'hidden',
        }}>
          {tour.photo === 'aurora' && <PhotoSparkles density={20} color="#2EFFB8" />}
          {tour.photo === 'sunset' && <PhotoSparkles density={10} color="#FFD3A8" />}

          {/* Badge — pre-localised by the adapter */}
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

          <button style={{
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

        {/* Body */}
        <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div>
            <div style={{ font: '600 16px/1.25 var(--font-display)', color: 'var(--fg-1)', letterSpacing: '-0.01em' }}>
              {tour.title}
            </div>
            <div style={{ font: '500 13px/1.4 var(--font-text)', color: 'var(--fg-3)', marginTop: 2 }}>
              {showSubtitle ? tour.titleEn : (tour.supplierRole || '\u00A0')}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, color: 'var(--fg-3)', font: '500 12px/1 var(--font-text)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={12} />{tour.duration}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="car-front" size={12} />{tour.mode}
            </span>
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

          {/* Live availability line */}
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
                {formatPrice(tour.price)}
              </div>
            </div>
            <button onClick={() => onAdd && onAdd(tour)}
                    disabled={inTrip}
                    style={{
                      height: 38, padding: inTrip ? '0 12px' : '0 16px', borderRadius: 999, border: 0,
                      cursor: inTrip ? 'default' : 'pointer',
                      background: inTrip ? 'var(--success-soft)' : 'var(--gradient-aurora)',
                      color: inTrip ? '#0A7B4F' : '#062F2A',
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

  // -------------------------------------------------------------------------
  // Loading skeleton — same dimensions as TourCard so the grid doesn't reflow.
  // -------------------------------------------------------------------------
  function TourCardSkeleton({ compact = false }) {
    return (
      <article style={{
        background: '#fff', borderRadius: 24, overflow: 'hidden',
        boxShadow: 'var(--shadow-1)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: compact ? 150 : 200,
          background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
          backgroundSize: '200% 100%',
          animation: 'auralisShimmer 1.4s linear infinite',
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
        <style>{`@keyframes auralisShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </article>
    );
  }
  function Bar({ w, h, rounded }) {
    return (
      <span style={{
        display: 'inline-block', width: w, height: h, borderRadius: rounded ? 999 : 6,
        background: 'linear-gradient(120deg,#E4E9F2 0%,#F1F4FA 50%,#E4E9F2 100%)',
        backgroundSize: '200% 100%',
        animation: 'auralisShimmer 1.4s linear infinite',
      }}/>
    );
  }

  window.AuralisUI.TourCard = TourCard;
  window.AuralisUI.TourCardSkeleton = TourCardSkeleton;
})();
