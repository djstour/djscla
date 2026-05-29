/* ActivityDetail — product page; detail from GET /api/bokun/activity (Bókun REST v2 components). */

(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const {
    Icon, formatDisplayPrice, fakePhoto, pick, proxyImageUrl,
    useResponsiveImageProfile, useMobileViewport,
    sanitizeVendorHtml, vendorHtmlIsMeaningful,
  } = window.AuralisUI;
  const Pax = window.AuralisPax || {};

  function getBookableCategories(tour) {
    if (!tour) return [];
    if (Pax.bookablePricingCategories) return Pax.bookablePricingCategories(tour);
    const list = tour.pricingCategories || tour.raw?.pricingCategories || [];
    return [...list]
      .filter((c) => c && c.id != null && !c.internalUseOnly)
      .sort((a, b) => {
        const order = { ADULT: 0, TEENAGER: 1, CHILD: 2 };
        const ao = order[a.ticketCategory];
        const bo = order[b.ticketCategory];
        if (ao != null && bo != null && ao !== bo) return ao - bo;
        return (Number(b.minAge) || 0) - (Number(a.minAge) || 0);
      });
  }

  function paxLabel(cat) {
    if (!cat) return '';
    if (Pax.paxCategoryLabel) return Pax.paxCategoryLabel(cat);
    if (cat.fullTitle) return String(cat.fullTitle).trim();
    return cat.title || '';
  }

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
    const UI = window.AuralisUI || {};
    const fxRates = (window.AuralisData && window.AuralisData._fxRates) || { USD: 1 };
    const toUsd = (amount, currency) => (
      UI.amountToUsd
        ? UI.amountToUsd(amount, currency || 'USD', fxRates)
        : Number(amount) || 0
    );

    const direct = Number(tour.priceUsd ?? tour.price);
    if (Number.isFinite(direct) && direct > 0) {
      return toUsd(direct, tour.priceCurrency || tour.sourcePriceCurrency || 'USD');
    }
    const rows = tour.priceTable || [];
    const amounts = rows
      .map((r) => toUsd(r.amount, r.currency || r.sourceCurrency || tour.sourcePriceCurrency || 'USD'))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (amounts.length) return Math.min(...amounts);
    return null;
  }

  function normalizeUnitUsd(amount, currency) {
    const UI = window.AuralisUI || {};
    const fxRates = (window.AuralisData && window.AuralisData._fxRates) || { USD: 1 };
    if (UI.amountToUsd) return UI.amountToUsd(amount, currency || 'USD', fxRates);
    return Number(amount) || 0;
  }

  // --- Itinerary map (stylized Iceland silhouette + route pins) -----------------
  // Matches the TripPanel map projection so we can reuse Bókun stops geoPoints
  // without needing a third-party map API.
  const ITINERARY_ICELAND_PATH = "M120 320 Q 100 250 160 200 Q 200 160 280 170 Q 340 130 420 145 Q 510 110 600 150 Q 690 130 770 180 Q 850 200 890 260 Q 920 320 870 380 Q 830 430 740 440 Q 670 470 580 450 Q 500 480 420 470 Q 340 490 260 460 Q 180 440 140 390 Z";
  const ITINERARY_PROJ = {
    lngMin: -24.5, lngMax: -13.5,
    latMin: 63.0, latMax: 67.0,
    xMin: 80, xMax: 920,
    yMin: 130, yMax: 470,
  };
  function projectStop(lat, lng) {
    const x = ITINERARY_PROJ.xMin + (lng - ITINERARY_PROJ.lngMin) / (ITINERARY_PROJ.lngMax - ITINERARY_PROJ.lngMin) * (ITINERARY_PROJ.xMax - ITINERARY_PROJ.xMin);
    const y = ITINERARY_PROJ.yMin + (ITINERARY_PROJ.latMax - lat) / (ITINERARY_PROJ.latMax - ITINERARY_PROJ.latMin) * (ITINERARY_PROJ.yMax - ITINERARY_PROJ.yMin);
    return { x, y };
  }

  function ItineraryMap({ stops = [] }) {
    const pins = stops
      .map((s, i) => {
        const geo = s?.geo || s?.geoPoint || s?.geo_point || null;
        const lat = geo?.latitude ?? geo?.lat;
        const lng = geo?.longitude ?? geo?.lng ?? geo?.lon;
        if (lat == null || lng == null) return null;
        const { x, y } = projectStop(Number(lat), Number(lng));
        return { id: s.id ?? i, x, y, name: s.name || s.title || '', idx: i + 1 };
      })
      .filter(Boolean);

    if (!pins.length) return null;

    return (
      <div className="detail-itinerary-map" aria-label="Route map">
        <svg className="detail-itinerary-map__svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice">
          <g opacity="0.18" stroke="rgba(17,21,31,0.7)" strokeWidth="0.5">
            {Array.from({ length: 12 }, (_, i) => (
              <line key={'h'+i} x1="0" y1={i*50} x2="1000" y2={i*50}/>
            ))}
            {Array.from({ length: 20 }, (_, i) => (
              <line key={'v'+i} x1={i*50} y1="0" x2={i*50} y2="600"/>
            ))}
          </g>
          <path d={ITINERARY_ICELAND_PATH} fill="rgba(255,255,255,0.80)" stroke="rgba(11,21,31,0.18)" strokeWidth="1.5"/>

          {pins.map((p, i) => {
            const next = pins[i + 1];
            if (!next) return null;
            return (
              <line
                key={'l'+p.id}
                x1={p.x}
                y1={p.y}
                x2={next.x}
                y2={next.y}
                stroke="rgba(0,213,255,0.55)"
                strokeWidth="2.4"
                strokeDasharray="2 8"
                strokeLinecap="round"
              />
            );
          })}

          {pins.map((p) => (
            <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
              <circle
                r="18"
                fill="rgba(107,47,230,0.95)"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="3"
                filter="drop-shadow(0 6px 14px rgba(0,0,0,0.25))"
              />
              <text
                x="0"
                y="6"
                textAnchor="middle"
                fill="#fff"
                fontFamily="Sora, system-ui"
                fontSize="16"
                fontWeight="800"
              >
                {p.idx}
              </text>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function nextIsoDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
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
    onBookNow,
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
    // Lightbox state — full-screen photo modal (Trip.com / Klook / Booking.com
    // pattern). Decoupled from `activePhoto` so the hero can keep its own
    // selection while the modal navigates independently.
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const [compactHeader, setCompactHeader] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [priceSheetOpen, setPriceSheetOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState(() => {
      const min = todayIso();
      const fromTrip = initialDate && initialDate >= min ? initialDate : null;
      return fromTrip || nextIsoDate(14);
    });
    // Day-level Bókun availability snapshot for the currently selected date.
    // Bubbled up by MonthAvailabilityCalendar and used to filter the TIME
    // dropdown to slots that actually exist on that day.
    const [selectedDayInfo, setSelectedDayInfo] = useState(null);
    const [selectedStartTime, setSelectedStartTime] = useState('');
    const [paxCounts, setPaxCounts] = useState({});
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
    const [detailTab, setDetailTab] = useState('description');
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
      setLightboxOpen(false);
      setLightboxIndex(0);
      setDescExpanded(false);
      setDetailTab('description');
      setPriceSheetOpen(false);
      setCompactHeader(false);
      setSelectedDate(fromTrip || nextIsoDate(14));
      setSelectedStartTime(initialBookingSelection?.startTimeId ? String(initialBookingSelection.startTimeId) : '');
      if (tour) {
        const cats = getBookableCategories(tour);
        if (Pax.initPaxCounts) {
          setPaxCounts(Pax.initPaxCounts(cats, initialGuestCounts));
        } else {
          const next = {};
          const defaultAdult = (Pax.DEFAULT_ADULT_PAX != null) ? Pax.DEFAULT_ADULT_PAX : 2;
          cats.forEach((c) => { next[String(c.id)] = c.defaultCategory ? defaultAdult : 0; });
          setPaxCounts(next);
        }
      } else {
        setPaxCounts({});
      }
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

    // ⚠️ All hooks below run on every render — keep them ABOVE the
    // `if (!tour) return …` early-returns or React throws #310 (hooks order).
    // Per-day times derived from the calendar payload. Falls back to the
    // generic tour.startTimes when the calendar hasn't surfaced a snapshot
    // yet (e.g. initial page render before MonthAvailabilityCalendar fetches).
    const dayAvailableTimes = useMemo(() => {
      if (selectedDayInfo && Array.isArray(selectedDayInfo.times) && selectedDayInfo.times.length) {
        return selectedDayInfo.times
          .filter((t) => !t.soldOut)
          .map((t) => ({
            id: t.startTimeId,
            startTime: t.startTime,
            label: t.label || t.startTime,
            capacityRemaining: t.capacityRemaining,
          }));
      }
      const startTimes = (tour && tour.startTimes) || [];
      return startTimes.map((st, i) => ({
        id: st.id ?? st.startTimeId ?? null,
        startTime: st.label || (st.hour != null
          ? `${String(st.hour).padStart(2, '0')}:${String(st.minute || 0).padStart(2, '0')}`
          : String(i)),
        label: st.label || (st.hour != null
          ? `${String(st.hour).padStart(2, '0')}:${String(st.minute || 0).padStart(2, '0')}`
          : null),
        capacityRemaining: null,
      }));
    }, [selectedDayInfo, tour && tour.startTimes]);

    const bookingPaxCap = tour
      ? (Number.isFinite(Number(tour.passCapacity)) && Number(tour.passCapacity) > 0
        ? Number(tour.passCapacity)
        : DETAIL_PAX_MAX)
      : DETAIL_PAX_MAX;

    const livePaxMax = useMemo(() => {
      if (!tour || !Pax.resolveLivePaxCap) return bookingPaxCap;
      return Pax.resolveLivePaxCap({
        bookingCap: bookingPaxCap,
        dayInfo: selectedDayInfo,
        startTimeId: selectedStartTime,
        dayTimes: dayAvailableTimes,
        availabilityCheck: availabilityState.data,
      });
    }, [
      tour && tour.id,
      tour && tour.passCapacity,
      bookingPaxCap,
      selectedDayInfo,
      selectedStartTime,
      dayAvailableTimes,
      availabilityState.data,
    ]);

    const liveCapacityKnown = useMemo(() => {
      if (!selectedDate) return false;
      const fromCheck = availabilityState.data?.availability?.capacityRemaining;
      if (Number.isFinite(Number(fromCheck))) return true;
      if (selectedStartTime && dayAvailableTimes.length) {
        const slot = dayAvailableTimes.find((t) => String(t.id) === String(selectedStartTime));
        if (slot && Number.isFinite(Number(slot.capacityRemaining))) return true;
      }
      if (dayAvailableTimes.length === 1 && Number.isFinite(Number(dayAvailableTimes[0].capacityRemaining))) {
        return true;
      }
      if (selectedDayInfo && Number.isFinite(Number(selectedDayInfo.capacityRemaining))) return true;
      return false;
    }, [
      selectedDate,
      selectedStartTime,
      dayAvailableTimes,
      selectedDayInfo,
      availabilityState.data,
    ]);

    useEffect(() => {
      if (!tour || !Pax.clampPaxCounts) return undefined;
      const cats = getBookableCategories(tour);
      if (!cats.length) return undefined;
      setPaxCounts((prev) => {
        if (!Pax.paxCountsTotal(prev) || Pax.paxCountsTotal(prev) <= livePaxMax) return prev;
        return Pax.clampPaxCounts(prev, cats, livePaxMax);
      });
      return undefined;
    }, [livePaxMax, tour && tour.id, selectedDate, selectedStartTime]);

    // Auto-trigger the availability check whenever the booking inputs change.
    // Debounced 400ms so quickly toggling adults / extras doesn't spam Bókun.
    // The user can still manually re-trigger via the "Check availability"
    // button (kept as both an affordance and a "retry" path on errors).
    const extrasKey = useMemo(() => {
      return Object.entries(selectedExtras)
        .filter(([, on]) => on)
        .map(([id]) => id)
        .sort()
        .join(',');
    }, [selectedExtras]);
    useEffect(() => {
      if (!tour || !selectedDate || !Pax.paxCountsTotal(paxCounts)) return undefined;
      const handle = setTimeout(() => { checkAvailability(); }, 400);
      return () => clearTimeout(handle);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      tour && tour.id,
      selectedDate,
      selectedStartTime,
      JSON.stringify(paxCounts),
      selectedPickupId,
      extrasKey,
      lang,
    ]);

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
    const bookableCategories = getBookableCategories(tour);
    const hasMultiPrice = bookableCategories.length > 1;
    const categoryUnitPrices = (availabilityState.data && availabilityState.data.categoryUnitPrices) || [];
    const unitPriceByCategoryId = new Map();
    categoryUnitPrices.forEach((row) => {
      if (row && row.pricingCategoryId != null && Number(row.unitAmount) > 0) {
        unitPriceByCategoryId.set(
          String(row.pricingCategoryId),
          normalizeUnitUsd(row.unitAmount, row.currency),
        );
      }
    });
    bookableCategories.forEach((cat) => {
      const key = String(cat.id);
      if (!unitPriceByCategoryId.has(key) && Pax.unitPriceFromTour) {
        const fromTour = Pax.unitPriceFromTour(tour, cat.id);
        if (fromTour != null && fromTour > 0) unitPriceByCategoryId.set(key, fromTour);
      }
    });
    const guestTotalLive = Pax.paxCountsTotal ? Pax.paxCountsTotal(paxCounts) : 0;
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
    const hasRequirements = vendorHtmlIsMeaningful(requirementsHtml);
    const hasAttention = vendorHtmlIsMeaningful(attentionHtml);
    const hasCancellationPolicy = vendorHtmlIsMeaningful(cancellationPolicyHtml);
    const extras = Array.isArray(tour.bookableExtras) ? tour.bookableExtras : [];
    const hasExtras = extras.length > 0;
    const optionalExtras = extras.filter((ex) => !ex.included && (!ex.selectionType || ex.selectionType === 'OPTIONAL'));
    const pickupInfo = tour.pickupInfo || null;
    const showPickupInfo = pickupInfo && pickupInfo.enabled;
    const pickupPlaces = Array.isArray(pickupInfo?.places) ? pickupInfo.places : [];
    const pickupAtHostedCheckout = !!(pickupInfo && pickupInfo.selectionAtHostedCheckout);
    const pickupNoMessageHtml = sanitizeVendorHtml(pickupInfo?.noPickupMessage || '');
    const pickupNoMessageHasHtml = vendorHtmlIsMeaningful(pickupNoMessageHtml);
    const paxCap = livePaxMax;
    // Client-side extras subtotal so the booking summary mirrors Bókun's "Total".
    const extrasSubtotal = optionalExtras.reduce((sum, ex) => {
      if (!selectedExtras[ex.id]) return sum;
      const unit = Number(ex.price) || 0;
      if (ex.pricedPerPerson) return sum + unit * Math.max(1, guestTotalLive);
      return sum + unit;
    }, 0);

    // ---- Quick facts (mirrors Bókun back office "Quick facts" sidebar) ---
    // Bókun's product page surfaces a 2-column box at the bottom with
    // Experience type / Duration / Booking in advance / Difficulty /
    // Know before you go / Categories / Live tour guide. We piece the
    // same value set together from the structured enums on the activity
    // payload so vendors don't have to maintain duplicate content.
    const enumLabel = (group, code) => {
      if (!code) return '';
      const map = (window.AuralisData && window.AuralisData.BOKUN_TRANSLATIONS && window.AuralisData.BOKUN_TRANSLATIONS[group]) || null;
      const overlay = map && map[code];
      if (overlay && overlay[lang]) return overlay[lang];
      if (overlay && overlay.en) return overlay.en;
      return String(code).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };
    const experienceType = enumLabel('ACTIVITY_TYPE', tour.activityType);
    const difficultyLabel = enumLabel('DIFFICULTY', tour.difficultyLevel);
    const inclusionLabels = (tour.inclusionsList || [])
      .map((code) => enumLabel('INCLUSION_EXCLUSION', code))
      .filter(Boolean);
    const exclusionLabels = (tour.exclusionsList || [])
      .map((code) => enumLabel('INCLUSION_EXCLUSION', code))
      .filter(Boolean);
    const hasIncluded = vendorHtmlIsMeaningful(includedHtml) || inclusionLabels.length > 0;
    const hasExcluded = vendorHtmlIsMeaningful(excludedHtml) || exclusionLabels.length > 0;

    // Booking cutoff: compose a human-readable string from whichever of
    // days/hours/minutes/weeks Bókun populated. We pluralise minimally so
    // EN reads naturally ("1 hour" / "2 hours") while CJK stays simple.
    const cutoffParts = [];
    const cutoffPush = (n, hant, hans, en, enPl) => {
      if (!Number.isFinite(Number(n)) || Number(n) <= 0) return;
      const val = Number(n);
      cutoffParts.push(T({
        hant: `${val} ${hant}`,
        hans: `${val} ${hans}`,
        en: `${val} ${val === 1 ? en : enPl}`,
      }));
    };
    cutoffPush(tour.bookingCutoffWeeks, '週',   '周',   'week',   'weeks');
    cutoffPush(tour.bookingCutoffDays,  '天',   '天',   'day',    'days');
    cutoffPush(tour.bookingCutoffHours, '小時', '小时', 'hour',   'hours');
    cutoffPush(tour.bookingCutoffMinutes, '分鐘', '分钟', 'minute', 'minutes');
    let bookingCutoffText = cutoffParts.length
      ? T({
          hant: `截止：${cutoffParts.join(' ')}`,
          hans: `截止：${cutoffParts.join(' ')}`,
          en: `Cut off: ${cutoffParts.join(' ')}`,
        })
      : '';
    if (!bookingCutoffText && Number.isFinite(Number(tour.bookingCutoffTotalMinutes)) && tour.bookingCutoffTotalMinutes > 0) {
      const totalMin = Number(tour.bookingCutoffTotalMinutes);
      const hours = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      const parts = [];
      if (hours > 0) {
        parts.push(T({
          hant: `${hours} 小時`,
          hans: `${hours} 小时`,
          en: `${hours} hour${hours === 1 ? '' : 's'}`,
        }));
      }
      if (mins > 0) {
        parts.push(T({
          hant: `${mins} 分鐘`,
          hans: `${mins} 分钟`,
          en: `${mins} minute${mins === 1 ? '' : 's'}`,
        }));
      }
      if (parts.length) {
        bookingCutoffText = T({
          hant: `截止：${parts.join(' ')}`,
          hans: `截止：${parts.join(' ')}`,
          en: `Cut off: ${parts.join(' ')}`,
        });
      }
    }

    // Combine ACTIVITY_CATEGORY + ACTIVITY_ATTRIBUTE chips (same visual row
    // in Bókun). De-dupe in case a vendor tags the same theme twice.
    const categoryChips = [];
    (tour.activityCategories || []).forEach((c) => {
      const lbl = enumLabel('ACTIVITY_CATEGORY', c);
      if (lbl && !categoryChips.includes(lbl)) categoryChips.push(lbl);
    });
    (tour.activityAttributes || []).forEach((c) => {
      const lbl = enumLabel('ACTIVITY_ATTRIBUTE', c);
      if (lbl && !categoryChips.includes(lbl)) categoryChips.push(lbl);
    });
    (tour.categoryLabels || []).forEach((lbl) => {
      if (!lbl) return;
      const isEnumCode = /^[A-Z][A-Z0-9_]*$/.test(String(lbl).trim());
      const translated = isEnumCode
        ? (enumLabel('ACTIVITY_CATEGORY', lbl) || enumLabel('ACTIVITY_ATTRIBUTE', lbl) || lbl)
        : lbl;
      if (translated && !categoryChips.includes(translated)) categoryChips.push(translated);
    });

    // "Know before you go" — Bókun auto-prefixes "Minimum age of participants is: N"
    // when the activity has a minAge but vendor didn't write a custom item, so we
    // do the same to keep parity.
    const knowItems = [];
    if (Number.isFinite(Number(tour.minAge)) && Number(tour.minAge) > 0) {
      knowItems.push(T({
        hant: `最低年齡：${tour.minAge} 歲`,
        hans: `最低年龄：${tour.minAge} 岁`,
        en: `Minimum age of participants is: ${tour.minAge}`,
      }));
    }
    (tour.knowBeforeYouGoItems || []).forEach((item) => {
      const code = typeof item === 'string' ? item : (item?.code || item?.type || item?.text || '');
      const text = enumLabel('KNOW_BEFORE_YOU_GO', code) || (typeof item === 'string' ? item : (item?.text || item?.label || ''));
      if (text && !knowItems.includes(text)) knowItems.push(text);
    });

    // Live tour guide — prefer guidanceTypes' pre-localised displayLanguages,
    // fall back to the raw `languages` codes via GUIDE_LANGUAGE overlay.
    const liveGuideNames = [];
    (tour.guidanceTypes || []).forEach((g) => {
      // zh locales: prefer language-code mapping to avoid English displayLanguages.
      const codes = Array.isArray(g.languages) ? g.languages : [];
      codes.forEach((code) => {
        const lbl = window.AuralisData?.BokunAdapter?.guideLanguageLabel
          ? window.AuralisData.BokunAdapter.guideLanguageLabel(code, lang)
          : enumLabel('GUIDE_LANGUAGE', code);
        if (lbl && !liveGuideNames.includes(lbl)) liveGuideNames.push(lbl);
      });
      (g.displayLanguages || []).forEach((d) => {
        if (d && !liveGuideNames.includes(d)) liveGuideNames.push(d);
      });
    });
    if (liveGuideNames.length === 0 && Array.isArray(tour.languages)) {
      tour.languages.forEach((code) => {
        const lbl = window.AuralisData?.BokunAdapter?.guideLanguageLabel
          ? window.AuralisData.BokunAdapter.guideLanguageLabel(code, lang)
          : enumLabel('GUIDE_LANGUAGE', code);
        if (lbl && !liveGuideNames.includes(lbl)) liveGuideNames.push(lbl);
      });
    }

    const quickFacts = [
      experienceType && { label: T({ hant: '行程類型', hans: '行程类型', en: 'Experience type' }), value: experienceType },
      tour.durationText && { label: T({ hant: '時長', hans: '时长', en: 'Duration' }), value: tour.durationText },
      bookingCutoffText && { label: T({ hant: '預訂提前期', hans: '预订提前期', en: 'Booking in advance' }), value: bookingCutoffText },
      difficultyLabel && { label: T({ hant: '體能難度', hans: '体能难度', en: 'Physical difficulty level' }), value: difficultyLabel },
      knowItems.length > 0 && { label: T({ hant: '出發前須知', hans: '出发前须知', en: 'Know before you go' }), valueItems: knowItems },
      categoryChips.length > 0 && { label: T({ hant: '分類', hans: '分类', en: 'Categories' }), valueChips: categoryChips },
      liveGuideNames.length > 0 && { label: T({ hant: '隨團導遊語言', hans: '随团导游语言', en: 'Live tour guide' }), value: liveGuideNames.join(', ') },
    ].filter(Boolean);
    const hasQuickFacts = quickFacts.length > 0;

    const hasDescriptionTab = !!(
      tour.description
      || loading
      || hasIncluded
      || hasExcluded
      || hasRequirements
      || hasAttention
      || hasCancellationPolicy
      || hasQuickFacts
    );
    const hasItineraryTab = stopsNamed.length > 0;
    const itineraryTitleOnly = hasItineraryTab && stopsNamed.every((s) => {
      const desc = s.description && String(s.description).trim();
      const excerpt = s.excerpt && String(s.excerpt).trim();
      return !excerpt && !desc;
    });
    const hasPickupTab = !!(
      (showPickupInfo && (
        pickupPlaces.length > 0
        || pickupInfo.noPickupMessage
        || pickupAtHostedCheckout
      ))
      || tour.meetingPoint
    );

    const detailTabs = [
      hasDescriptionTab && {
        id: 'description',
        label: T({ hant: '行程說明', hans: '行程说明', en: 'Description' }),
      },
      hasItineraryTab && {
        id: 'itinerary',
        label: T({ hant: '行程安排', hans: '行程安排', en: 'Itinerary' }),
      },
      hasPickupTab && {
        id: 'pickup',
        label: T({ hant: '接送地點', hans: '接送地点', en: 'Pick-up' }),
      },
    ].filter(Boolean);

    const activeDetailTab = detailTabs.some((t) => t.id === detailTab)
      ? detailTab
      : (detailTabs[0]?.id || 'description');

    // `hasExtras` flag retained for future use; extras now live in BookPanel.
    void hasExtras;

    function estimateSelectionBaseTotalUsd() {
      const fallbackUnit = Number(resolvePriceUsd(tour)) || 0;
      return bookableCategories.reduce((sum, cat) => {
        const qty = Number(paxCounts[String(cat.id)]) || 0;
        if (!qty) return sum;
        const unit = unitPriceByCategoryId.get(String(cat.id)) ?? fallbackUnit;
        return sum + unit * qty;
      }, 0);
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
        guests: Pax.paxCountsToLegacyGuests
          ? { ...Pax.paxCountsToLegacyGuests(bookableCategories, paxCounts), paxCounts: { ...paxCounts } }
          : { adults: (Pax.DEFAULT_ADULT_PAX != null) ? Pax.DEFAULT_ADULT_PAX : 2, children: 0 },
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

    // Wrapper used by the calendar so we can snapshot the day's per-time
    // availability and reset selectedStartTime if it's no longer offered on
    // the new day.
    function handleSelectedDate(iso, dayInfo) {
      setSelectedDate(iso);
      setSelectedDayInfo(dayInfo || null);
      if (dayInfo && Array.isArray(dayInfo.times) && selectedStartTime) {
        const allowed = new Set(
          dayInfo.times.filter((t) => !t.soldOut).map((t) => String(t.startTimeId)),
        );
        if (!allowed.has(String(selectedStartTime))) {
          setSelectedStartTime('');
        }
      }
    }

    async function checkAvailability() {
      const pax = Pax.buildAvailabilityPax
        ? Pax.buildAvailabilityPax(bookableCategories, paxCounts)
        : [];
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
          guests: Pax.paxCountsToLegacyGuests
            ? Pax.paxCountsToLegacyGuests(bookableCategories, paxCounts)
            : { adults: (Pax.DEFAULT_ADULT_PAX != null) ? Pax.DEFAULT_ADULT_PAX : 2, children: 0 },
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
            pax: guestTotalLive,
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
          {/* Click anywhere on the hero photo to open the full-screen
              lightbox (Trip.com / Booking.com / Airbnb convention). The
              button sits above the scrim but below the top bar / caption
              so back/counter chips remain interactive. */}
          {galleryPhotos.length > 0 && (
            <button
              type="button"
              className="detail-hero-open-lightbox"
              onClick={() => { setLightboxIndex(safeIndex); setLightboxOpen(true); }}
              aria-label={T({ hant: '檢視所有照片', hans: '查看所有照片', en: 'View all photos' })}
            />
          )}
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

          {/* Floating "View all photos" button — explicit affordance for
              users who don't realise the hero is clickable. */}
          {galleryPhotos.length > 1 && (
            <button
              type="button"
              className="detail-hero-gallery-btn"
              onClick={() => { setLightboxIndex(safeIndex); setLightboxOpen(true); }}
            >
              <Icon name="grid" size={14} />
              {T({
                hant: `檢視全部 ${galleryPhotos.length} 張照片`,
                hans: `查看全部 ${galleryPhotos.length} 张照片`,
                en: `View all ${galleryPhotos.length} photos`,
              })}
            </button>
          )}

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
                  // Single click swaps the hero (existing snappy behavior);
                  // double click opens the full lightbox at that photo.
                  // A small "expand" icon is also shown on the active thumb.
                  onClick={() => setActivePhoto(i)}
                  onDoubleClick={() => { setLightboxIndex(i); setLightboxOpen(true); }}
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

            {detailTabs.length > 0 && (
              <div className="detail-tabs-wrap">
                <div
                  className="detail-tabs"
                  role="tablist"
                  aria-label={T({ hant: '行程內容', hans: '行程内容', en: 'Activity details' })}
                >
                  {detailTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`detail-tab-${tab.id}`}
                      className={`detail-tabs__btn${activeDetailTab === tab.id ? ' is-active' : ''}`}
                      aria-selected={activeDetailTab === tab.id}
                      aria-controls={`detail-panel-${tab.id}`}
                      onClick={() => setDetailTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeDetailTab === 'description' && hasDescriptionTab && (
                  <div
                    id="detail-panel-description"
                    role="tabpanel"
                    aria-labelledby="detail-tab-description"
                    className="detail-tab-panel"
                  >
                    {(tour.description || loading) && (
                      <div className="detail-tab-panel__block">
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
                      </div>
                    )}

                    {hasIncluded && (
                      <SubSection title={T({ hant: '費用包含', hans: '费用包含', en: 'Included' })}>
                        {inclusionLabels.length > 0 && (
                          <ul className="detail-fact__items detail-enum-list">
                            {inclusionLabels.map((lbl) => (<li key={lbl}>{lbl}</li>))}
                          </ul>
                        )}
                        {vendorHtmlIsMeaningful(includedHtml) && (
                          <div className="detail-vendor-html" dangerouslySetInnerHTML={{ __html: includedHtml }} />
                        )}
                      </SubSection>
                    )}

                    {hasExcluded && (
                      <SubSection title={T({ hant: '費用不含', hans: '费用不含', en: 'Excluded' })}>
                        {exclusionLabels.length > 0 && (
                          <ul className="detail-fact__items detail-enum-list">
                            {exclusionLabels.map((lbl) => (<li key={lbl}>{lbl}</li>))}
                          </ul>
                        )}
                        {vendorHtmlIsMeaningful(excludedHtml) && (
                          <div className="detail-vendor-html" dangerouslySetInnerHTML={{ __html: excludedHtml }} />
                        )}
                      </SubSection>
                    )}

                    {hasRequirements && (
                      <SubSection title={T({ hant: '參加條件', hans: '参加条件', en: 'Requirements' })}>
                        <div className="detail-vendor-html" dangerouslySetInnerHTML={{ __html: requirementsHtml }} />
                      </SubSection>
                    )}

                    {hasAttention && (
                      <SubSection title={T({ hant: '注意事項', hans: '注意事项', en: 'Attention' })}>
                        <div className="detail-attention-card">
                          <Icon name="info" size={18} color="var(--warning, #FFB347)" />
                          <div className="detail-vendor-html" dangerouslySetInnerHTML={{ __html: attentionHtml }} />
                        </div>
                      </SubSection>
                    )}

                    {hasCancellationPolicy && (
                      <SubSection title={T({ hant: '取消政策', hans: '取消政策', en: 'Cancellation policy' })}>
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
                      </SubSection>
                    )}

                    {hasQuickFacts && (
                      <SubSection title={T({ hant: '快速資訊', hans: '快速资讯', en: 'Quick facts' })}>
                        <div className="detail-facts-card">
                          <div className="detail-facts-grid">
                            {quickFacts.map((f, i) => {
                              const fullRow = f.valueChips || (f.valueItems && f.valueItems.length > 1);
                              return (
                                <div key={i} className={`detail-fact${fullRow ? ' detail-fact--full' : ''}`}>
                                  <div className="detail-fact__label">{f.label}</div>
                                  {f.valueChips ? (
                                    <div className="detail-fact__chips">
                                      {f.valueChips.map((chip, ci) => (
                                        <span key={ci} className="detail-chip">{chip}</span>
                                      ))}
                                    </div>
                                  ) : f.valueItems ? (
                                    f.valueItems.length === 1 ? (
                                      <div className="detail-fact__value">{f.valueItems[0]}</div>
                                    ) : (
                                      <ul className="detail-fact__items">
                                        {f.valueItems.map((it, ii) => (<li key={ii}>{it}</li>))}
                                      </ul>
                                    )
                                  ) : (
                                    <div className="detail-fact__value">{f.value}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </SubSection>
                    )}
                  </div>
                )}

                {activeDetailTab === 'itinerary' && hasItineraryTab && (
                  <div
                    id="detail-panel-itinerary"
                    role="tabpanel"
                    aria-labelledby="detail-tab-itinerary"
                    className="detail-tab-panel"
                  >
                    {itineraryTitleOnly && (
                      <p className="detail-tab-panel__lead">
                        {T({
                          hant: '以下為停靠站點概覽；完整行程敘述請見「行程說明」。',
                          hans: '以下为停靠站点概览；完整行程叙述请见「行程说明」。',
                          en: 'Stops below are a route overview. Full narrative is in the Description tab.',
                        })}
                      </p>
                    )}
                    <ItineraryMap stops={stopsNamed} />
                    <ol className="detail-stops-list">
                      {stopsNamed.map((stop, i) => {
                        const stopDescHtml = stop.description && /<[a-z][\s\S]*?>/i.test(stop.description)
                          ? sanitizeVendorHtml(stop.description)
                          : '';
                        return (
                          <li key={stop.id} className="detail-stop">
                            <span className="detail-stop__num">{i + 1}</span>
                            <div>
                              <div className="detail-stop__name">{stop.name}</div>
                              {stop.excerpt && (
                                <div className="detail-stop__excerpt">{stop.excerpt}</div>
                              )}
                              {stopDescHtml ? (
                                <div
                                  className="detail-vendor-html detail-stop__body"
                                  dangerouslySetInnerHTML={{ __html: stopDescHtml }}
                                />
                              ) : (stop.description && (
                                <div className="detail-stop__body">{stop.description}</div>
                              ))}
                              {stop.address && (
                                <div className="detail-stop__address">{stop.address}</div>
                              )}
                              {stop.durationMinutes > 0 && (
                                <div className="detail-stop__dur">{stop.durationMinutes} min</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                {activeDetailTab === 'pickup' && hasPickupTab && (
                  <div
                    id="detail-panel-pickup"
                    role="tabpanel"
                    aria-labelledby="detail-tab-pickup"
                    className="detail-tab-panel"
                  >
                    {showPickupInfo && pickupAtHostedCheckout && pickupPlaces.length === 0 && (
                      <p className="detail-tab-panel__lead detail-hosted-pickup-note">
                        {T({
                          hant: '本行程提供接送服務。上車地點將在 Bókun 結帳頁面選擇（與官方預訂小工具相同）。',
                          hans: '本行程提供接送服务。上车地点将在 Bókun 结账页面选择（与官方预订小工具相同）。',
                          en: 'Pick-up is available for this experience. You will choose your pick-up stop on the Bókun checkout page, same as the official booking widget.',
                        })}
                      </p>
                    )}

                    {showPickupInfo && pickupPlaces.length > 0 && (
                      <>
                        <p className="detail-tab-panel__lead">
                          {T({
                            hant: '本行程提供以下地點接送：',
                            hans: '本行程提供以下地点接送：',
                            en: 'We offer pick-up to the following places for this experience:',
                          })}
                        </p>
                        <ul className="detail-pickup-bokun-list">
                          {pickupPlaces.map((place) => (
                            <li key={place.id}>{place.title}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {showPickupInfo && pickupInfo.noPickupMessage && (
                      <div className="detail-vendor-html detail-tab-panel__block">
                        {pickupNoMessageHasHtml ? (
                          <span dangerouslySetInnerHTML={{ __html: pickupNoMessageHtml }} />
                        ) : (
                          pickupInfo.noPickupMessage
                        )}
                      </div>
                    )}

                    {tour.meetingPoint && (
                      <SubSection title={T({ hant: '集合地點', hans: '集合地点', en: 'Meeting point' })}>
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
                      </SubSection>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          <BookPanel
            tour={tour}
            T={T}
            lang={lang}
            displayCurrency={displayCurrency}
            fxRates={fxRates}
            priceUsd={resolvePriceUsd(tour)}
            loading={loading}
            hasMultiPrice={hasMultiPrice}
            inTrip={inTrip}
            onAddSelection={() => onAdd && onAdd(tour, { booking: buildBookingSelection() })}
            onBookNow={onBookNow ? () => onBookNow(tour, buildBookingSelection()) : null}
            trip={trip}
            isMobile={isMobile}
            onOpenPrices={() => setPriceSheetOpen(true)}
            selectedDate={selectedDate}
            onSelectedDate={handleSelectedDate}
            dayAvailableTimes={dayAvailableTimes}
            selectedStartTime={selectedStartTime}
            onSelectedStartTime={setSelectedStartTime}
            bookableCategories={bookableCategories}
            paxCounts={paxCounts}
            onPaxCounts={setPaxCounts}
            unitPriceByCategoryId={unitPriceByCategoryId}
            paxCap={paxCap}
            liveCapacityKnown={liveCapacityKnown}
            bookingPaxCap={bookingPaxCap}
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

        {lightboxOpen && galleryPhotos.length > 0 && (
          <PhotoLightbox
            photos={galleryPhotos}
            index={lightboxIndex}
            setIndex={setLightboxIndex}
            onClose={() => setLightboxOpen(false)}
            tour={tour}
            lang={lang}
            T={T}
          />
        )}
      </div>
    );
  }

  function BookPanel({
    tour, T, lang, displayCurrency, fxRates, priceUsd, loading, hasMultiPrice, inTrip, onAddSelection, onBookNow, trip,
    isMobile, onOpenPrices, selectedDate, onSelectedDate, dayAvailableTimes,
    selectedStartTime, onSelectedStartTime, bookableCategories, paxCounts, onPaxCounts, unitPriceByCategoryId, paxCap,
    liveCapacityKnown, bookingPaxCap,
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
    const guestTotal = Pax.paxCountsTotal ? Pax.paxCountsTotal(paxCounts) : 0;
    const peopleUnitPriceLine = bookableCategories
      .map((cat) => {
        const unit = unitPriceByCategoryId && unitPriceByCategoryId.get(String(cat.id));
        if (unit == null) return null;
        const shortName = (cat.title || paxLabel(cat)).trim();
        return `${shortName} ${formatDisplayPrice(unit, displayCurrency, fxRates)}`;
      })
      .filter(Boolean)
      .join(', ');
    const showAvailabilityPanel = !isMobile || availabilityOpen;
    // Concierge form is collapsed by default on both desktop AND mobile —
    // it's a high-LTV escape hatch for users with complex needs, not a
    // competing primary funnel. Show only after the user opts in via the
    // "Plan with a concierge" toggle below the booking CTA.
    const showInquiryPanel = inquiryOpen;

    // Smoothly bring the concierge form into view when the user opens it,
    // so the affordance doesn't appear to "do nothing" when the form is
    // below the fold on shorter viewports.
    const inquiryFormRef = useRef(null);
    useEffect(() => {
      if (!inquiryOpen) return;
      const node = inquiryFormRef.current;
      if (!node) return;
      const id = requestAnimationFrame(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      return () => cancelAnimationFrame(id);
    }, [inquiryOpen]);
    const mobileAvailabilitySummary = availabilityState.data
      ? `${selectedDate} · ${formatDisplayPrice(availabilityState.data.total, displayCurrency, fxRates)}`
      : T({ hant: '選日期、時段與人數', hans: '选日期、时段与人数', en: 'Date, time, and travelers' });
    const mobileInquirySummary = inquiryStatus.ok
      ? inquiryStatus.message
      : T({ hant: '需要包車、客製行程或中文協助', hans: '需要包车、定制行程或中文协助', en: 'Private tours, custom itineraries, and planning help' });
    const pickupNoMessageHtml = sanitizeVendorHtml(pickupInfo?.noPickupMessage || '');
    const pickupNoMessageHasHtml = vendorHtmlIsMeaningful(pickupNoMessageHtml);

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

          {isMobile && (
            <button
              type="button"
              className={`detail-book-disclosure${availabilityOpen ? ' is-open' : ''}`}
              onClick={() => onAvailabilityOpen(!availabilityOpen)}
            >
              <span className="detail-book-disclosure__copy">
                <span className="detail-book-disclosure__title">
                  {T({ hant: '預訂明細', hans: '预订明细', en: 'Booking details' })}
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
                  {T({ hant: '預訂明細', hans: '预订明细', en: 'Booking details' })}
                </div>
              )}
              <div className="detail-book-extra" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!isMobile && (
                  <div className="detail-book-extra__title">
                    {T({ hant: '預訂明細', hans: '预订明细', en: 'Booking details' })}
                  </div>
                )}
                <div className="detail-book-calendar">
                  <span className="detail-book-label detail-book-calendar__eyebrow">
                    {T({ hant: '日期', hans: '日期', en: 'Date' })}
                  </span>
                  {window.AuralisUI.MonthAvailabilityCalendar ? (
                    <window.AuralisUI.MonthAvailabilityCalendar
                      activityId={tour.id}
                      value={selectedDate}
                      onChange={(iso, dayInfo) => onSelectedDate(iso, dayInfo)}
                      lang={lang}
                    />
                  ) : (
                    <input
                      type="date"
                      min={todayIso()}
                      value={selectedDate}
                      onChange={(e) => onSelectedDate(e.target.value, null)}
                      className="detail-book-field"
                    />
                  )}
                  {selectedDate && (
                    <div className="detail-book-calendar__selected" aria-live="polite">
                      {T({ hant: '已選日期', hans: '已选日期', en: 'Selected' })}：
                      <strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString(
                        lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW',
                        { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' },
                      )}</strong>
                    </div>
                  )}
                </div>
                {(() => {
                  const times = Array.isArray(dayAvailableTimes) ? dayAvailableTimes : [];
                  if (times.length === 0) return null;
                  // Render Bókun-style "HH:MM · external label" so vendors that
                  // attach a marketing label (e.g. "9:30pm NL - Sept 2026 onwards")
                  // don't hide the actual departure time from the customer.
                  const formatTime = (st) => {
                    const time = (st.startTime || '').trim();
                    const lbl = (st.label || '').trim();
                    if (time && lbl && lbl !== time) return `${time} · ${lbl}`;
                    return lbl || time || '—';
                  };
                  const onlyOne = times.length === 1;
                  return (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="detail-book-label">
                        {T({ hant: '時段', hans: '时段', en: 'Time' })}
                      </span>
                      {onlyOne ? (
                        <div className="detail-book-field detail-book-field--readonly" aria-readonly="true">
                          {formatTime(times[0])}
                          {times[0].capacityRemaining != null && times[0].capacityRemaining <= 8 && (
                            <span className="detail-book-time-low">
                              {T({
                                hant: `剩 ${times[0].capacityRemaining} 位`,
                                hans: `剩 ${times[0].capacityRemaining} 位`,
                                en: `${times[0].capacityRemaining} left`,
                              })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <select
                          value={selectedStartTime}
                          onChange={(e) => onSelectedStartTime(e.target.value)}
                          className="detail-book-field"
                        >
                          <option value="">
                            {T({ hant: '— 自動選擇 —', hans: '— 自动选择 —', en: '— Auto —' })}
                          </option>
                          {times.map((st, i) => {
                            const value = String(st.id != null ? st.id : st.label || st.startTime || i);
                            const baseLabel = formatTime(st);
                            const cap = st.capacityRemaining;
                            const tail = cap != null && cap <= 8
                              ? `  ·  ${T({ hant: `剩 ${cap}`, hans: `剩 ${cap}`, en: `${cap} left` })}`
                              : '';
                            return <option key={value} value={value}>{`${baseLabel}${tail}`}</option>;
                          })}
                        </select>
                      )}
                    </label>
                  );
                })()}

                {bookableCategories.length > 0 ? (
                  <div className="detail-book-people">
                    <div className="detail-book-people__head">
                      <div className="detail-book-extra__title">
                        {T({ hant: '人數', hans: '人数', en: 'People' })}
                      </div>
                      {liveCapacityKnown && paxCap < bookingPaxCap ? (
                        <p className="detail-book-people__cap">
                          {T({
                            hant: `此時段最多 ${paxCap} 位`,
                            hans: `此时段最多 ${paxCap} 位`,
                            en: `Up to ${paxCap} ${paxCap === 1 ? 'spot' : 'spots'} for this slot`,
                          })}
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="detail-book-people__grid"
                      style={{ '--people-cols': bookableCategories.length }}
                    >
                      {bookableCategories.map((cat) => {
                        const bounds = Pax.categoryPaxBounds
                          ? Pax.categoryPaxBounds(cat, paxCounts, bookableCategories, paxCap)
                          : { min: cat.defaultCategory ? 1 : 0, max: paxCap };
                        const rawQty = Number(paxCounts[String(cat.id)]) || 0;
                        const qty = Math.min(rawQty, bounds.max);
                        const unit = unitPriceByCategoryId && unitPriceByCategoryId.get(String(cat.id));
                        const qtyOptions = bounds.max >= bounds.min
                          ? paxRange(bounds.min, bounds.max)
                          : [0];
                        return (
                          <label key={cat.id} className="detail-book-people__field">
                            <span className="detail-book-people__cat">{paxLabel(cat)}</span>
                            <select
                              value={qty}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                onPaxCounts((prev) => ({
                                  ...prev,
                                  [String(cat.id)]: next,
                                }));
                              }}
                              className="detail-book-field"
                            >
                              {qtyOptions.map((n) => (
                                <option key={n} value={n}>{n}</option>
                              ))}
                            </select>
                            {unit != null ? (
                              <span className="detail-book-people__unit">
                                {formatDisplayPrice(unit, displayCurrency, fxRates)}
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                    {!peopleUnitPriceLine ? (
                      <p className="detail-book-people__unitprices detail-book-people__unitprices--muted">
                        {T({
                          hant: '選擇日期後顯示各票種單價',
                          hans: '选择日期后显示各票种单价',
                          en: 'Select a date to load per-category prices',
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {pickupInfo && pickupInfo.enabled && pickupInfo.selectionAtHostedCheckout && pickupPlaces.length === 0 && (
                  <p className="detail-book-hosted-pickup" style={{ font: '500 13px/1.45 var(--font-text)', color: 'var(--fg-2)', margin: 0 }}>
                    {T({
                      hant: '上車地點將在結帳時選擇。',
                      hans: '上车地点将在结账时选择。',
                      en: 'Pick-up location is selected at checkout.',
                    })}
                  </p>
                )}

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
                        {pickupNoMessageHasHtml ? (
                          <span dangerouslySetInnerHTML={{ __html: pickupNoMessageHtml }} />
                        ) : (
                          pickupInfo.noPickupMessage
                        )}
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
                        const unit = Number(ex.price) || 0;
                        let priceLabel;
                        if (ex.free) {
                          priceLabel = T({ hant: '免費', hans: '免费', en: 'Free' });
                        } else if (ex.pricedPerPerson) {
                          const parts = bookableCategories
                            .filter((cat) => (Number(paxCounts[String(cat.id)]) || 0) > 0)
                            .map((cat) => {
                              const name = (cat.title || '').trim();
                              return `${name} ${formatDisplayPrice(unit, displayCurrency, fxRates)}`;
                            });
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

                {/* Passive availability status. Auto-check fires whenever the
                    booking inputs change (see ActivityDetail useEffect), so
                    we no longer need a manual "Check availability" button on
                    the happy path. Loading / error states still get surfaced
                    inline; errors keep a small Retry affordance. */}
                {availabilityState.loading && (
                  <div className="detail-book-status detail-book-status--loading" role="status" aria-live="polite">
                    <span className="detail-book-status__dot" aria-hidden="true" />
                    {T({ hant: '查詢即時可售狀態…', hans: '查询即时可售状态…', en: 'Checking real-time availability…' })}
                  </div>
                )}
                {availabilityState.error && (
                  <div className="detail-book-status detail-book-status--error" role="alert">
                    <span>{availabilityState.error}</span>
                    <button
                      type="button"
                      className="detail-book-status__retry"
                      onClick={onCheckAvailability}
                      disabled={availabilityState.loading}
                    >
                      {T({ hant: '重試', hans: '重试', en: 'Retry' })}
                    </button>
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

          {/* Primary CTA stack — placed AFTER the booking config + live
              result so users commit only once they've seen availability
              and total price. Industry convention (Bókun, GetYourGuide,
              Klook, Viator).
              "Book now" is the dominant action → drives single-product
              checkout straight to the Bókun 3-step flow.
              "Add to trip" is the lighter alternative for multi-stop
              planners who want to combine multiple activities. */}
          <button
            type="button"
            className="detail-book-cta detail-book-cta--primary"
            onClick={onBookNow}
            disabled={!onBookNow}
          >
            {T({ hant: '立即預訂', hans: '立即预订', en: 'Book now' })}
            <Icon name="arrow-right" size={18} />
          </button>
          <button
            type="button"
            className="detail-book-cta detail-book-cta--secondary"
            onClick={onAddSelection}
          >
            {inTrip
              ? <><Icon name="check" size={16} /> {T({ hant: '更新行程設定', hans: '更新行程设置', en: 'Update trip settings' })}</>
              : <>{T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' })} <Icon name="plus" size={16} /></>}
          </button>

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
            <div ref={inquiryFormRef} className={`detail-book-section${isMobile ? ' is-mobile' : ''}`}>
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
              onClick={onBookNow || onAddSelection}
            >
              {onBookNow
                ? T({ hant: '立即預訂', hans: '立即预订', en: 'Book now' })
                : (inTrip
                  ? T({ hant: '更新行程', hans: '更新行程', en: 'Update trip' })
                  : T({ hant: '加入行程', hans: '加入行程', en: 'Add to trip' }))}
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

  // ─────────────────────────────────────────────────────────────────────────
  // PhotoLightbox — full-screen photo gallery modal mirroring Trip.com /
  // Booking.com / Airbnb. Renders via createPortal so the overlay escapes
  // the sticky booking sidebar's stacking context.
  //  • Esc closes • ←/→ navigates • body scroll is locked while open
  //  • Thumbnail strip auto-scrolls to keep the active thumb visible
  //  • Large image uses heroUrl/sourceUrl (full quality) instead of card-size
  // ─────────────────────────────────────────────────────────────────────────
  function PhotoLightbox({ photos, index, setIndex, onClose, tour, lang, T }) {
    const total = photos.length;
    const safe = Math.min(Math.max(0, index), total - 1);
    const current = photos[safe] || {};
    // Own profile lookup so the lightbox can proxy missing largeUrl variants
    // without leaking the parent's hook state across the React tree.
    const imgProfile = useResponsiveImageProfile();

    const stripRef = useRef(null);
    const goPrev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [setIndex, total]);
    const goNext = useCallback(() => setIndex((i) => (i + 1) % total), [setIndex, total]);

    // Keyboard + body-scroll lock.
    useEffect(() => {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (e) => {
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowLeft') goPrev();
        else if (e.key === 'ArrowRight') goNext();
      };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onKey);
      };
    }, [onClose, goPrev, goNext]);

    // Keep the active thumbnail centered as user navigates.
    useEffect(() => {
      const strip = stripRef.current;
      if (!strip) return;
      const node = strip.querySelector(`[data-thumb-index="${safe}"]`);
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, [safe]);

    const largeUrl = current.heroUrl
      || current.sourceUrl
      || (current.sourceUrl ? proxyImageUrl(current.sourceUrl, imgProfile.heroHi) : null)
      || current.galleryUrl
      || current.cardUrl
      || null;
    const caption = current.description || current.alternateText || tour?.title || '';

    const modal = (
      <div
        className="detail-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={T({ hant: '行程照片', hans: '行程照片', en: 'Tour photos' })}
        onClick={onClose}
      >
        <div className="detail-lightbox__topbar">
          <div className="detail-lightbox__counter" aria-live="polite">{safe + 1} / {total}</div>
          <button
            type="button"
            className="detail-lightbox__close"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            aria-label={T({ hant: '關閉', hans: '关闭', en: 'Close' })}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="detail-lightbox__stage" onClick={(e) => e.stopPropagation()}>
          {total > 1 && (
            <button
              type="button"
              className="detail-lightbox__nav detail-lightbox__nav--prev"
              onClick={goPrev}
              aria-label={T({ hant: '上一張', hans: '上一张', en: 'Previous photo' })}
            >
              <Icon name="chevron-left" size={28} />
            </button>
          )}
          {largeUrl ? (
            <img
              src={largeUrl}
              alt={caption}
              className="detail-lightbox__image"
              draggable={false}
              decoding="async"
              loading="eager"
            />
          ) : (
            <div className="detail-lightbox__placeholder" aria-hidden="true" />
          )}
          {total > 1 && (
            <button
              type="button"
              className="detail-lightbox__nav detail-lightbox__nav--next"
              onClick={goNext}
              aria-label={T({ hant: '下一張', hans: '下一张', en: 'Next photo' })}
            >
              <Icon name="chevron-right" size={28} />
            </button>
          )}
        </div>

        {caption && (
          <div className="detail-lightbox__caption" onClick={(e) => e.stopPropagation()}>
            {caption}
          </div>
        )}

        {total > 1 && (
          <div
            ref={stripRef}
            className="detail-lightbox__strip"
            onClick={(e) => e.stopPropagation()}
            role="tablist"
          >
            {photos.map((p, i) => {
              const thumb = p.galleryUrl
                || p.cardUrl
                || (p.sourceUrl ? proxyImageUrl(p.sourceUrl, imgProfile.gallery) : null);
              return (
                <button
                  key={(p.sourceUrl || p.heroUrl || 'p') + i}
                  type="button"
                  data-thumb-index={i}
                  className={`detail-lightbox__thumb${i === safe ? ' is-active' : ''}`}
                  onClick={() => setIndex(i)}
                  aria-label={T({ hant: `照片 ${i + 1}`, hans: `照片 ${i + 1}`, en: `Photo ${i + 1}` })}
                  aria-selected={i === safe}
                  role="tab"
                >
                  {thumb && <img src={thumb} alt="" draggable={false} loading="lazy" decoding="async" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );

    return ReactDOM.createPortal(modal, document.body);
  }

  function SubSection({ title, children }) {
    return (
      <div className="detail-subsection">
        {title ? <h3 className="detail-subsection__title">{title}</h3> : null}
        {children}
      </div>
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
