/* ActivityDetail — full product page from Bókun GET /activity.json/{id}. */

(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const {
    Icon, formatDisplayPrice, fakePhoto, pick, proxyImageUrl,
    useResponsiveImageProfile, useMobileViewport,
    sanitizeVendorHtml, vendorHtmlIsMeaningful,
  } = window.AuralisUI;

  const DESC_PREVIEW_CHARS = 320;
  const COMPACT_HEADER_SCROLL = 180;
  // Bókun rarely exposes a per-category cap; OTA-standard fallback is 15.
  const DETAIL_PAX_MAX = 15;
  function paxRange(start, end) {
    const out = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function nextIsoDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function findPricingCategory(activity, matcher) {
    return (activity?.raw?.pricingCategories || []).find(matcher) || null;
  }

  /**
   * Derive the Adult / Child pricing categories from the tour's `pricingCategories`
   * list so the BookPanel can render proper "Adult (13-99)" / "Child (6-12)" labels
   * and feed Bókun's availability API with the right category IDs.
   */
  function resolvePaxCategories(tour) {
    const list = tour?.raw?.pricingCategories || [];
    const adultMatcher = (c) =>
      c.defaultCategory
      || c.ticketCategory === 'ADULT'
      || /adult/i.test(c.title || c.fullTitle || '');
    const childMatcher = (c) =>
      c.ticketCategory === 'CHILD'
      || /child|youth|kid/i.test(c.title || c.fullTitle || '');
    const adult = list.find(adultMatcher) || list[0] || null;
    const child = list.find(childMatcher) || null;
    return { adult, child };
  }

  function paxCategoryLabel(cat) {
    if (!cat) return '';
    if (cat.fullTitle) return cat.fullTitle;
    const title = cat.title || (cat.ticketCategory === 'CHILD' ? 'Child' : 'Adult');
    const min = cat.minAge ?? '';
    const max = cat.maxAge ?? '';
    if (min === '' && max === '') return title;
    return `${title} (${min} - ${max})`;
  }

  function buildAvailabilityPax(tour, counts) {
    const adultCategory = findPricingCategory(tour, (row) => row.defaultCategory || /adult/i.test(row.title || row.fullTitle || ''))
      || tour?.raw?.pricingCategories?.[0]
      || null;
    const childCategory = findPricingCategory(tour, (row) => /child|youth|kid/i.test(row.title || row.fullTitle || ''));
    const pax = [];

    if (adultCategory && counts.adults > 0) {
      pax.push({ pricingCategoryId: adultCategory.id, quantity: counts.adults });
    }
    if (childCategory && counts.children > 0) {
      pax.push({ pricingCategoryId: childCategory.id, quantity: counts.children });
    }
    return pax;
  }

  /** Reuse card-sized derivative first, then fade into the larger hero asset. */
  function DetailHeroImage({ fastUrl, hiUrl, placeholderKey }) {
    const [fastLoaded, setFastLoaded] = useState(false);
    const [hiLoaded, setHiLoaded] = useState(false);
    const fastSrc = fastUrl || hiUrl || null;
    const hiSrc = hiUrl || fastUrl || null;
    const useHiRes = !!(hiSrc && hiSrc !== fastSrc);

    useEffect(() => {
      setFastLoaded(false);
      setHiLoaded(false);
    }, [fastSrc, hiSrc]);

    useEffect(() => {
      if (!useHiRes) return undefined;
      const img = new Image();
      img.onload = () => setHiLoaded(true);
      img.onerror = () => setHiLoaded(false);
      img.src = hiSrc;
      return () => { img.onload = null; img.onerror = null; };
    }, [hiSrc, useHiRes]);

    if (!fastSrc && !hiSrc) {
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
    trip = [],
    lang,
    displayCurrency = 'USD',
    fxRates = { USD: 1 },
    initialDate = null,
    initialGuestCounts = null,
    initialBookingSelection = null,
  }) {
    const T = (opts) => pick(lang, opts);
    const imgProfile = useResponsiveImageProfile();
    const isMobile = useMobileViewport();
    const [activePhoto, setActivePhoto] = useState(0);
    const [compactHeader, setCompactHeader] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [priceSheetOpen, setPriceSheetOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
      const min = todayIso();
      const fromTrip = initialDate && initialDate >= min ? initialDate : null;
      return fromTrip || nextIsoDate(14);
    });
    const [selectedStartTime, setSelectedStartTime] = useState('');
    const [guestCounts, setGuestCounts] = useState(() => ({
      adults: Math.min(DETAIL_PAX_MAX, Math.max(1, Number(initialGuestCounts?.adults) || 2)),
      children: Math.min(DETAIL_PAX_MAX, Math.max(0, Number(initialGuestCounts?.children) || 0)),
    }));
    const [selectedPickupId, setSelectedPickupId] = useState(() => String(initialBookingSelection?.pickupPlaceId || ''));
    const [selectedExtras, setSelectedExtras] = useState(() => (
      Array.isArray(initialBookingSelection?.extras)
        ? initialBookingSelection.extras.reduce((acc, extra) => {
            if (extra && extra.id != null) acc[extra.id] = true;
            return acc;
          }, {})
        : {}
    ));
    const [availabilityState, setAvailabilityState] = useState({ loading: false, error: '', data: null });
    const [availabilityOpen, setAvailabilityOpen] = useState(false);
    const [stickyBarVisible, setStickyBarVisible] = useState(false);
    const [inquiryOpen, setInquiryOpen] = useState(false);
    const [inquirySubmitting, setInquirySubmitting] = useState(false);
    const [inquiryStatus, setInquiryStatus] = useState({ ok: false, message: '' });
    const [inquiryForm, setInquiryForm] = useState({
      name: '',
      email: '',
      phone: '',
      budgetRange: '',
      notes: '',
    });
    const touchStart = useRef({ x: 0, y: 0 });

    const galleryPhotos = tour
      ? ((tour.imageAssets && tour.imageAssets.length)
        ? tour.imageAssets
        : ((tour.photoUrls && tour.photoUrls.length)
          ? tour.photoUrls.map((url, index) => ({
              sourceUrl: url,
              heroUrl: Array.isArray(tour.photoUrlsOwned) ? (tour.photoUrlsOwned[index] || null) : null,
              galleryUrl: null,
              cardUrl: index === 0 ? (tour.coverImageCardUrl || null) : null,
              isCover: index === 0,
            }))
          : (tour.coverImageUrl ? [{
              sourceUrl: tour.coverImageUrl,
              heroUrl: tour.coverImageHeroUrl || tour.coverImageOwnedUrl || null,
              galleryUrl: tour.coverImageGalleryUrl || null,
              cardUrl: tour.coverImageCardUrl || null,
              isCover: true,
            }] : [])))
      : [];

    useEffect(() => {
      const min = todayIso();
      const fromTrip = initialDate && initialDate >= min ? initialDate : null;
      setActivePhoto(0);
      setDescExpanded(false);
      setPriceSheetOpen(false);
      setCompactHeader(false);
      setSelectedDate(fromTrip || nextIsoDate(14));
      setSelectedStartTime(initialBookingSelection?.startTimeId ? String(initialBookingSelection.startTimeId) : '');
      setGuestCounts({
        adults: Math.min(DETAIL_PAX_MAX, Math.max(1, Number(initialGuestCounts?.adults) || 2)),
        children: Math.min(DETAIL_PAX_MAX, Math.max(0, Number(initialGuestCounts?.children) || 0)),
      });
      setSelectedPickupId(String(initialBookingSelection?.pickupPlaceId || ''));
      setSelectedExtras(
        Array.isArray(initialBookingSelection?.extras)
          ? initialBookingSelection.extras.reduce((acc, extra) => {
              if (extra && extra.id != null) acc[extra.id] = true;
              return acc;
            }, {})
          : {}
      );
      setAvailabilityState({ loading: false, error: '', data: null });
      setAvailabilityOpen(false);
      setStickyBarVisible(false);
      setInquiryOpen(false);
      setInquirySubmitting(false);
      setInquiryStatus({ ok: false, message: '' });
    }, [tour && tour.id, galleryPhotos.length, initialDate, initialGuestCounts?.adults, initialGuestCounts?.children, initialBookingSelection]);

    useEffect(() => {
      if (initialBookingSelection?.startTimeId) {
        setSelectedStartTime(String(initialBookingSelection.startTimeId));
        return;
      }
      const firstStartTime = tour && tour.startTimes && tour.startTimes[0];
      const nextValue = firstStartTime
        ? String(firstStartTime.id ?? firstStartTime.startTimeId ?? firstStartTime.label ?? '')
        : '';
      setSelectedStartTime(nextValue);
    }, [tour && tour.id, initialBookingSelection]);

    useEffect(() => {
      const onScroll = () => setCompactHeader(window.scrollY > COMPACT_HEADER_SCROLL);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, [tour && tour.id]);

    useEffect(() => {
      if (!isMobile) {
        setStickyBarVisible(false);
        return undefined;
      }
      const onScroll = () => setStickyBarVisible(window.scrollY > 920);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => window.removeEventListener('scroll', onScroll);
    }, [isMobile, tour && tour.id]);

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
    const activePhotoAsset = galleryPhotos[safeIndex] || null;
    const heroFastUrl = activePhotoAsset
      ? (activePhotoAsset.cardUrl
        || activePhotoAsset.galleryUrl
        || (activePhotoAsset.sourceUrl ? proxyImageUrl(activePhotoAsset.sourceUrl, imgProfile.heroFast) : null))
      : null;
    const heroHiUrl = activePhotoAsset
      ? (activePhotoAsset.heroUrl
        || (activePhotoAsset.sourceUrl && imgProfile.heroHi
          ? proxyImageUrl(activePhotoAsset.sourceUrl, imgProfile.heroHi)
          : null))
      : null;
    const hasMultiPrice = tour.priceTable && tour.priceTable.length > 1;
    const stopsNamed = (tour.stops || []).filter((s) => s.name);
    // Bókun ships descriptions as inline-styled HTML (rich paragraphs with
    // <p>, <br>, vendor styles). Detect that and route through the sanitiser
    // so paragraphs actually render, instead of collapsing into a wall of text.
    const descriptionIsHtml = typeof tour.description === 'string' && /<[a-z][\s\S]*?>/i.test(tour.description);
    const descriptionSanitizedHtml = descriptionIsHtml ? sanitizeVendorHtml(tour.description) : '';
    const descriptionTextLen = descriptionIsHtml
      ? descriptionSanitizedHtml.replace(/<[^>]*>/g, '').length
      : (tour.description || '').length;
    const descNeedsCollapse = descriptionTextLen > DESC_PREVIEW_CHARS;
    const descPreview = descNeedsCollapse && !descExpanded && !descriptionIsHtml
      ? `${tour.description.slice(0, DESC_PREVIEW_CHARS).trim()}…`
      : tour.description;

    const includedHtml = sanitizeVendorHtml(tour.includedHtml);
    const excludedHtml = sanitizeVendorHtml(tour.excludedHtml);
    const requirementsHtml = sanitizeVendorHtml(tour.requirementsHtml);
    const attentionHtml = sanitizeVendorHtml(tour.attentionHtml);
    const cancellationPolicyHtml = sanitizeVendorHtml(tour.cancellationPolicyHtml);
    const hasIncluded = vendorHtmlIsMeaningful(includedHtml);
    const hasExcluded = vendorHtmlIsMeaningful(excludedHtml);
    const hasRequirements = vendorHtmlIsMeaningful(requirementsHtml);
    const hasAttention = vendorHtmlIsMeaningful(attentionHtml);
    const hasCancellationPolicy = vendorHtmlIsMeaningful(cancellationPolicyHtml);
    const extras = Array.isArray(tour.bookableExtras) ? tour.bookableExtras : [];
    const hasExtras = extras.length > 0;
    const optionalExtras = extras.filter((ex) => !ex.included && (!ex.selectionType || ex.selectionType === 'OPTIONAL'));
    const pickupInfo = tour.pickupInfo || null;
    const showPickupInfo = pickupInfo && pickupInfo.enabled;
    const pickupPlaces = Array.isArray(pickupInfo?.places) ? pickupInfo.places : [];
    // Per-booking pax ceiling — Bókun back office uses this as the dropdown cap.
    const paxCap = Number.isFinite(Number(tour.passCapacity)) && Number(tour.passCapacity) > 0
      ? Number(tour.passCapacity)
      : DETAIL_PAX_MAX;
    const { adult: adultCategory, child: childCategory } = resolvePaxCategories(tour);
    const guestTotalLive = guestCounts.adults + guestCounts.children;
    // Client-side extras subtotal so the booking summary mirrors Bókun's "Total".
    const extrasSubtotal = optionalExtras.reduce((sum, ex) => {
      if (!selectedExtras[ex.id]) return sum;
      const unit = Number(ex.price) || 0;
      if (ex.pricedPerPerson) return sum + unit * Math.max(1, guestTotalLive);
      return sum + unit;
    }, 0);

    const anchorItems = [
      tour.description && { id: 'detail-about', label: 'Description' },
      hasIncluded && { id: 'detail-included', label: 'Included' },
      hasExcluded && { id: 'detail-excluded', label: 'Excluded' },
      stopsNamed.length > 0 && { id: 'detail-stops', label: 'Itinerary' },
      hasRequirements && { id: 'detail-requirements', label: 'Requirements' },
      hasAttention && { id: 'detail-attention', label: 'Attention' },
      hasCancellationPolicy && { id: 'detail-cancellation', label: 'Cancellation policy' },
      tour.meetingPoint && { id: 'detail-meeting', label: 'Meeting point' },
      showPickupInfo && { id: 'detail-pickup', label: 'Pick-up' },
      tour.startTimes && tour.startTimes.length > 0 && { id: 'detail-times', label: 'Start times' },
    ].filter(Boolean);
    // `hasExtras` flag retained for future use; extras now live in BookPanel.
    void hasExtras;

    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function estimateSelectionBaseTotalUsd() {
      const rows = Array.isArray(tour.priceTable) ? tour.priceTable : [];
      const adultAmount = Number(rows.find((row) => row.categoryId === adultCategory?.id)?.amount);
      const childAmount = Number(rows.find((row) => row.categoryId === childCategory?.id)?.amount);
      const fallbackUnit = Number(resolvePriceUsd(tour)) || 0;
      const adultUnit = Number.isFinite(adultAmount) && adultAmount > 0 ? adultAmount : fallbackUnit;
      const childUnit = Number.isFinite(childAmount) && childAmount >= 0 ? childAmount : adultUnit;
      return (adultUnit * guestCounts.adults) + (childUnit * guestCounts.children);
    }

    function buildBookingSelection() {
      const startTimeRow = (tour.startTimes || []).find((st, i) => {
        const value = String(st.id ?? st.startTimeId ?? st.label ?? i);
        return value === String(selectedStartTime || '');
      }) || null;
      const pickupRow = pickupPlaces.find((p) => String(p.id) === String(selectedPickupId || '')) || null;
      const selectedExtrasRows = optionalExtras
        .filter((ex) => !!selectedExtras[ex.id])
        .map((ex) => ({
          id: ex.id,
          title: ex.title,
          quantity: 1,
          pricedPerPerson: !!ex.pricedPerPerson,
          unitPriceUsd: Number(ex.price) || 0,
        }));
      const liveBaseTotal = Number(availabilityState.data && availabilityState.data.total);
      const baseTotalUsd = Number.isFinite(liveBaseTotal) && liveBaseTotal > 0
        ? liveBaseTotal
        : estimateSelectionBaseTotalUsd();
      const totalUsd = baseTotalUsd + (Number(extrasSubtotal) || 0);

      return {
        date: selectedDate || null,
        startTimeId: selectedStartTime || null,
        startTimeLabel: startTimeRow ? (startTimeRow.label || startTimeRow.startTime || null) : null,
        guests: { adults: guestCounts.adults, children: guestCounts.children },
        pickupPlaceId: selectedPickupId ? Number(selectedPickupId) : null,
        pickupTitle: pickupRow ? pickupRow.title : null,
        extras: selectedExtrasRows,
        quotedAt: new Date().toISOString(),
        pricing: {
          source: Number.isFinite(liveBaseTotal) && liveBaseTotal > 0 ? 'live' : 'estimate',
          baseTotalUsd,
          extrasTotalUsd: Number(extrasSubtotal) || 0,
          totalUsd,
        },
      };
    }

    async function checkAvailability() {
      const pax = buildAvailabilityPax(tour, guestCounts);
      if (!selectedDate || !pax.length) {
        setAvailabilityState({
          loading: false,
          error: T({
            hant: '請先選擇日期與人數。',
            hans: '请先选择日期与人数。',
            en: 'Choose a date and passenger count first.',
          }),
          data: null,
        });
        return;
      }

      setAvailabilityState({ loading: true, error: '', data: null });
      try {
        const extrasPayload = Object.entries(selectedExtras)
          .filter(([, on]) => on)
          .map(([id]) => ({ id: Number(id), quantity: 1 }));
        const res = await fetch('/api/availability/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activityId: tour.id,
            date: selectedDate,
            startTimeId: selectedStartTime || undefined,
            lang,
            pax,
            extras: extrasPayload,
            pickupPlaceId: selectedPickupId ? Number(selectedPickupId) : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Availability check failed');
        setAvailabilityState({ loading: false, error: '', data });
      } catch (err) {
        setAvailabilityState({
          loading: false,
          error: err.message || T({ hant: '查詢失敗', hans: '查询失败', en: 'Request failed' }),
          data: null,
        });
      }
    }

    async function submitInquiry(e) {
      e.preventDefault();
      setInquirySubmitting(true);
      setInquiryStatus({ ok: false, message: '' });
      try {
        const selectedTrip = (trip && trip.length ? trip : [tour]).map((item) => ({
          id: item.id,
          title: item.title,
          supplier: item.supplier,
          date: selectedDate || null,
          startTimeId: selectedStartTime || null,
          guests: guestCounts,
        }));

        const res = await fetch('/api/inquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: inquiryForm.name,
            email: inquiryForm.email,
            phone: inquiryForm.phone,
            lang,
            travelStartDate: selectedDate || null,
            pax: guestCounts.adults + guestCounts.children,
            budgetRange: inquiryForm.budgetRange || null,
            notes: [inquiryForm.notes, `${tour.title} · ${tour.supplier}`].filter(Boolean).join('\n'),
            selectedTrip,
            sourcePage: typeof window !== 'undefined' ? window.location.pathname : '/tours',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Inquiry failed');
        setInquirySubmitting(false);
        setInquiryStatus({
          ok: true,
          message: T({
            hant: '已送出顧問需求，我們會盡快與你聯絡。',
            hans: '已提交顾问需求，我们会尽快与你联系。',
            en: 'Your concierge request is in. We will reach out soon.',
          }),
        });
        setInquiryOpen(false);
        setInquiryForm((prev) => ({ ...prev, notes: '' }));
      } catch (err) {
        setInquirySubmitting(false);
        setInquiryStatus({
          ok: false,
          message: err.message || T({
            hant: '送出失敗，請稍後再試。',
            hans: '提交失败，请稍后再试。',
            en: 'Could not send your request. Please try again.',
          }),
        });
      }
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

        {/* ── Immersive hero: title + meta overlaid at bottom ── */}
        <div
          className="detail-hero"
          onTouchStart={onHeroTouchStart}
          onTouchEnd={onHeroTouchEnd}
        >
          <DetailHeroImage fastUrl={heroFastUrl} hiUrl={heroHiUrl} placeholderKey={tour.photo} />
          <div className="detail-hero-scrim" aria-hidden="true" />

          {/* Top bar: back + counter */}
          <div className="detail-hero-topbar">
            <BackButton onBack={onBack} lang={lang} light className="detail-hero-back" />
            {galleryPhotos.length > 1 && (
              <div className="detail-hero-counter" aria-live="polite">
                {safeIndex + 1} / {galleryPhotos.length}
              </div>
            )}
          </div>

          {/* Caption: title + meta overlaid at bottom */}
          <div className="detail-hero-caption auralis-container">
            {tour.badge && (
              <span className="detail-hero-badge">{tour.badge}</span>
            )}
            <h1 className="detail-hero-title">{tour.title}</h1>
            <div className="detail-hero-facts">
              {tour.rating > 0 && (
                <span className="detail-hero-fact">
                  <Icon name="star" size={13} color="#FFB347" />
                  <b>{tour.rating}</b>
                  <span>· {tour.reviews.toLocaleString()} {T({ hant: '則評價', hans: '条评价', en: 'reviews' })}</span>
                </span>
              )}
              {tour.duration && (
                <span className="detail-hero-fact">
                  <Icon name="clock" size={13} color="rgba(255,255,255,0.72)" />
                  {tour.duration}
                </span>
              )}
              {tour.supplier && (
                <span className="detail-hero-fact">
                  <Icon name="building-2" size={13} color="rgba(255,255,255,0.72)" />
                  {tour.supplier}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Photo row: horizontal scrollable strip below hero ── */}
        {galleryPhotos.length > 1 && (
          <div
            className="detail-photo-row"
            role="tablist"
            aria-label={T({ hant: '行程照片', hans: '行程照片', en: 'Tour photos' })}
          >
            {galleryPhotos.map((asset, i) => {
              const selected = safeIndex === i;
              const thumbSrc = asset.galleryUrl
                || asset.cardUrl
                || (asset.sourceUrl ? proxyImageUrl(asset.sourceUrl, imgProfile.gallery) : null);
              return (
                <button
                  key={(asset.sourceUrl || asset.heroUrl || 'photo') + i}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={T({ hant: `照片 ${i + 1}`, hans: `照片 ${i + 1}`, en: `Photo ${i + 1}` })}
                  className={`detail-photo-row__btn${selected ? ' is-active' : ''}`}
                  onClick={() => setActivePhoto(i)}
                >
                  <img
                    src={thumbSrc}
                    alt=""
                    loading={Math.abs(i - safeIndex) <= 2 ? 'eager' : 'lazy'}
                    fetchPriority={selected ? 'high' : 'low'}
                    decoding="async"
                    draggable={false}
                    className="detail-photo-row__img"
                  />
                </button>
              );
            })}
          </div>
        )}

        <div className="auralis-container detail-layout">
          <div className="detail-main">
            {loading && (
              <p className="detail-loading-hint" style={{ marginBottom: 0 }}>
                {T({ hant: '正在載入完整內容…', hans: '正在加载完整内容…', en: 'Loading full details…' })}
              </p>
            )}

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

            {(tour.description || loading) && (
              <Section
                id="detail-about"
                title="Description"
              >
                {tour.description ? (
                  <>
                    {descriptionIsHtml ? (
                      <div
                        className={`detail-description detail-description--rich detail-vendor-html${descNeedsCollapse && !descExpanded ? ' is-clamped' : ''}`}
                        dangerouslySetInnerHTML={{ __html: descriptionSanitizedHtml }}
                      />
                    ) : (
                      <p className={`detail-description${descNeedsCollapse && !descExpanded ? ' is-clamped' : ''}`}>
                        {descExpanded ? tour.description : descPreview}
                      </p>
                    )}
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

            {hasIncluded && (
              <Section
                id="detail-included"
                title="Included"
              >
                <div className="detail-vendor-html"
                     dangerouslySetInnerHTML={{ __html: includedHtml }} />
              </Section>
            )}

            {hasExcluded && (
              <Section
                id="detail-excluded"
                title="Excluded"
              >
                <div className="detail-vendor-html"
                     dangerouslySetInnerHTML={{ __html: excludedHtml }} />
              </Section>
            )}

            {stopsNamed.length > 0 && (
              <Section
                id="detail-stops"
                title="Itinerary"
              >
                <ol className="detail-stops-list">
                  {stopsNamed.map((stop, i) => (
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
              </Section>
            )}

            {tour.meetingPoint && (
              <Section
                id="detail-meeting"
                title="Meeting point"
              >
                <div className="detail-meeting">
                  <Icon name="map-pin" size={20} color="var(--coral)" />
                  <div className="detail-meeting__body">
                    {(tour.meetingPoint.title || tour.meetingPoint.name) && (
                      <div className="detail-meeting__title">
                        {tour.meetingPoint.title || tour.meetingPoint.name}
                      </div>
                    )}
                    {tour.meetingPoint.address && (
                      <div className="detail-meeting__address">{tour.meetingPoint.address}</div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {tour.startTimes && tour.startTimes.length > 0 && (
              <Section
                id="detail-times"
                title="Start times"
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
              <Section title="Guide languages">
                <div className="detail-chips">
                  {tour.languages.map((l) => (
                    <span key={l} className="detail-chip detail-chip--lang">{l}</span>
                  ))}
                </div>
              </Section>
            )}

            {hasRequirements && (
              <Section
                id="detail-requirements"
                title="Requirements"
              >
                <div className="detail-vendor-html"
                     dangerouslySetInnerHTML={{ __html: requirementsHtml }} />
              </Section>
            )}

            {showPickupInfo && (
              <Section
                id="detail-pickup"
                title="Pick-up"
              >
                <div className="detail-pickup-card">
                  <Icon name="bus" size={18} color="var(--aurora-deep, #00837A)" />
                  <div className="detail-pickup-card__body">
                    {pickupPlaces.length > 0 && (
                      <ul className="detail-pickup-card__list">
                        {pickupPlaces.map((place) => (
                          <li key={place.id}>{place.title}</li>
                        ))}
                      </ul>
                    )}
                    {pickupInfo.noPickupMessage && (
                      <div className="detail-vendor-html">
                        {pickupInfo.noPickupMessage}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {hasAttention && (
              <Section
                id="detail-attention"
                title="Attention"
              >
                <div className="detail-attention-card">
                  <Icon name="info" size={18} color="var(--warning, #FFB347)" />
                  <div className="detail-vendor-html"
                       dangerouslySetInnerHTML={{ __html: attentionHtml }} />
                </div>
              </Section>
            )}

            {hasCancellationPolicy && (
              <Section
                id="detail-cancellation"
                title="Cancellation policy"
              >
                <div className="detail-attention-card">
                  <Icon name="shield-check" size={18} color="var(--aurora-deep, #00837A)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                    {tour.cancellationPolicyTitle && (
                      <div style={{ font: '600 13px/1.45 var(--font-text)', color: 'var(--fg-1)' }}>
                        {tour.cancellationPolicyTitle}
                      </div>
                    )}
                    <div
                      className="detail-vendor-html"
                      dangerouslySetInnerHTML={{ __html: cancellationPolicyHtml }}
                    />
                  </div>
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
            hasMultiPrice={hasMultiPrice}
            inTrip={inTrip}
            onAddSelection={() => onAdd && onAdd(tour, { booking: buildBookingSelection() })}
            trip={trip}
            isMobile={isMobile}
            onOpenPrices={() => setPriceSheetOpen(true)}
            selectedDate={selectedDate}
            onSelectedDate={setSelectedDate}
            selectedStartTime={selectedStartTime}
            onSelectedStartTime={setSelectedStartTime}
            guestCounts={guestCounts}
            onGuestCounts={setGuestCounts}
            adultCategory={adultCategory}
            childCategory={childCategory}
            paxCap={paxCap}
            pickupInfo={pickupInfo}
            pickupPlaces={pickupPlaces}
            selectedPickupId={selectedPickupId}
            onSelectedPickupId={setSelectedPickupId}
            optionalExtras={optionalExtras}
            selectedExtras={selectedExtras}
            onSelectedExtras={setSelectedExtras}
            extrasSubtotal={extrasSubtotal}
            stickyBarVisible={stickyBarVisible}
            availabilityState={availabilityState}
            availabilityOpen={availabilityOpen}
            onAvailabilityOpen={setAvailabilityOpen}
            onCheckAvailability={checkAvailability}
            inquiryOpen={inquiryOpen}
            onInquiryOpen={setInquiryOpen}
            inquiryForm={inquiryForm}
            onInquiryForm={setInquiryForm}
            inquirySubmitting={inquirySubmitting}
            inquiryStatus={inquiryStatus}
            onSubmitInquiry={submitInquiry}
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
    tour, T, displayCurrency, fxRates, priceUsd, loading, hasMultiPrice, inTrip, onAddSelection, trip,
    isMobile, onOpenPrices, selectedDate, onSelectedDate, selectedStartTime, onSelectedStartTime, guestCounts,
    onGuestCounts, adultCategory, childCategory, paxCap,
    pickupInfo, pickupPlaces, selectedPickupId, onSelectedPickupId,
    optionalExtras, selectedExtras, onSelectedExtras, extrasSubtotal,
    stickyBarVisible, availabilityState, availabilityOpen, onAvailabilityOpen, onCheckAvailability, inquiryOpen, onInquiryOpen, inquiryForm, onInquiryForm,
    inquirySubmitting, inquiryStatus, onSubmitInquiry,
  }) {
    const priceLabel = priceUsd != null
      ? formatDisplayPrice(priceUsd, displayCurrency, fxRates)
      : (loading
        ? '…'
        : T({ hant: '價格載入中', hans: '价格加载中', en: 'Price loading' }));
    const guestTotal = guestCounts.adults + guestCounts.children;
    const showAvailabilityPanel = !isMobile || availabilityOpen;
    const showInquiryPanel = !isMobile || inquiryOpen;
    const mobileAvailabilitySummary = availabilityState.data
      ? `${selectedDate} · ${formatDisplayPrice(availabilityState.data.total, displayCurrency, fxRates)}`
      : T({ hant: '選日期、時段與人數', hans: '选日期、时段与人数', en: 'Date, time, and travelers' });
    const mobileInquirySummary = inquiryStatus.ok
      ? inquiryStatus.message
      : T({ hant: '需要包車、客製行程或中文協助', hans: '需要包车、定制行程或中文协助', en: 'Private tours, custom itineraries, and planning help' });

    return (
      <>
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
              {priceUsd != null && (
                <p className="detail-book-trust" style={{ display: 'flex' }}>
                  <Icon name="sparkles" size={14} color="var(--aurora-deep)" />
                  {T({ hant: '先顯示基礎票價，查詢後更新即時可售與總價', hans: '先显示基础票价，查询后更新即时可售与总价', en: 'Base fare shown now. Live availability updates below.' })}
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

          <button
            type="button"
            className="detail-book-cta"
            onClick={onAddSelection}
          >
            {inTrip
              ? <><Icon name="check" size={18} /> {T({ hant: '更新行程設定', hans: '更新行程设置', en: 'Update trip settings' })}</>
              : <>{T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' })} <Icon name="plus" size={18} /></>}
          </button>

          {isMobile && (
            <button
              type="button"
              className={`detail-book-disclosure${availabilityOpen ? ' is-open' : ''}`}
              onClick={() => onAvailabilityOpen(!availabilityOpen)}
            >
              <span className="detail-book-disclosure__copy">
                <span className="detail-book-disclosure__title">
                  {T({ hant: '查可售與總價', hans: '查可售与总价', en: 'Check availability' })}
                </span>
                <span className="detail-book-disclosure__meta">{mobileAvailabilitySummary}</span>
              </span>
              <Icon name={availabilityOpen ? 'chevron-up' : 'chevron-down'} size={18} />
            </button>
          )}

          {showAvailabilityPanel && (
            <div className={`detail-book-section${isMobile ? ' is-mobile' : ''}`}>
              {isMobile && (
                <div className="detail-book-section__eyebrow">
                  {T({ hant: '檢查可售狀態', hans: '检查可售状态', en: 'Check availability' })}
                </div>
              )}
              <div className="detail-book-extra" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!isMobile && (
                  <div className="detail-book-extra__title">
                    {T({ hant: '檢查可售狀態', hans: '检查可售状态', en: 'Check availability' })}
                  </div>
                )}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="detail-book-label">{T({ hant: '日期', hans: '日期', en: 'Date' })}</span>
                  <input
                    type="date"
                    min={todayIso()}
                    value={selectedDate}
                    onChange={(e) => onSelectedDate(e.target.value)}
                    className="detail-book-field"
                  />
                </label>
                {tour.startTimes && tour.startTimes.length > 0 && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="detail-book-label">{T({ hant: '時段', hans: '时段', en: 'Time' })}</span>
                    <select
                      value={selectedStartTime}
                      onChange={(e) => onSelectedStartTime(e.target.value)}
                      className="detail-book-field"
                    >
                      {(tour.startTimes || []).map((st, i) => {
                        const value = String(st.id ?? st.startTimeId ?? st.label ?? i);
                        const label = st.label || (st.hour != null
                          ? `${String(st.hour).padStart(2, '0')}:${String(st.minute || 0).padStart(2, '0')}`
                          : value);
                        return <option key={value} value={value}>{label}</option>;
                      })}
                    </select>
                  </label>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: childCategory ? '1fr 1fr' : '1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="detail-book-label">
                      {adultCategory
                        ? paxCategoryLabel(adultCategory)
                        : T({ hant: '成人', hans: '成人', en: 'Adults' })}
                    </span>
                    <select
                      value={guestCounts.adults}
                      onChange={(e) => onGuestCounts((prev) => ({ ...prev, adults: Number(e.target.value) }))}
                      className="detail-book-field"
                    >
                      {paxRange(1, paxCap).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  {childCategory && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="detail-book-label">{paxCategoryLabel(childCategory)}</span>
                      <select
                        value={guestCounts.children}
                        onChange={(e) => onGuestCounts((prev) => ({ ...prev, children: Number(e.target.value) }))}
                        className="detail-book-field"
                      >
                        {paxRange(0, paxCap).map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                </div>

                {pickupInfo && pickupInfo.enabled && pickupPlaces.length > 0 && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span className="detail-book-label">
                      {T({ hant: '選擇上車地點', hans: '选择上车地点', en: 'Select your pick-up option' })}
                    </span>
                    <select
                      value={selectedPickupId}
                      onChange={(e) => onSelectedPickupId(e.target.value)}
                      className="detail-book-field"
                    >
                      <option value="">
                        {T({ hant: '— 請選擇 —', hans: '— 请选择 —', en: '— Choose a stop —' })}
                      </option>
                      {pickupPlaces.map((p) => (
                        <option key={p.id} value={String(p.id)}>{p.title}</option>
                      ))}
                    </select>
                    {pickupInfo.noPickupMessage && (
                      <span className="detail-book-helper" style={{ font: '500 12px/1.4 var(--font-text)', color: 'var(--fg-2)' }}>
                        {pickupInfo.noPickupMessage}
                      </span>
                    )}
                  </label>
                )}

                {optionalExtras && optionalExtras.length > 0 && (
                  <fieldset className="detail-extras-fieldset">
                    <legend className="detail-book-label">
                      {T({ hant: '加購項目', hans: '加购项目', en: 'Extras' })}
                    </legend>
                    <ul className="detail-extras-checklist">
                      {optionalExtras.map((ex) => {
                        const checked = !!selectedExtras[ex.id];
                        const adultPax = Math.max(1, guestCounts.adults);
                        const childPax = Math.max(0, guestCounts.children);
                        const unit = Number(ex.price) || 0;
                        let priceLabel;
                        if (ex.free) {
                          priceLabel = T({ hant: '免費', hans: '免费', en: 'Free' });
                        } else if (ex.pricedPerPerson) {
                          const parts = [];
                          if (adultCategory) {
                            parts.push(`${paxCategoryLabel(adultCategory).split(' (')[0]} ${formatDisplayPrice(unit, displayCurrency, fxRates)}`);
                          }
                          if (childCategory && childPax > 0) {
                            parts.push(`${paxCategoryLabel(childCategory).split(' (')[0]} ${formatDisplayPrice(unit, displayCurrency, fxRates)}`);
                          }
                          priceLabel = parts.join(' · ');
                        } else {
                          priceLabel = formatDisplayPrice(unit, displayCurrency, fxRates);
                        }
                        return (
                          <li key={ex.id} className="detail-extras-checklist__item">
                            <label className="detail-extras-checkbox">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => onSelectedExtras((prev) => ({
                                  ...prev,
                                  [ex.id]: e.target.checked,
                                }))}
                              />
                              <span className="detail-extras-checkbox__body">
                                <span className="detail-extras-checkbox__title">{ex.title}</span>
                                {priceLabel && (
                                  <span className="detail-extras-checkbox__price">{priceLabel}</span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                )}

                <button
                  type="button"
                  className="detail-book-prices-link"
                  onClick={onCheckAvailability}
                  disabled={availabilityState.loading}
                  style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}
                >
                  {availabilityState.loading
                    ? T({ hant: '查詢中…', hans: '查询中…', en: 'Checking…' })
                    : T({ hant: '查看可售與價格', hans: '查看可售与价格', en: 'Check availability' })}
                </button>
                {availabilityState.error && (
                  <div style={{ color: 'var(--coral)', font: '500 12px/1.5 var(--font-text)' }}>
                    {availabilityState.error}
                  </div>
                )}
                {availabilityState.data && (
                  <div style={{
                    background: availabilityState.data.available ? 'var(--gradient-aurora-soft)' : 'var(--base-50)',
                    borderRadius: 16,
                    padding: 14,
                    boxShadow: 'inset 0 0 0 1px var(--base-200)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ font: '700 14px/1.3 var(--font-text)', color: 'var(--fg-1)' }}>
                      {availabilityState.data.available
                        ? T({ hant: '目前可預訂', hans: '目前可预订', en: 'Available now' })
                        : T({ hant: '目前無法即時預訂', hans: '目前无法即时预订', en: 'Not instantly bookable now' })}
                    </div>
                    <div style={{ font: '500 12px/1.5 var(--font-text)', color: 'var(--fg-2)' }}>
                      {selectedDate} · {guestTotal} {T({ hant: '位旅客', hans: '位旅客', en: 'traveler(s)' })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 13px/1.4 var(--font-text)', color: 'var(--fg-2)' }}>
                        <span>{T({ hant: '基礎票價', hans: '基础票价', en: 'Base fare' })}</span>
                        <span>{formatDisplayPrice(availabilityState.data.total, displayCurrency, fxRates)}</span>
                      </div>
                      {extrasSubtotal > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', font: '500 13px/1.4 var(--font-text)', color: 'var(--fg-2)' }}>
                          <span>{T({ hant: '加購', hans: '加购', en: 'Extras' })}</span>
                          <span>+{formatDisplayPrice(extrasSubtotal, displayCurrency, fxRates)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                        <span style={{ font: '600 13px/1.4 var(--font-text)', color: 'var(--fg-1)' }}>
                          {T({ hant: '總價', hans: '总价', en: 'Total' })}
                        </span>
                        <span style={{ font: '700 22px/1 var(--font-display)', color: 'var(--fg-1)' }}>
                          {formatDisplayPrice((Number(availabilityState.data.total) || 0) + (Number(extrasSubtotal) || 0), displayCurrency, fxRates)}
                        </span>
                      </div>
                    </div>
                    {Array.isArray(availabilityState.data.warnings) && availabilityState.data.warnings.length > 0 && (
                      <div style={{ font: '500 12px/1.5 var(--font-text)', color: 'var(--coral)' }}>
                        {availabilityState.data.warnings.join(' ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <button
              type="button"
              className={`detail-book-disclosure${inquiryOpen ? ' is-open' : ''}`}
              onClick={() => onInquiryOpen(!inquiryOpen)}
            >
              <span className="detail-book-disclosure__copy">
                <span className="detail-book-disclosure__title">
                  {T({ hant: '交給顧問規劃', hans: '交给顾问规划', en: 'Plan with a concierge' })}
                </span>
                <span className="detail-book-disclosure__meta">{mobileInquirySummary}</span>
              </span>
              <Icon name={inquiryOpen ? 'chevron-up' : 'chevron-down'} size={18} />
            </button>
          )}

          {!isMobile && (
            <button
              type="button"
              className="detail-book-prices-link"
              onClick={() => onInquiryOpen(!inquiryOpen)}
              style={{ display: 'inline-flex', justifyContent: 'center', width: '100%' }}
            >
              {inquiryOpen
                ? T({ hant: '收合顧問需求', hans: '收起顾问需求', en: 'Hide concierge form' })
                : T({ hant: '交給顧問規劃', hans: '交给顾问规划', en: 'Plan with a concierge' })}
            </button>
          )}

          {showInquiryPanel && (
            <div className={`detail-book-section${isMobile ? ' is-mobile' : ''}`}>
              {isMobile && (
                <div className="detail-book-section__eyebrow">
                  {T({ hant: '讓我們協助你安排', hans: '让我们协助你安排', en: 'Let us help plan it' })}
                </div>
              )}
              <form onSubmit={onSubmitInquiry} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  className="detail-book-field"
                  placeholder={T({ hant: '你的姓名', hans: '你的姓名', en: 'Your name' })}
                  value={inquiryForm.name}
                  onChange={(e) => onInquiryForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <input
                  type="email"
                  className="detail-book-field"
                  placeholder={T({ hant: '電子郵件', hans: '电子邮箱', en: 'Email' })}
                  value={inquiryForm.email}
                  onChange={(e) => onInquiryForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
                <input
                  className="detail-book-field"
                  placeholder={T({ hant: '手機號碼', hans: '手机号', en: 'Phone number' })}
                  value={inquiryForm.phone}
                  onChange={(e) => onInquiryForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <select
                  className="detail-book-field"
                  value={inquiryForm.budgetRange}
                  onChange={(e) => onInquiryForm((prev) => ({ ...prev, budgetRange: e.target.value }))}
                >
                  <option value="">{T({ hant: '預算範圍（選填）', hans: '预算范围（选填）', en: 'Budget range (optional)' })}</option>
                  <option value="USD_1000_3000">USD 1,000 - 3,000</option>
                  <option value="USD_3000_5000">USD 3,000 - 5,000</option>
                  <option value="USD_5000_PLUS">USD 5,000+</option>
                </select>
                <textarea
                  className="detail-book-field"
                  rows="4"
                  placeholder={T({
                    hant: `告訴我們你的需求${trip && trip.length > 1 ? '（已自動附上目前行程）' : ''}`,
                    hans: `告诉我们你的需求${trip && trip.length > 1 ? '（已自动附上当前行程）' : ''}`,
                    en: `Tell us what you need${trip && trip.length > 1 ? ' (current trip included automatically)' : ''}`,
                  })}
                  value={inquiryForm.notes}
                  onChange={(e) => onInquiryForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <button type="submit" className="detail-book-cta" disabled={inquirySubmitting}>
                  {inquirySubmitting
                    ? T({ hant: '送出中…', hans: '提交中…', en: 'Sending…' })
                    : T({ hant: '送出顧問需求', hans: '提交顾问需求', en: 'Send request' })}
                </button>
              </form>
            </div>
          )}

            {inquiryStatus.message && (
              <div style={{
                color: inquiryStatus.ok ? 'var(--success)' : 'var(--coral)',
                font: '500 12px/1.5 var(--font-text)',
              }}>
                {inquiryStatus.message}
              </div>
            )}
          </div>
        </aside>

        {isMobile && (
          <div className={`detail-mobile-sticky-bar${stickyBarVisible ? ' is-visible' : ''}`}>
            <div className="detail-mobile-sticky-bar__price">
              <span className="detail-mobile-sticky-bar__label">
                {T({ hant: '每人起價', hans: '每人起价', en: 'From per person' })}
              </span>
              <strong>{priceLabel}</strong>
            </div>
            <button
              type="button"
              className="detail-mobile-sticky-bar__cta"
              onClick={onAddSelection}
            >
              {inTrip
                ? T({ hant: '更新行程', hans: '更新行程', en: 'Update trip' })
                : T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' })}
            </button>
          </div>
        )}
      </>
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
