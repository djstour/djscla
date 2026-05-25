/* ActivityDetail — full product page from Bókun GET /activity.json/{id}. */

(function () {
  const { useState, useEffect, useRef, useCallback } = React;
  const {
    Icon, formatDisplayPrice, fakePhoto, pick, proxyImageUrl,
    useResponsiveImageProfile, useMobileViewport,
    sanitizeVendorHtml, vendorHtmlIsMeaningful,
  } = window.AuralisUI;

  const DESC_PREVIEW_CHARS = 320;
  const MOBILE_STOPS_PREVIEW = 3;
  const COMPACT_HEADER_SCROLL = 180;
  // Bókun rarely exposes a per-category cap; OTA-standard fallback is 15.
  const DETAIL_PAX_MAX = 15;
  function paxRange(start, end) {
    const out = [];
    for (let i = start; i <= end; i += 1) out.push(i);
    return out;
  }

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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function difficultyLabel(level, T) {
    const key = String(level || '').toUpperCase();
    const map = {
      EASY:     { hant: '輕鬆', hans: '轻松', en: 'Easy' },
      MODERATE: { hant: '中等', hans: '中等', en: 'Moderate' },
      HARD:     { hant: '進階', hans: '进阶', en: 'Challenging' },
      EXTREME:  { hant: '高強度', hans: '高强度', en: 'Extreme' },
    };
    if (map[key]) return T(map[key]);
    return level;
  }

  function attributeIcon(attr) {
    switch (String(attr).toUpperCase()) {
      case 'FAMILY_FRIENDLY': return 'baby';
      case 'ECO_FRIENDLY':    return 'leaf';
      case 'OUTDOOR':         return 'tree-pine';
      case 'INDOOR':          return 'home';
      case 'ACCESSIBLE':      return 'accessibility';
      case 'SMALL_GROUP':     return 'users-round';
      default:                return 'sparkles';
    }
  }

  function attributeLabel(attr, T) {
    const key = String(attr || '').toUpperCase();
    const map = {
      FAMILY_FRIENDLY: { hant: '親子友善', hans: '亲子友善', en: 'Family-friendly' },
      ECO_FRIENDLY:    { hant: '環境友善', hans: '环境友善', en: 'Eco-friendly' },
      OUTDOOR:         { hant: '戶外體驗', hans: '户外体验', en: 'Outdoor' },
      INDOOR:          { hant: '室內體驗', hans: '室内体验', en: 'Indoor' },
      ACCESSIBLE:      { hant: '無障礙',   hans: '无障碍',   en: 'Accessible' },
      SMALL_GROUP:     { hant: '小團體',   hans: '小团体',   en: 'Small group' },
    };
    if (map[key]) return T(map[key]);
    return String(attr || '').replace(/_/g, ' ').toLowerCase();
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

  function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeDescriptionText(text, title) {
    let source = String(text || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';

    if (title) {
      const titlePattern = new RegExp(`^${escapeRegex(title)}\\s*[-:!]*\\s*`, 'i');
      source = source.replace(titlePattern, '');
    }

    source = source
      .replace(/^Trip difficulty\s*:?\s*[^.]+\.?\s*/i, '')
      .replace(/^Tour Highlights\s*:?-?\s*/i, '')
      .replace(/\s*Tour Highlights\s*:?-?\s*/gi, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return source;
  }

  function splitDescription(text, title) {
    const source = normalizeDescriptionText(text, title);
    if (!source) return { highlights: [], body: '' };

    const sentences = source
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim().replace(/^-+\s*/, ''))
      .filter(Boolean);

    const highlights = [];
    const bodySentences = [];

    sentences.forEach((sentence) => {
      if (
        highlights.length < 3
        && sentence.length <= 140
        && !/^During this/i.test(sentence)
        && !/^Firstly/i.test(sentence)
      ) {
        highlights.push(sentence);
      } else {
        bodySentences.push(sentence);
      }
    });

    return {
      highlights,
      body: bodySentences.join(' '),
    };
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
    trip = [],
    lang,
    displayCurrency = 'USD',
    fxRates = { USD: 1 },
    initialDate = null,
    initialGuestCounts = null,
  }) {
    const T = (opts) => pick(lang, opts);
    const imgProfile = useResponsiveImageProfile();
    const isMobile = useMobileViewport();
    const [activePhoto, setActivePhoto] = useState(0);
    const [compactHeader, setCompactHeader] = useState(false);
    const [descExpanded, setDescExpanded] = useState(false);
    const [stopsExpanded, setStopsExpanded] = useState(false);
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
    const [selectedPickupId, setSelectedPickupId] = useState('');
    const [selectedExtras, setSelectedExtras] = useState({});
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
      ? ((tour.photoUrls && tour.photoUrls.length)
        ? tour.photoUrls
        : (tour.coverImageUrl ? [tour.coverImageUrl] : []))
      : [];

    useEffect(() => {
      const min = todayIso();
      const fromTrip = initialDate && initialDate >= min ? initialDate : null;
      setActivePhoto(0);
      setDescExpanded(false);
      setStopsExpanded(false);
      setPriceSheetOpen(false);
      setCompactHeader(false);
      setSelectedDate(fromTrip || nextIsoDate(14));
      setSelectedStartTime('');
      setGuestCounts({
        adults: Math.min(DETAIL_PAX_MAX, Math.max(1, Number(initialGuestCounts?.adults) || 2)),
        children: Math.min(DETAIL_PAX_MAX, Math.max(0, Number(initialGuestCounts?.children) || 0)),
      });
      setSelectedPickupId('');
      setSelectedExtras({});
      setAvailabilityState({ loading: false, error: '', data: null });
      setAvailabilityOpen(false);
      setStickyBarVisible(false);
      setInquiryOpen(false);
      setInquirySubmitting(false);
      setInquiryStatus({ ok: false, message: '' });
    }, [tour && tour.id, galleryPhotos.length, initialDate, initialGuestCounts?.adults, initialGuestCounts?.children]);

    useEffect(() => {
      const firstStartTime = tour && tour.startTimes && tour.startTimes[0];
      const nextValue = firstStartTime
        ? String(firstStartTime.id ?? firstStartTime.startTimeId ?? firstStartTime.label ?? '')
        : '';
      setSelectedStartTime(nextValue);
    }, [tour && tour.id]);

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
    const descriptionParts = splitDescription(tour.description, tour.title);
    const mapsUrl = mapsSearchUrl(tour.meetingPoint);

    const includedHtml = sanitizeVendorHtml(tour.includedHtml);
    const excludedHtml = sanitizeVendorHtml(tour.excludedHtml);
    const requirementsHtml = sanitizeVendorHtml(tour.requirementsHtml);
    const attentionHtml = sanitizeVendorHtml(tour.attentionHtml);
    const hasIncluded = vendorHtmlIsMeaningful(includedHtml);
    const hasExcluded = vendorHtmlIsMeaningful(excludedHtml);
    const hasRequirements = vendorHtmlIsMeaningful(requirementsHtml);
    const hasAttention = vendorHtmlIsMeaningful(attentionHtml);
    const extras = Array.isArray(tour.bookableExtras) ? tour.bookableExtras : [];
    const hasExtras = extras.length > 0;
    const optionalExtras = extras.filter((ex) => !ex.included && (!ex.selectionType || ex.selectionType === 'OPTIONAL'));
    const pickupInfo = tour.pickupInfo || null;
    const showPickupInfo = pickupInfo && pickupInfo.enabled;
    const pickupPlaces = Array.isArray(pickupInfo?.places) ? pickupInfo.places : [];
    const pickupIncluded = pickupInfo?.rate?.pricingType === 'INCLUDED_IN_PRICE';
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
      tour.description && { id: 'detail-about', label: T({ hant: '介紹', hans: '介绍', en: 'About' }) },
      hasIncluded && { id: 'detail-included', label: T({ hant: '包含', hans: '包含', en: 'Included' }) },
      stopsNamed.length > 0 && { id: 'detail-stops', label: T({ hant: '站點', hans: '站点', en: 'Stops' }) },
      hasRequirements && { id: 'detail-requirements', label: T({ hant: '需自備', hans: '需自备', en: 'Bring' }) },
      hasAttention && { id: 'detail-attention', label: T({ hant: '注意', hans: '注意', en: 'Notes' }) },
      tour.meetingPoint && { id: 'detail-meeting', label: T({ hant: '集合', hans: '集合', en: 'Meet' }) },
      showPickupInfo && { id: 'detail-pickup', label: T({ hant: '接送', hans: '接送', en: 'Pickup' }) },
      tour.startTimes && tour.startTimes.length > 0 && { id: 'detail-times', label: T({ hant: '時段', hans: '时段', en: 'Times' }) },
    ].filter(Boolean);
    // `hasExtras` flag retained for future use; extras now live in BookPanel.
    void hasExtras;

    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                {galleryPhotos.slice(0, isMobile ? 5 : 8).map((url, i) => {
                  const selected = safeIndex === i;
                  const nearActive = Math.abs(i - safeIndex) <= 1;
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
                        loading={nearActive ? 'eager' : 'lazy'}
                        fetchPriority={selected ? 'high' : 'low'}
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
                    {descriptionParts.highlights.length > 0 && (
                      <div className="detail-highlight-list">
                        {descriptionParts.highlights.map((line, index) => (
                          <div key={index} className="detail-highlight-item">
                            <Icon name="sparkles" size={15} color="var(--aurora-deep)" />
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className={`detail-description${descNeedsCollapse && !descExpanded ? ' is-clamped' : ''}`}>
                      {descExpanded ? tour.description : (descriptionParts.body || descPreview)}
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

            {(hasIncluded || hasExcluded) && (
              <Section
                id="detail-included"
                title={T({ hant: '行程包含 / 不含', hans: '行程包含 / 不含', en: 'What\u2019s included' })}
              >
                <div className="detail-included-grid">
                  {hasIncluded && (
                    <div className="detail-included-block detail-included-block--yes">
                      <div className="detail-included-block__head">
                        <Icon name="check" size={16} color="#0A7B4F" />
                        <span>{T({ hant: '含', hans: '含', en: 'Included' })}</span>
                      </div>
                      <div className="detail-vendor-html"
                           dangerouslySetInnerHTML={{ __html: includedHtml }} />
                    </div>
                  )}
                  {hasExcluded && (
                    <div className="detail-included-block detail-included-block--no">
                      <div className="detail-included-block__head">
                        <Icon name="x" size={16} color="#C03A3A" />
                        <span>{T({ hant: '不含', hans: '不含', en: 'Not included' })}</span>
                      </div>
                      <div className="detail-vendor-html"
                           dangerouslySetInnerHTML={{ __html: excludedHtml }} />
                    </div>
                  )}
                </div>
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

            {hasRequirements && (
              <Section
                id="detail-requirements"
                title={T({ hant: '請自備 / 穿著', hans: '请自备 / 穿着', en: 'What to bring' })}
              >
                <div className="detail-vendor-html"
                     dangerouslySetInnerHTML={{ __html: requirementsHtml }} />
              </Section>
            )}

            {showPickupInfo && (
              <Section
                id="detail-pickup"
                title={T({ hant: '接送服務', hans: '接送服务', en: 'Pickup' })}
              >
                <div className="detail-pickup-card">
                  <Icon name="bus" size={18} color="var(--aurora-deep, #00837A)" />
                  <div className="detail-pickup-card__body">
                    <div className="detail-pickup-card__title">
                      {T({
                        hant: '提供接送服務',
                        hans: '提供接送服务',
                        en: 'Pickup service available',
                      })}
                    </div>
                    <ul className="detail-pickup-card__list">
                      {pickupInfo.minutesBefore != null && pickupInfo.minutesBefore > 0 && (
                        <li>
                          {T({
                            hant: `預計於出發前 ${pickupInfo.minutesBefore} 分鐘接送`,
                            hans: `预计于出发前 ${pickupInfo.minutesBefore} 分钟接送`,
                            en: `Pickup approximately ${pickupInfo.minutesBefore} minutes before departure`,
                          })}
                        </li>
                      )}
                      {pickupInfo.timeWindowMinutes != null && pickupInfo.timeWindowMinutes > 0 && (
                        <li>
                          {T({
                            hant: `請於接送時段前 ${pickupInfo.timeWindowMinutes} 分鐘準備好`,
                            hans: `请于接送时段前 ${pickupInfo.timeWindowMinutes} 分钟准备好`,
                            en: `Be ready ${pickupInfo.timeWindowMinutes} minutes before your pickup window`,
                          })}
                        </li>
                      )}
                      <li>
                        {pickupInfo.customAllowed
                          ? T({
                              hant: '可指定住宿地點接送',
                              hans: '可指定住宿地点接送',
                              en: 'Custom hotel pickup accepted',
                            })
                          : T({
                              hant: '請於預訂時選擇指定接送點',
                              hans: '请于预订时选择指定接送点',
                              en: 'Pickup at one of the designated stops (selected when booking)',
                            })}
                      </li>
                      {pickupInfo.noPickupMessage && <li>{pickupInfo.noPickupMessage}</li>}
                    </ul>
                  </div>
                </div>
              </Section>
            )}

            {hasAttention && (
              <Section
                id="detail-attention"
                title={T({ hant: '重要注意事項', hans: '重要注意事项', en: 'Good to know' })}
              >
                <div className="detail-attention-card">
                  <Icon name="info" size={18} color="#B98800" />
                  <div className="detail-vendor-html"
                       dangerouslySetInnerHTML={{ __html: attentionHtml }} />
                </div>
              </Section>
            )}


            {(tour.difficultyLevel || tour.minAge != null || tour.cancellationFreeHours || (tour.activityAttributes && tour.activityAttributes.length > 0)) && (
              <Section title={T({ hant: '重點資訊', hans: '重点信息', en: 'Quick facts' })}>
                <div className="detail-facts-grid">
                  {tour.difficultyLevel && (
                    <div className="detail-fact">
                      <Icon name="activity" size={16} />
                      <div>
                        <div className="detail-fact__label">{T({ hant: '難度', hans: '难度', en: 'Difficulty' })}</div>
                        <div className="detail-fact__value">{difficultyLabel(tour.difficultyLevel, T)}</div>
                      </div>
                    </div>
                  )}
                  {tour.minAge != null && tour.minAge > 0 && (
                    <div className="detail-fact">
                      <Icon name="users" size={16} />
                      <div>
                        <div className="detail-fact__label">{T({ hant: '年齡限制', hans: '年龄限制', en: 'Min age' })}</div>
                        <div className="detail-fact__value">
                          {T({
                            hant: `${tour.minAge} 歲以上`,
                            hans: `${tour.minAge} 岁以上`,
                            en: `${tour.minAge}+ years`,
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {tour.cancellationFreeHours && (
                    <div className="detail-fact">
                      <Icon name="shield-check" size={16} />
                      <div>
                        <div className="detail-fact__label">{T({ hant: '取消政策', hans: '取消政策', en: 'Cancellation' })}</div>
                        <div className="detail-fact__value">
                          {T({
                            hant: `${tour.cancellationFreeHours} 小時前可免費取消`,
                            hans: `${tour.cancellationFreeHours} 小时前可免费取消`,
                            en: `Free up to ${tour.cancellationFreeHours}h before`,
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  {(tour.activityAttributes || []).slice(0, 4).map((attr) => (
                    <div key={attr} className="detail-fact">
                      <Icon name={attributeIcon(attr)} size={16} />
                      <div>
                        <div className="detail-fact__label">{T({ hant: '特色', hans: '特色', en: 'Feature' })}</div>
                        <div className="detail-fact__value">{attributeLabel(attr, T)}</div>
                      </div>
                    </div>
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
            pickupIncluded={pickupIncluded}
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
    tour, T, displayCurrency, fxRates, priceUsd, loading, cancelText, hasMultiPrice, inTrip, onAdd, trip,
    isMobile, onOpenPrices, selectedDate, onSelectedDate, selectedStartTime, onSelectedStartTime, guestCounts,
    onGuestCounts, adultCategory, childCategory, paxCap,
    pickupInfo, pickupPlaces, pickupIncluded, selectedPickupId, onSelectedPickupId,
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
    const trustRows = [
      cancelText && {
        icon: 'shield-check',
        label: cancelText,
      },
      tour.availability?.bookableNow && {
        icon: 'zap',
        label: T({ hant: '即時確認庫存', hans: '即时确认库存', en: 'Instant inventory confirmation' }),
      },
      tour.startTimes?.length > 1 && {
        icon: 'clock-3',
        label: T({ hant: '多個出發時段', hans: '多个出发时段', en: 'Multiple departure times' }),
      },
      tour.languages?.length > 0 && {
        icon: 'languages',
        label: T({ hant: `${tour.languages.length} 種導覽語言`, hans: `${tour.languages.length} 种导览语言`, en: `${tour.languages.length} guide languages` }),
      },
    ].filter(Boolean);
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

          {trustRows.length > 0 && (
            <div className="detail-book-extra detail-book-extra--desktop detail-book-trust-grid">
              {trustRows.map((row) => (
                <div key={row.label} className="detail-book-trust-item">
                  <Icon name={row.icon} size={16} color="var(--aurora-deep)" />
                  <span>{row.label}</span>
                </div>
              ))}
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
                    <span className="detail-book-helper" style={{ font: '500 12px/1.4 var(--font-text)', color: 'var(--fg-2)' }}>
                      {pickupIncluded
                        ? T({ hant: '（已含於票價）', hans: '（已含于票价）', en: '(included in price)' })
                        : T({ hant: '可能加收接送費，下方總價會自動更新', hans: '可能加收接送费，下方总价会自动更新', en: 'May add a pickup fee — total updates below' })}
                    </span>
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
              onClick={() => onAdd && onAdd(tour)}
              disabled={inTrip}
            >
              {inTrip
                ? T({ hant: '已在行程中', hans: '已在行程中', en: 'In your trip' })
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
