/* Shared utilities & helpers for the Auralis UI kit
   Exposes window.AuralisUI = { Icon, formatPrice, fakePhoto, ... } */

(function () {
  const { useState, useEffect, useRef } = React;

  const MOBILE_IMAGE_MQ = '(max-width: 640px)';

  function isMobileViewport() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_IMAGE_MQ).matches;
  }

  function prefersReducedData() {
    const conn = typeof navigator !== 'undefined' && navigator.connection;
    if (!conn) return false;
    return conn.saveData === true
      || conn.effectiveType === 'slow-2g'
      || conn.effectiveType === '2g'
      || conn.effectiveType === '3g';
  }

  /**
   * Proxy widths for /api/media/thumb. Mobile heroFast matches card so list → detail reuses cache.
   * @see docs/BOKUN_IMAGES.md
   */
  function imageProfileForViewport() {
    if (isMobileViewport() || prefersReducedData()) {
      const w = prefersReducedData() ? 280 : 320;
      const q = prefersReducedData() ? 68 : 72;
      return {
        card: { w, q },
        heroFast: { w, q },
        heroHi: null,
        gallery: { w: 72, q: 68 },
        prefetch: { w, q },
      };
    }
    return {
      card: { w: 520, q: 78 },
      heroFast: { w: 520, q: 78 },
      heroHi: { w: 960, q: 82 },
      gallery: { w: 160, q: 75 },
      prefetch: { w: 520, q: 78 },
    };
  }

  /** How many tour cards may use fetchpriority=high above the fold. */
  function aboveFoldImagePriorityCount(surface) {
    const mobile = isMobileViewport() || prefersReducedData();
    if (surface === 'featured') return mobile ? 2 : 3;
    if (surface === 'tours') return mobile ? 2 : 4;
    return mobile ? 1 : 2;
  }

  function useResponsiveImageProfile() {
    const [profile, setProfile] = useState(() => imageProfileForViewport());

    useEffect(() => {
      if (typeof window === 'undefined' || !window.matchMedia) return undefined;
      const mq = window.matchMedia(MOBILE_IMAGE_MQ);
      const update = () => setProfile(imageProfileForViewport());
      update();
      if (mq.addEventListener) mq.addEventListener('change', update);
      else mq.addListener(update);
      const conn = navigator.connection;
      if (conn && conn.addEventListener) conn.addEventListener('change', update);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', update);
        else mq.removeListener(update);
        if (conn && conn.removeEventListener) conn.removeEventListener('change', update);
      };
    }, []);

    return profile;
  }

  function useMobileViewport() {
    const [mobile, setMobile] = useState(() => isMobileViewport());

    useEffect(() => {
      if (typeof window === 'undefined' || !window.matchMedia) return undefined;
      const mq = window.matchMedia(MOBILE_IMAGE_MQ);
      const update = () => setMobile(mq.matches);
      update();
      if (mq.addEventListener) mq.addEventListener('change', update);
      else mq.addListener(update);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', update);
        else mq.removeListener(update);
      };
    }, []);

    return mobile;
  }

  // Lucide-icon wrapper. Renders <i data-lucide="name"></i> and calls createIcons
  // on every render so dynamic icons attach correctly.
  function Icon({ name, size = 18, color, fill, strokeWidth = 1.75, style, className }) {
    const ref = useRef(null);
    useEffect(() => {
      if (window.lucide && ref.current) {
        ref.current.innerHTML = '';
        const el = document.createElement('i');
        el.setAttribute('data-lucide', name);
        ref.current.appendChild(el);
        window.lucide.createIcons({
          nameAttr: 'data-lucide',
          attrs: {
            width: size,
            height: size,
            'stroke-width': strokeWidth,
            ...(color ? { color } : {}),
            ...(fill ? { fill } : {}),
          },
        });
      }
    }, [name, size, color, fill, strokeWidth]);
    return (
      <span
        ref={ref}
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, color, ...style }}
      />
    );
  }

  /** Display / round to whole units after FX (and Bókun ISK/JPY/KRW). */
  const INTEGER_DISPLAY_CURRENCY_CODES = ['TWD', 'CNY', 'HKD', 'MOP', 'ISK', 'JPY', 'KRW'];

  function currencyDisplaysAsInteger(code) {
    return INTEGER_DISPLAY_CURRENCY_CODES.includes(String(code || '').toUpperCase());
  }

  /** Format amount using Bókun ISO currency (ISK, EUR, USD, …). */
  function formatPrice(n, currency) {
    const amount = Number(n);
    if (!Number.isFinite(amount)) return '—';
    const code = (currency || 'ISK').toUpperCase();
    const noDecimals = currencyDisplaysAsInteger(code);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: noDecimals ? 0 : undefined,
        maximumFractionDigits: noDecimals ? 0 : 2,
      }).format(amount);
    } catch {
      return `${code} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: noDecimals ? 0 : 2 }).format(amount)}`;
    }
  }

  /** Single currency if all rows match; otherwise null (mixed cart). */
  function singleCurrency(items) {
    const codes = [...new Set((items || []).map((t) => t.priceCurrency).filter(Boolean))];
    return codes.length === 1 ? codes[0] : null;
  }

  function formatTotalAmount(trip, total, lang) {
    const code = singleCurrency(trip);
    if (code) return formatPrice(total, code);
    return pick(lang, { hant: '多種幣別', hans: '多种币别', en: 'Multiple currencies' });
  }

  // ------------------------------------------------------------------
  // FX — USD anchor (Bókun) → display currency via Frankfurter (/api/fx/rates)
  // ------------------------------------------------------------------
  const CURRENCIES = [
    { code: 'TWD', symbol: 'NT$', name: { hant: '新台幣',     hans: '新台币',     en: 'Taiwan dollar' } },
    { code: 'CNY', symbol: '¥',   name: { hant: '人民幣',     hans: '人民币',     en: 'Chinese yuan' } },
    { code: 'USD', symbol: '$',   name: { hant: '美元',       hans: '美元',       en: 'US dollar' } },
    { code: 'HKD', symbol: 'HK$', name: { hant: '港幣',       hans: '港币',       en: 'Hong Kong dollar' } },
    { code: 'SGD', symbol: 'S$',  name: { hant: '新加坡元',   hans: '新加坡元',   en: 'Singapore dollar' } },
    { code: 'MYR', symbol: 'RM',  name: { hant: '馬來西亞令吉', hans: '马来西亚令吉', en: 'Malaysian ringgit' } },
    { code: 'MOP', symbol: 'MOP$', name: { hant: '澳門幣',     hans: '澳门币',     en: 'Macau pataca' } },
    { code: 'CAD', symbol: '$',   name: { hant: '加拿大元',   hans: '加拿大元',   en: 'Canadian dollar' } },
    { code: 'AUD', symbol: '$',   name: { hant: '澳元',       hans: '澳元',       en: 'Australian dollar' } },
  ];

  const DISPLAY_CURRENCIES = CURRENCIES;

  function currencyLabel(currency, lang) {
    const c = CURRENCIES.find((x) => x.code === currency) || CURRENCIES[0];
    return `${c.code} · ${pick(lang, c.name)}`;
  }

  const FX_BASE = 'USD';

  function defaultCurrencyForLang(lang) {
    const pref = ({ hant: 'TWD', hans: 'CNY', en: 'USD' }[lang] || 'USD');
    return DISPLAY_CURRENCIES.some((c) => c.code === pref) ? pref : 'USD';
  }

  function convertFromUsd(amountUsd, targetCurrency, rates) {
    const amount = Number(amountUsd);
    if (!Number.isFinite(amount)) return 0;
    const code = (targetCurrency || FX_BASE).toUpperCase();
    if (code === FX_BASE) return amount;
    const rate = rates && rates[code];
    if (!rate || !Number.isFinite(rate)) return amount;
    return amount * rate;
  }

  function roundForCurrency(amount, code) {
    const c = (code || FX_BASE).toUpperCase();
    return currencyDisplaysAsInteger(c) ? Math.round(amount) : Math.round(amount * 100) / 100;
  }

  /** Bókun USD amount → user-selected display currency (no hardcoded rates). */
  function formatDisplayPrice(amountUsd, displayCurrency, rates) {
    const code = (displayCurrency || FX_BASE).toUpperCase();
    const converted = roundForCurrency(convertFromUsd(amountUsd, code, rates), code);
    return formatPrice(converted, code);
  }

  /**
   * Compact "starts from" price for cards — always rounded to the nearest unit
   * so the headline reads $68 instead of $67.82. Detail and checkout keep the
   * precise figure via formatDisplayPrice.
   */
  function formatDisplayPriceCompact(amountUsd, displayCurrency, rates) {
    const code = (displayCurrency || FX_BASE).toUpperCase();
    const converted = Math.round(convertFromUsd(amountUsd, code, rates));
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(converted);
    } catch {
      return `${code} ${converted}`;
    }
  }

  function formatTotalDisplay(totalUsd, displayCurrency, rates) {
    return formatDisplayPrice(totalUsd, displayCurrency, rates);
  }

  function tripTotalUsd(trip) {
    return (trip || []).reduce((s, t) => {
      const selectionTotal = Number(t.tripPricing && t.tripPricing.totalUsd);
      if (Number.isFinite(selectionTotal) && selectionTotal > 0) return s + selectionTotal;
      return s + (Number(t.priceUsd ?? t.price) || 0);
    }, 0);
  }

  // ------------------------------------------------------------------
  // i18n helper — strict locale separation (no hant↔hans mixing).
  // `lang`: 'hant' (台灣繁體) | 'hans' (中國簡體) | 'en'.
  // Missing copy returns '' for zh locales; English may fall back to en only.
  // ------------------------------------------------------------------
  const LANGS = [
    { id: 'hant', label: '繁',  htmlLang: 'zh-Hant' },
    { id: 'hans', label: '简',  htmlLang: 'zh-Hans' },
    { id: 'en',   label: 'EN', htmlLang: 'en' },
  ];

  function pick(lang, options) {
    if (!options) return '';
    if (options[lang] != null && options[lang] !== '') return options[lang];
    if (lang === 'en') return options.en || '';
    return '';
  }

  // Convenience: bind a lang so component code reads `T({...})` instead of `pick(lang, {...})`.
  function makeT(lang) {
    return (options) => pick(lang, options);
  }

  // Sync the <html lang> attribute when the language changes — keeps
  // CSS :lang() rules and assistive tech in step with the UI.
  function applyHtmlLang(lang) {
    const tag = (LANGS.find(l => l.id === lang) || LANGS[0]).htmlLang;
    if (typeof document !== 'undefined' && document.documentElement.lang !== tag) {
      document.documentElement.lang = tag;
    }
  }

  /** Customer-facing Chinese brand — hant / hans only differ here. */
  function brandZhName(lang) {
    return pick(lang, {
      hant: '獨角獸旅遊',
      hans: '独角兽旅游',
      en: 'Unicorn Travel',
    });
  }

  function brandFullTitle(lang) {
    return `DJS Tour · ${brandZhName(lang)}`;
  }

  function brandLogoSrc(lang, siteThemeId) {
    const isSun = siteThemeId === 'sun';
    if (isSun) {
      if (lang === 'hans') return '../../assets/logo-wordmark-white-hans.svg';
      if (lang === 'en') return '../../assets/logo-wordmark-white-en.svg';
      return '../../assets/logo-wordmark-white.svg';
    }
    if (lang === 'hans') return '../../assets/logo-wordmark-hans.svg';
    if (lang === 'en') return '../../assets/logo-wordmark-en.svg';
    return '../../assets/logo-wordmark.svg';
  }

  /** Logo alt text — matches visible wordmark language (no mixed EN/ZH). */
  function brandLogoAlt(lang) {
    if (lang === 'en') return 'DJS Tour';
    return brandZhName(lang);
  }

  function applyBrandDocument(lang) {
    if (typeof document === 'undefined') return;
    const title = brandFullTitle(lang);
    document.title = title;
    if (document.body) document.body.dataset.screenLabel = title;
  }

  // ------------------------------------------------------------------
  // Site-wide theme (aurora | mist | sun) — user picks via ThemePicker; stored in localStorage.
  // Sets html[data-site-theme] → remaps CSS vars app-wide; hero uses heroBackground.
  // ------------------------------------------------------------------
  const SITE_THEME_STORAGE_KEY = 'auralis:siteTheme:v1';
  const LEGACY_HERO_THEME_KEY = 'auralis:heroTheme:v3';
  const DEFAULT_SITE_THEME_ID = 'aurora';

  const SITE_THEMES = [
    {
      id: 'aurora',
      label: { hant: '極光', hans: '极光', en: 'Aurora' },
      swatch: 'linear-gradient(135deg, #2EFFB8 0%, #00D5FF 100%)',
      sectionClass: 'bg-aurora-animated',
      heroBackground: [
        'radial-gradient(58% 75% at 18% 28%, rgba(46, 255, 184, 0.95) 0%, transparent 58%)',
        'radial-gradient(52% 68% at 82% 18%, rgba(0, 213, 255, 0.9) 0%, transparent 58%)',
        'radial-gradient(65% 85% at 55% 92%, rgba(0, 163, 209, 0.45) 0%, transparent 62%)',
        'linear-gradient(135deg, #8FFFE0 0%, #B5F0FF 42%, #7AD4FF 100%)',
      ].join(', '),
    },
    {
      id: 'mist',
      label: { hant: '霧', hans: '雾', en: 'Mist' },
      swatch: 'linear-gradient(135deg, #E8E2FF 0%, #FFE9D6 50%, #DBF7FF 100%)',
      sectionClass: 'bg-mist-animated',
      heroBackground: [
        'radial-gradient(62% 78% at 18% 28%, rgba(232, 226, 255, 0.92) 0%, transparent 58%)',
        'radial-gradient(58% 72% at 82% 22%, rgba(255, 233, 214, 0.88) 0%, transparent 58%)',
        'radial-gradient(72% 88% at 52% 92%, rgba(219, 247, 255, 0.9) 0%, transparent 62%)',
        'linear-gradient(135deg, #E8E2FF 0%, #FFE9D6 50%, #DBF7FF 100%)',
      ].join(', '),
    },
    {
      id: 'sun',
      label: { hant: '陽', hans: '阳', en: 'Sun' },
      swatch: 'linear-gradient(135deg, #1A1228 0%, #6B2FE6 42%, #FF7A2E 100%)',
      sectionClass: 'bg-sun-animated',
      heroBackground: [
        'radial-gradient(58% 78% at 20% 30%, rgba(107, 47, 230, 0.55) 0%, transparent 58%)',
        'radial-gradient(55% 72% at 80% 22%, rgba(255, 122, 46, 0.48) 0%, transparent 58%)',
        'radial-gradient(68% 88% at 52% 90%, rgba(179, 49, 226, 0.38) 0%, transparent 62%)',
        'linear-gradient(135deg, #1A1228 0%, #120E1C 48%, #0E0C18 100%)',
      ].join(', '),
    },
  ];

  const HERO_THEMES = SITE_THEMES;

  function siteThemeFromQuery() {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('theme') || params.get('hero');
      if (!forced) return null;
      return SITE_THEMES.find((t) => t.id === forced) || null;
    } catch {
      return null;
    }
  }

  function applySiteTheme(theme) {
    if (!theme || typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-site-theme', theme.id);
  }

  function getSiteThemeById(id) {
    return SITE_THEMES.find((t) => t.id === id) || SITE_THEMES[0];
  }

  function persistSiteThemeId(id) {
    try {
      localStorage.setItem(SITE_THEME_STORAGE_KEY, id);
      sessionStorage.setItem(SITE_THEME_STORAGE_KEY, id);
    } catch (_) { /* private mode */ }
  }

  function readStoredSiteThemeId() {
    try {
      let saved = localStorage.getItem(SITE_THEME_STORAGE_KEY);
      if (!saved) saved = sessionStorage.getItem(SITE_THEME_STORAGE_KEY);
      if (!saved) {
        saved = sessionStorage.getItem(LEGACY_HERO_THEME_KEY);
        if (saved) persistSiteThemeId(saved);
      }
      if (saved === 'aurora' || saved === 'mist' || saved === 'sun') return saved;
    } catch (_) { /* ignore */ }
    return null;
  }

  function getInitialSiteTheme() {
    const forced = siteThemeFromQuery();
    if (forced) {
      persistSiteThemeId(forced.id);
      applySiteTheme(forced);
      return forced;
    }

    const saved = readStoredSiteThemeId();
    const theme = getSiteThemeById(saved || DEFAULT_SITE_THEME_ID);
    if (!saved) persistSiteThemeId(theme.id);
    applySiteTheme(theme);
    return theme;
  }

  function setSiteThemeById(id) {
    const theme = getSiteThemeById(id);
    persistSiteThemeId(theme.id);
    applySiteTheme(theme);
    return theme;
  }

  function pickSiteThemeForSession() {
    return getInitialSiteTheme();
  }

  function pickHeroThemeForSession() {
    return getInitialSiteTheme();
  }

  function getOrPickHeroTheme() {
    return getInitialSiteTheme();
  }

  /** Minimal 3-swatch theme picker for the nav bar. */
  function ThemePicker({ themeId, onChange, lang, className = '' }) {
    const T = (opts) => pick(lang, opts);
    return (
      <div
        className={`theme-picker${className ? ` ${className}` : ''}`}
        role="group"
        aria-label={T({ hant: '主題配色', hans: '主题配色', en: 'Color theme' })}
      >
        {SITE_THEMES.map((t) => {
          const active = themeId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`theme-picker__btn${active ? ' is-active' : ''}`}
              aria-pressed={active}
              aria-label={pick(lang, t.label)}
              title={pick(lang, t.label)}
              onClick={() => onChange(t.id)}
            >
              <span className="theme-picker__swatch" style={{ background: t.swatch }} />
            </button>
          );
        })}
      </div>
    );
  }

  // Procedural "photo" — gradients tuned to feel like Iceland locations.
  // Returns a CSS background string.
  const PHOTO_PRESETS = {
    aurora:    'linear-gradient(160deg, #0E1C46 0%, #1E3D7A 30%, #37C7DA 60%, #2EFFB8 90%)',
    lagoon:    'linear-gradient(160deg, #0B1A4E 0%, #2A6FAF 40%, #65D6E8 75%, #C8F8FF 100%)',
    glacier:   'linear-gradient(160deg, #5B7396 0%, #A5C2DC 40%, #D9EFF7 100%)',
    bluelagoon:'linear-gradient(160deg, #1A4F5C 0%, #2FA6B8 40%, #8FE4DC 70%, #DCFCFA 100%)',
    waterfall: 'linear-gradient(160deg, #1B2D2F 0%, #2F5A52 40%, #6FBE9F 75%, #C8F0D5 100%)',
    geyser:    'linear-gradient(160deg, #233247 0%, #6F7B96 40%, #C9D4DE 80%, #F5EBC8 100%)',
    sunset:    'linear-gradient(160deg, #3A1B7A 0%, #B331E2 40%, #FF7A2E 75%, #FFB347 100%)',
    blackbeach:'linear-gradient(160deg, #161B26 0%, #313847 50%, #6B7689 100%)',
    moss:      'linear-gradient(160deg, #1F3A2D 0%, #3B7A4D 40%, #9CDB7E 75%, #DCFFA8 100%)',
    snowroad:  'linear-gradient(160deg, #485670 0%, #8DA1BD 40%, #DCE6F2 70%, #FFFFFF 100%)',
    village:   'linear-gradient(160deg, #2B2540 0%, #804F8F 40%, #FF8C66 75%, #FFD49E 100%)',
  };
  function fakePhoto(preset) {
    return PHOTO_PRESETS[preset] || PHOTO_PRESETS.aurora;
  }

  // Sparkle SVG over a "photo" — adds visual interest without real imagery.
  function PhotoSparkles({ density = 8, color = '#fff' }) {
    const sparks = Array.from({ length: density }, (_, i) => ({
      cx: 6 + (i * 13) % 90 + Math.random() * 4,
      cy: 8 + ((i * 7) % 70) + Math.random() * 6,
      r: 0.6 + Math.random() * 1.4,
      o: 0.4 + Math.random() * 0.5,
    }));
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {sparks.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={color} opacity={s.o} />
        ))}
      </svg>
    );
  }

  // -------------------------------------------------------------------
  // Categories — UI ordering + iconography. The same set is mirrored in
  // `data/bokunTranslations.js` under `CATEGORY` for activity-tag lookups;
  // when an editor adds a new category there, also add it here so the home
  // strip + filter rail show it.
  // -------------------------------------------------------------------
  /** Primary experience types (maps to activity.chipIds). */
  const CATEGORIES = [
    { id: 'aurora',     icon: 'sparkles',      label: { hant: '極光',     hans: '极光',     en: 'Northern Lights' } },
    { id: 'glacier',    icon: 'mountain-snow', label: { hant: '冰川',     hans: '冰川',     en: 'Glacier' } },
    { id: 'hotspring',  icon: 'droplets',      label: { hant: '溫泉',     hans: '温泉',     en: 'Hot spring' } },
    { id: 'day',        icon: 'sun',           label: { hant: '一日遊',   hans: '一日游',   en: 'Day tours' } },
    { id: 'self-drive', icon: 'car-front',     label: { hant: '自駕',     hans: '自驾',     en: 'Self-drive' } },
    { id: 'water',      icon: 'waves',         label: { hant: '水上',     hans: '水上',     en: 'Water' } },
    { id: 'snow',       icon: 'snowflake',     label: { hant: '雪地',     hans: '雪地',     en: 'Snow & jeep' } },
    { id: 'outdoor',    icon: 'footprints',    label: { hant: '戶外',     hans: '户外',     en: 'Outdoor' } },
  ];

  /** Classic route facets (maps to activity.routeIds). */
  const ROUTES = [
    { id: 'golden-circle', label: { hant: '黃金圈', hans: '黄金圈', en: 'Golden Circle' } },
    { id: 'south-coast',   label: { hant: '南岸',   hans: '南岸',   en: 'South Coast' } },
  ];

  // -------------------------------------------------------------------
  // Trip search (Hero → Tours → Activity detail)
  // -------------------------------------------------------------------
  const TRIP_SEARCH_STORAGE_KEY = 'auralis.tripSearch';

  const TRIP_HUBS = [
    {
      id: 'reykjavik',
      facetId: 'reykjavik',
      label: { hant: '雷克雅維克 (KEF)', hans: '雷克雅未克 (KEF)', en: 'Reykjavík (KEF)' },
    },
  ];

  const TRIP_HUB_IDS = new Set(TRIP_HUBS.map((h) => h.id));

  function isoDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function defaultTripSearch() {
    return {
      hubId: 'reykjavik',
      startDate: isoDateOffset(14),
      endDate: isoDateOffset(21),
      adults: 2,
      children: 0,
    };
  }

  // OTA-standard pax caps: adults 1–9, children 0–9, group total ≤ 15.
  const TRIP_PAX_LIMITS = {
    adultMin: 1,
    adultMax: 9,
    childMin: 0,
    childMax: 9,
    totalMax: 15,
  };

  function normalizeTripSearch(raw) {
    const base = defaultTripSearch();
    const hubId = raw && TRIP_HUB_IDS.has(raw.hubId) ? raw.hubId : base.hubId;
    const today = todayIsoDate();
    let startDate = (raw && raw.startDate) || base.startDate;
    let endDate = (raw && raw.endDate) || base.endDate;
    if (startDate < today) startDate = today;
    if (endDate < startDate) endDate = startDate;
    let adults = Math.min(
      TRIP_PAX_LIMITS.adultMax,
      Math.max(TRIP_PAX_LIMITS.adultMin, Number(raw && raw.adults) || base.adults),
    );
    let children = Math.min(
      TRIP_PAX_LIMITS.childMax,
      Math.max(TRIP_PAX_LIMITS.childMin, Number(raw && raw.children) || base.children),
    );
    if (adults + children > TRIP_PAX_LIMITS.totalMax) {
      children = Math.max(TRIP_PAX_LIMITS.childMin, TRIP_PAX_LIMITS.totalMax - adults);
    }
    return { hubId, startDate, endDate, adults, children };
  }

  function loadTripSearch() {
    try {
      const saved = typeof localStorage !== 'undefined' && localStorage.getItem(TRIP_SEARCH_STORAGE_KEY);
      if (saved) return normalizeTripSearch(JSON.parse(saved));
    } catch (e) { /* ignore */ }
    return defaultTripSearch();
  }

  function saveTripSearch(tripSearch) {
    try {
      localStorage.setItem(TRIP_SEARCH_STORAGE_KEY, JSON.stringify(normalizeTripSearch(tripSearch)));
    } catch (e) { /* ignore */ }
  }

  function facetsFromTripSearch(tripSearch) {
    const hub = TRIP_HUBS.find((h) => h.id === tripSearch?.hubId);
    return hub && hub.facetId ? [hub.facetId] : [];
  }

  function formatTripSearchDateRange(tripSearch, lang) {
    const { startDate, endDate } = normalizeTripSearch(tripSearch);
    const locale = lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
    const opts = { day: 'numeric', month: 'short', year: 'numeric' };
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    const a = start.toLocaleDateString(locale, opts);
    const b = end.toLocaleDateString(locale, opts);
    if (startDate === endDate) return a;
    return pick(lang, {
      hant: `${a} → ${b}`,
      hans: `${a} → ${b}`,
      en: `${a} → ${b}`,
    });
  }

  function formatTripSearchPax(tripSearch, lang) {
    const { adults, children } = normalizeTripSearch(tripSearch);
    if (children > 0) {
      return pick(lang, {
        hant: `${adults} 成人 · ${children} 孩童`,
        hans: `${adults} 成人 · ${children} 孩童`,
        en: `${adults} adult${adults === 1 ? '' : 's'} · ${children} child${children === 1 ? '' : 'ren'}`,
      });
    }
    return pick(lang, {
      hant: `${adults} 位成人`,
      hans: `${adults} 位成人`,
      en: `${adults} adult${adults === 1 ? '' : 's'}`,
    });
  }

  function formatTripSearchSummary(tripSearch, lang) {
    const hub = TRIP_HUBS.find((h) => h.id === tripSearch?.hubId);
    const hubLabel = hub ? pick(lang, hub.label) : '';
    const dates = formatTripSearchDateRange(tripSearch, lang);
    const pax = formatTripSearchPax(tripSearch, lang);
    return [hubLabel, dates, pax].filter(Boolean).join(' · ');
  }

  /**
   * Strip Bókun-authored inline styles and disallowed tags from vendor HTML
   * so we can render it inside our design system. Keeps <ul>/<ol>/<li>/<p>/
   * <strong>/<em>/<br>/<a>; removes <script>/<iframe>/<style>; drops style/
   * class/onclick attributes; and links are forced to noopener+target=_blank.
   */
  function sanitizeVendorHtml(html) {
    if (!html || typeof html !== 'string') return '';
    let out = html;
    out = out.replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, '');
    out = out.replace(/<([a-z0-9]+)\b([^>]*)>/gi, (_, tag, attrs) => {
      const lower = String(tag).toLowerCase();
      const allowedTags = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'span', 'div', 'h3', 'h4']);
      if (!allowedTags.has(lower)) return '';
      let cleanAttrs = '';
      if (lower === 'a') {
        const href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || attrs.match(/\bhref\s*=\s*'([^']*)'/i) || [])[1];
        if (href && /^(https?:\/\/|mailto:|tel:)/i.test(href)) {
          cleanAttrs = ` href="${href}" target="_blank" rel="noopener noreferrer"`;
        }
      }
      return `<${lower}${cleanAttrs}>`;
    });
    out = out.replace(/<\/([a-z0-9]+)>/gi, (_, tag) => {
      const lower = String(tag).toLowerCase();
      const allowedTags = new Set(['p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'span', 'div', 'h3', 'h4']);
      return allowedTags.has(lower) ? `</${lower}>` : '';
    });
    return out.trim();
  }

  function vendorHtmlIsMeaningful(html) {
    if (!html) return false;
    const text = String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text.length > 0;
  }

  // -------------------------------------------------------------------
  // Toast — lightweight imperative notifier rendered into document.body.
  // Used by the trip CTA so adds/removes get on-screen confirmation
  // without forcing a global React state plumbing.
  // -------------------------------------------------------------------
  function ensureToastStack() {
    if (typeof document === 'undefined' || !document.body) return null;
    let el = document.getElementById('auralis-toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auralis-toast-stack';
      Object.assign(el.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: '9999',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '8px',
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 48px)',
      });
      document.body.appendChild(el);
    }
    return el;
  }

  function showToast({
    message, description, icon, actionLabel, onAction,
    timeoutMs = 3600, tone = 'default',
  } = {}) {
    const stack = ensureToastStack();
    if (!stack || !message) return () => {};

    const node = document.createElement('div');
    node.setAttribute('role', 'status');
    Object.assign(node.style, {
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '14px 16px',
      borderRadius: '14px',
      background: tone === 'success' ? '#0A7B4F' : '#1A1F2E',
      color: '#fff',
      boxShadow: '0 12px 36px rgba(8, 12, 24, 0.32)',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 0.22s ease, transform 0.22s ease',
      width: 'min(420px, 92vw)',
      boxSizing: 'border-box',
    });

    if (icon) {
      const iconWrap = document.createElement('span');
      Object.assign(iconWrap.style, {
        flex: '0 0 auto',
        width: '24px', height: '24px',
        borderRadius: '999px',
        display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.16)',
        marginTop: '1px',
      });
      const el = document.createElement('i');
      el.setAttribute('data-lucide', icon);
      iconWrap.appendChild(el);
      node.appendChild(iconWrap);
      if (window.lucide) {
        window.lucide.createIcons({
          nameAttr: 'data-lucide',
          attrs: { width: 14, height: 14, 'stroke-width': 2.4, color: '#fff' },
        });
      }
    }

    const col = document.createElement('div');
    Object.assign(col.style, {
      flex: '1 1 auto',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    });

    const title = document.createElement('div');
    title.textContent = String(message);
    Object.assign(title.style, {
      font: '600 13px/1.4 var(--font-text, system-ui)',
      color: '#fff',
    });
    col.appendChild(title);

    if (description) {
      const desc = document.createElement('div');
      desc.textContent = String(description);
      Object.assign(desc.style, {
        font: '500 12px/1.45 var(--font-text, system-ui)',
        color: 'rgba(255,255,255,0.78)',
        display: '-webkit-box',
        WebkitLineClamp: '2',
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        wordBreak: 'break-word',
      });
      // Some browsers (older Safari) want kebab-case; assign defensively.
      desc.style.setProperty('-webkit-line-clamp', '2');
      desc.style.setProperty('-webkit-box-orient', 'vertical');
      col.appendChild(desc);
    }
    node.appendChild(col);

    let timer;
    function dismiss() {
      if (timer) { clearTimeout(timer); timer = null; }
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }

    if (actionLabel && typeof onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(actionLabel);
      Object.assign(btn.style, {
        flex: '0 0 auto',
        appearance: 'none',
        border: '0',
        padding: '7px 12px',
        borderRadius: '999px',
        background: 'rgba(255,255,255,0.18)',
        color: '#fff',
        cursor: 'pointer',
        font: '600 12px/1.2 var(--font-text, system-ui)',
        marginTop: '1px',
        whiteSpace: 'nowrap',
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.28)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.18)'; });
      btn.addEventListener('click', () => {
        try { onAction(); } catch (_) {}
        dismiss();
      });
      node.appendChild(btn);
    }

    stack.appendChild(node);
    requestAnimationFrame(() => {
      node.style.opacity = '1';
      node.style.transform = 'translateY(0)';
    });
    timer = setTimeout(dismiss, timeoutMs);
    return dismiss;
  }

  // -------------------------------------------------------------------
  // Wishlist (Set of activity IDs persisted in localStorage)
  // -------------------------------------------------------------------
  const WISHLIST_STORAGE_KEY = 'auralis.wishlist';
  const wishlistListeners = new Set();

  function readWishlistSet() {
    try {
      const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeWishlistSet(set) {
    try {
      window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([...set]));
    } catch (_) { /* quota / SSR */ }
  }

  function isWishlisted(id) {
    if (!id) return false;
    return readWishlistSet().has(String(id));
  }

  function toggleWishlist(id) {
    if (!id) return false;
    const set = readWishlistSet();
    const key = String(id);
    const next = set.has(key);
    if (next) set.delete(key); else set.add(key);
    writeWishlistSet(set);
    wishlistListeners.forEach((fn) => { try { fn(set); } catch (_) {} });
    return !next; // returns new "wishlisted" state
  }

  /** Subscribe a React setter to wishlist changes. Returns unsubscribe fn. */
  function subscribeWishlist(fn) {
    wishlistListeners.add(fn);
    return () => wishlistListeners.delete(fn);
  }

  /** Hero quick picks → Tours filters (keeps hub facet from trip search). */
  const HERO_POPULAR_CHIPS = [
    { chipId: 'aurora' },
    { routeId: 'golden-circle' },
    { chipId: 'hotspring' },
    { chipId: 'self-drive' },
  ];

  /** Orthogonal facets (maps to activity.facetIds; AND when multiple selected). */
  const FACETS = [
    { id: 'premium',      label: { hant: '頂級／私人', hans: '顶级／私人', en: 'Premium / private' } },
    { id: 'free-cancel',  label: { hant: '可免費取消', hans: '可免费取消', en: 'Free cancellation' } },
    { id: 'mandarin',     label: { hant: '中文導覽',   hans: '中文导览',   en: 'Mandarin guide' } },
    { id: 'winter',       label: { hant: '冬季',       hans: '冬季',       en: 'Winter' } },
    { id: 'reykjavik',    label: { hant: '雷市出發',   hans: '雷市出发',   en: 'From Reykjavík' } },
  ];

  // -------------------------------------------------------------------
  // Supplier options — derived from the live Bókun vendor list. We expose
  // this as a function rather than a constant so the labels follow the
  // current language, and so the list automatically picks up new vendors
  // as Bókun adds them.
  // -------------------------------------------------------------------
  function formatCatalogCount(n, lang) {
    const num = Number(n);
    if (!Number.isFinite(num) || num <= 0) return pick(lang, { hant: '—', hans: '—', en: '—' });
    const locale = lang === 'en' ? 'en-US' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
    return num.toLocaleString(locale);
  }

  /** Same-origin WebP thumb for Bókun S3 covers (see /api/media/thumb). */
  function proxyImageUrl(url, opts = {}) {
    const { w = 480, q = 80 } = opts;
    if (!url || typeof url !== 'string') return url;
    if (!/^https:\/\/bokun\.s3\.amazonaws\.com\//i.test(url)) return url;
    const params = new URLSearchParams({ url, w: String(w), q: String(q) });
    return `/api/media/thumb?${params.toString()}`;
  }

  function prefetchProxiedImage(url, opts = { w: 520, q: 78 }) {
    const href = proxyImageUrl(url, opts);
    if (!href) return;
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    document.head.appendChild(link);
  }

  /**
   * Tours toolbar — always label with Bókun contract product count (Marketplace summary).
   * Matches Adventure Vikings: "18 tours in contract". Extra filters only narrow the grid.
   */
  function formatToursToolbarSummary({
    filtered,
    loadedUnique,
    contractProducts,
    hasExtraFilters = false,
    lang,
  }) {
    const f = Number(filtered) || 0;
    const contract = Number(contractProducts) || 0;
    const nf = formatCatalogCount(f, lang);
    const nc = formatCatalogCount(contract, lang);

    if (hasExtraFilters && contract > 0) {
      return pick(lang, {
        hant: `顯示 ${nf} / 合約 ${nc}`,
        hans: `显示 ${nf} / 合约 ${nc}`,
        en: `${nf} of ${nc} in contract`,
      });
    }

    if (contract > 0) {
      return pick(lang, {
        hant: `合約 ${nc} 個行程`,
        hans: `合约 ${nc} 个行程`,
        en: `${nc} tours in contract`,
      });
    }

    const nl = formatCatalogCount(Number(loadedUnique) || 0, lang);
    return pick(lang, {
      hant: `共 ${nl} 個行程`,
      hans: `共 ${nl} 个行程`,
      en: `${nl} tours`,
    });
  }

  // -------------------------------------------------------------------
  // SPA URL routing — single source of truth so back/forward + reload work
  // and shareable filter links survive across sessions.
  // -------------------------------------------------------------------
  const URL_SCREENS = ['home', 'tours', 'trip', 'checkout', 'journal'];
  const URL_PATH_BY_SCREEN = {
    home: '/',
    tours: '/tours',
    trip: '/trip',
    checkout: '/checkout',
    journal: '/journal',
  };

  function readUrlState() {
    if (typeof window === 'undefined') return null;
    const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search || '');

    // /tours/<id> → detail overlay. Accept positive integer ids only so that
    // future slug-based paths can be added without ambiguity.
    let activityId = null;
    const detailMatch = path.match(/^\/tours\/(\d+)$/);
    let screen;
    if (detailMatch) {
      screen = 'detail';
      activityId = Number(detailMatch[1]);
    } else if (path === '/tours' || path.startsWith('/tours/')) {
      screen = 'tours';
    } else if (path === '/trip') {
      screen = 'trip';
    } else if (path === '/checkout') {
      screen = 'checkout';
    } else if (path === '/journal') {
      screen = 'journal';
    } else {
      screen = 'home';
    }

    return {
      screen,
      activityId,
      chip: params.get('chip') || null,
      route: params.get('route') || null,
      supplier: params.get('supplier') || 'all',
      q: params.get('q') || '',
    };
  }

  function buildUrlForState({ screen, chip, route, supplier, q, activityId }) {
    // Detail screen URL is /tours/<id> so the page survives a hard reload and
    // shareable links land directly on the activity.
    if (screen === 'detail' && Number.isFinite(Number(activityId)) && Number(activityId) > 0) {
      const params = new URLSearchParams();
      if (chip) params.set('chip', chip);
      if (route) params.set('route', route);
      if (supplier && supplier !== 'all') params.set('supplier', String(supplier));
      if (q && String(q).trim()) params.set('q', String(q).trim());
      const search = params.toString();
      const detailPath = `/tours/${Number(activityId)}`;
      return search ? `${detailPath}?${search}` : detailPath;
    }

    const path = URL_PATH_BY_SCREEN[screen] || '/';
    const params = new URLSearchParams();
    if (chip) params.set('chip', chip);
    if (route) params.set('route', route);
    if (supplier && supplier !== 'all') params.set('supplier', String(supplier));
    if (q && String(q).trim()) params.set('q', String(q).trim());
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  }

  function currentUrlString() {
    if (typeof window === 'undefined') return '/';
    return `${window.location.pathname}${window.location.search}`;
  }

  /**
   * Tours title — adapts to the active filter so the count and headline match.
   *   141 experiences in Iceland          ← no filter
   *   22 Northern Lights tours from Reykjavík
   *   18 Adventure Vikings tours
   */
  function formatToursPageTitle({
    filteredCount,
    contractTotal,
    activeChip,
    activeRoute,
    activeSupplierLabel,
    activeQuery,
    hubLabel,
    lang,
  }) {
    const queryTrim = String(activeQuery || '').trim();
    const hasFilter = !!(activeChip || activeRoute || activeSupplierLabel || queryTrim);
    const filtered = Number(filteredCount);
    const contract = Number(contractTotal);
    const baseCount = hasFilter
      ? (Number.isFinite(filtered) ? filtered : 0)
      : (Number.isFinite(contract) && contract > 0
        ? contract
        : (Number.isFinite(filtered) ? filtered : 0));
    const showCount = formatCatalogCount(baseCount, lang);

    const chip = activeChip ? CATEGORIES.find((c) => c.id === activeChip) : null;
    const route = activeRoute ? ROUTES.find((r) => r.id === activeRoute) : null;
    const filterLabel = chip
      ? pick(lang, chip.label)
      : route
        ? pick(lang, route.label)
        : null;

    if (queryTrim) {
      return pick(lang, {
        hant: `${showCount} 個含「${queryTrim}」的行程`,
        hans: `${showCount} 个含「${queryTrim}」的行程`,
        en: `${showCount} tours matching "${queryTrim}"`,
      });
    }

    if (activeSupplierLabel) {
      return pick(lang, {
        hant: `${showCount} 個 ${activeSupplierLabel} 行程`,
        hans: `${showCount} 个 ${activeSupplierLabel} 行程`,
        en: `${showCount} ${activeSupplierLabel} tours`,
      });
    }

    if (filterLabel) {
      const fromHub = hubLabel
        ? pick(lang, { hant: `${hubLabel}出發`, hans: `${hubLabel}出发`, en: `from ${hubLabel}` })
        : '';
      return pick(lang, {
        hant: `${showCount} 個 ${filterLabel} 行程${fromHub ? ` · ${fromHub}` : ''}`,
        hans: `${showCount} 个 ${filterLabel} 行程${fromHub ? ` · ${fromHub}` : ''}`,
        en: `${showCount} ${filterLabel} tours${fromHub ? ` ${fromHub}` : ''}`,
      });
    }

    return pick(lang, {
      hant: `${showCount} 個體驗等你挑選`,
      hans: `${showCount} 个体验等你挑选`,
      en: `${showCount} experiences in Iceland`,
    });
  }

  function activityVendor(vm) {
    return (vm && (vm.vendor || (vm.raw && vm.raw.vendor))) || null;
  }

  function vendorIdKey(v) {
    if (!v || v.id == null || v.id === '') return null;
    return String(v.id).trim();
  }

  function vendorIdsMatch(a, b) {
    if (a == null || b == null || a === 'all' || b === 'all') return a === b;
    return String(a).trim() === String(b).trim();
  }

  /**
   * Supplier filter options — counts from meta.vendorContractCounts (Bókun contract
   * product totals per vendor), falling back to unique ids in loaded activities.
   */
  function getSupplierOptions(lang, activities = [], { vendorContractCounts = null, vendors = null } = {}) {
    const list = activities || [];
    const contractCounts = vendorContractCounts && typeof vendorContractCounts === 'object'
      ? vendorContractCounts
      : null;
    const all = {
      id: 'all',
      label: pick(lang, { hant: '全部', hans: '全部', en: 'All' }),
      count: contractCounts
        ? Object.values(contractCounts).reduce((sum, n) => sum + (Number(n) || 0), 0)
        : null,
    };
    const byVendor = new Map();
    list.forEach((vm) => {
      const v = activityVendor(vm);
      const key = vendorIdKey(v);
      if (!key) return;
      if (!byVendor.has(key)) {
        byVendor.set(key, {
          id: v.id,
          label: v.titleOriginal || v.title || vm.supplier || key,
          ids: new Set(),
        });
      }
      if (vm.id != null) byVendor.get(key).ids.add(String(vm.id));
    });

    const fromMeta = Array.isArray(vendors) ? vendors : [];
    fromMeta.forEach((v) => {
      const key = vendorIdKey({ id: v.id });
      if (!key || byVendor.has(key)) return;
      byVendor.set(key, {
        id: v.id,
        label: v.title || String(v.id),
        ids: new Set(),
      });
    });

    const vendorRows = [...byVendor.values()]
      .map((entry) => {
        const key = vendorIdKey({ id: entry.id });
        const count = contractCounts && key && contractCounts[key] != null
          ? Number(contractCounts[key])
          : entry.ids.size;
        return {
          id: entry.id,
          label: entry.label,
          count: Number.isFinite(count) ? count : entry.ids.size,
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return [all, ...vendorRows];
  }

  window.AuralisUI = {
    Icon, formatPrice, singleCurrency, formatTotalAmount,
    CURRENCIES, DISPLAY_CURRENCIES, currencyLabel, FX_BASE, defaultCurrencyForLang,
    convertFromUsd, formatDisplayPrice, formatDisplayPriceCompact, formatTotalDisplay, tripTotalUsd,
    fakePhoto, PhotoSparkles, proxyImageUrl, prefetchProxiedImage,
    isMobileViewport, useMobileViewport, imageProfileForViewport, useResponsiveImageProfile,
    aboveFoldImagePriorityCount, prefersReducedData,
    CATEGORIES, ROUTES, FACETS, formatCatalogCount, formatToursToolbarSummary, formatToursPageTitle,
    readUrlState, buildUrlForState, currentUrlString, URL_PATH_BY_SCREEN,
    TRIP_HUBS, HERO_POPULAR_CHIPS, TRIP_PAX_LIMITS, defaultTripSearch, normalizeTripSearch, loadTripSearch, saveTripSearch,
    isWishlisted, toggleWishlist, subscribeWishlist,
    showToast,
    sanitizeVendorHtml, vendorHtmlIsMeaningful,
    facetsFromTripSearch, formatTripSearchDateRange, formatTripSearchPax, formatTripSearchSummary,
    todayIsoDate, isoDateOffset,
    getSupplierOptions, activityVendor, vendorIdKey, vendorIdsMatch, LANGS, pick, makeT, applyHtmlLang,
    brandZhName, brandFullTitle, brandLogoSrc, brandLogoAlt, applyBrandDocument,
    SITE_THEMES, HERO_THEMES, ThemePicker,
    getInitialSiteTheme, setSiteThemeById, applySiteTheme,
    pickSiteThemeForSession, pickHeroThemeForSession, getOrPickHeroTheme,
  };
})();
