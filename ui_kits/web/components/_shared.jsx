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

  /** Rates are target units per 1 USD (Frankfurter). */
  function convertToUsd(amount, fromCurrency, rates) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const from = (fromCurrency || FX_BASE).toUpperCase();
    if (from === FX_BASE) return n;
    const rate = rates && rates[from];
    if (!rate || !Number.isFinite(rate) || rate <= 0) return n;
    return n / rate;
  }

  /** Legacy DB rows stored ISK amounts with currency=USD. */
  function looksLikeMislabeledIskAsUsd(amountUsd, rates) {
    const n = Number(amountUsd);
    if (!Number.isFinite(n) || n < 2000) return false;
    const rate = rates && rates.ISK;
    if (!rate || !Number.isFinite(rate) || rate <= 0) return n >= 5000;
    const asUsd = n / rate;
    return asUsd >= 25 && asUsd <= 2500;
  }

  function amountToUsd(amount, currency, rates) {
    const code = (currency || FX_BASE).toUpperCase();
    if (code === FX_BASE && looksLikeMislabeledIskAsUsd(amount, rates)) {
      return convertToUsd(amount, 'ISK', rates);
    }
    if (code === FX_BASE) return Number(amount) || 0;
    return convertToUsd(amount, code, rates);
  }

  function roundForCurrency(amount, code) {
    const c = (code || FX_BASE).toUpperCase();
    return currencyDisplaysAsInteger(c) ? Math.round(amount) : Math.round(amount * 100) / 100;
  }

  /** Bókun USD amount → user-selected display currency (no hardcoded rates). */
  function formatDisplayPrice(amountUsd, displayCurrency, rates) {
    const code = (displayCurrency || FX_BASE).toUpperCase();
    const usd = amountToUsd(amountUsd, FX_BASE, rates);
    const converted = roundForCurrency(convertFromUsd(usd, code, rates), code);
    return formatPrice(converted, code);
  }

  /**
   * Compact "starts from" price for cards — always rounded to the nearest unit
   * so the headline reads $68 instead of $67.82. Detail and checkout keep the
   * precise figure via formatDisplayPrice.
   */
  function formatDisplayPriceCompact(amountUsd, displayCurrency, rates) {
    const code = (displayCurrency || FX_BASE).toUpperCase();
    const usd = amountToUsd(amountUsd, FX_BASE, rates);
    const converted = Math.round(convertFromUsd(usd, code, rates));
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
      if (lang === 'hans') return '/assets/logo-wordmark-white-hans.svg';
      if (lang === 'en') return '/assets/logo-wordmark-white-en.svg';
      return '/assets/logo-wordmark-white.svg';
    }
    if (lang === 'hans') return '/assets/logo-wordmark-hans.svg';
    if (lang === 'en') return '/assets/logo-wordmark-en.svg';
    return '/assets/logo-wordmark.svg';
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
  function escapeHtmlText(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function extractParagraphTextsFromHtml(html) {
    const raw = String(html || '');
    if (!raw) return [];
    const out = [];
    const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(raw))) {
      const t = String(m[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  }

  /** Document-order <p> and <li> blocks from vendor HTML. */
  function extractHtmlBlocks(html) {
    const raw = String(html || '');
    if (!raw) return [];
    const out = [];
    const re = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(raw))) {
      const type = String(m[1] || '').toLowerCase();
      const text = String(m[2] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      out.push({ type: type === 'li' ? 'li' : 'p', text });
    }
    return out;
  }

  function blocksToHtml(blocks, texts) {
    const specs = Array.isArray(blocks) ? blocks : [];
    const parts = Array.isArray(texts) ? texts : [];
    let html = '';
    let liBuffer = [];

    const flushList = () => {
      if (!liBuffer.length) return;
      html += `<ul>${liBuffer.map((t) => `<li>${escapeHtmlText(t)}</li>`).join('')}</ul>`;
      liBuffer = [];
    };

    specs.forEach((spec, i) => {
      const t = String(parts[i] || '').trim();
      if (!t) return;
      if (spec.type === 'li') {
        liBuffer.push(t);
        return;
      }
      flushList();
      html += `<p>${escapeHtmlText(t)}</p>`;
    });
    flushList();
    return html;
  }

  /**
   * English list-item phrase → likely start of that item in merged Chinese overlay.
   * Longer keys are tried first (see chineseAnchorsForEnglishListItem).
   */
  const LIST_ITEM_ANCHOR_PHRASES = [
    ['if no aurora is seen', '如果沒有看到極光'],
    ['when no northern lights are seen', '當行程'],
    ['heavily dependent on weather conditions', '由於極光'],
    ['northern lights tour is heavily', '由於極光'],
    ['complementary retry valid for', '當行程'],
    ['english speaking tour guide', '英語'],
    ['pick-up & drop off from', '從雷克雅維克'],
    ['pick up and drop off from', '從雷克雅維克'],
    ['guided visit to south shore', '南岸'],
    ['south shore highlights', '南岸'],
    ['free wifi on board', '車上'],
    ['northern lights photos', '極光照片'],
    ['icelandic hot cocoa', '冰島'],
    ['two separate tours', '兩個獨立'],
    ['shoe spike grips', '鞋釘'],
    ['very sturdy footwear', '堅固的鞋子'],
    ['warm outdoor layers', '溫暖的戶外'],
    ['weatherproof top layer', '防風防水'],
    ['food and beverage', '食品和飲料'],
    ['food and drink', '食品'],
    ['on board your bus', '車上'],
    ['complementary retry', '當行程'],
    ['no aurora is seen', '如果沒有看到極光'],
    ['english speaking', '英語'],
    ['south shore', '南岸'],
    ['sturdy footwear', '堅固的鞋子'],
    ['spike grips', '抓地器'],
    ['hiking boots', '健行靴'],
    ['shoe spike', '鞋釘'],
    ['shoe grips', '鞋釘'],
    ['warm outdoor', '溫暖的戶外'],
    ['weatherproof', '防風防水'],
    ['guided visit', '導覽'],
    ['free wifi', '車上'],
    ['hot cocoa', '熱可可'],
    ['pick-up', '接送'],
    ['drop-off', '下車'],
    ['drop off', '下車'],
    ['headwear', '頭飾'],
    ['not included', '不包含'],
    ['gloves', '手套'],
    ['scarves', '圍巾'],
    ['scarf', '圍巾'],
    ['camera', '相機'],
    ['hiking', '健行'],
    ['icelandic', '冰島'],
    ['reykjav', '雷克雅維克'],
  ];

  function findChineseAnchorPosition(cleaned, anchor, fromIndex) {
    const hay = String(cleaned || '');
    const needle = String(anchor || '');
    if (!needle) return -1;
    const start = Math.max(0, Number(fromIndex) || 0);
    let pos = hay.indexOf(needle, start);
    if (pos >= 0) return pos;
    if (/[a-z]/i.test(needle)) {
      pos = hay.toLowerCase().indexOf(needle.toLowerCase(), start);
      if (pos >= 0) return pos;
    }
    return -1;
  }

  function chineseAnchorsForEnglishListItem(englishText) {
    const en = String(englishText || '').trim();
    const lower = en.toLowerCase();
    const anchors = [];
    const sorted = LIST_ITEM_ANCHOR_PHRASES.slice().sort((a, b) => b[0].length - a[0].length);
    for (let i = 0; i < sorted.length; i += 1) {
      const [key, zh] = sorted[i];
      if (lower.includes(key) && !anchors.includes(zh)) anchors.push(zh);
    }
    const paren = en.match(/\(([^)]+)\)/);
    if (paren) {
      const p = paren[1].toLowerCase();
      if (/oct/.test(p) && /apr/.test(p) && !anchors.includes('（十月到四月）')) {
        anchors.push('（十月到四月）');
      } else if (/oct/.test(p) && /mar/.test(p) && !anchors.includes('（十月')) {
        anchors.push('（十月');
      } else if (/apr/.test(p) && !anchors.includes('（四月')) {
        anchors.push('（四月');
      }
    }
    return anchors;
  }

  function alignPlainPartsToListItems(text, sourceItems) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    const sources = (sourceItems || []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!cleaned) return [];
    if (sources.length <= 1) return [cleaned];

    const starts = [0];
    for (let i = 1; i < sources.length; i += 1) {
      const anchors = chineseAnchorsForEnglishListItem(sources[i]);
      let pos = -1;
      for (let a = 0; a < anchors.length; a += 1) {
        const anchor = anchors[a];
        pos = findChineseAnchorPosition(cleaned, anchor, starts[i - 1] + 1);
        if (pos <= starts[i - 1]) {
          pos = findChineseAnchorPosition(cleaned, anchor, starts[i - 1]);
        }
        if (pos > starts[i - 1]) break;
      }
      if (pos <= starts[i - 1]) {
        const rest = cleaned.slice(starts[i - 1]);
        const sub = splitBySourceParagraphWeights(rest, sources.slice(i - 1));
        const out = [];
        for (let j = 0; j < i - 1; j += 1) {
          out.push(cleaned.slice(starts[j], starts[j + 1]).trim());
        }
        sub.forEach((part) => out.push(part));
        return out.map((p) => String(p || '').trim()).filter((p, idx, arr) => p || idx < arr.length);
      }
      starts.push(pos);
    }

    const parts = [];
    for (let i = 0; i < sources.length; i += 1) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : cleaned.length;
      parts.push(cleaned.slice(start, end).trim());
    }
    return parts;
  }

  function alignPlainPartsToSource(text, sourceTexts, opts) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    const source = (sourceTexts || []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!cleaned) return [];
    if (!source.length) return [cleaned];

    if (opts && opts.listItems) {
      const listParts = alignPlainPartsToListItems(cleaned, source);
      if (listParts.length === source.length) return listParts;
    }

    let parts = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== source.length) {
      parts = alignTextToSourceParagraphs(cleaned, source);
    }
    if (parts.length !== source.length) {
      parts = splitBySourceParagraphWeights(cleaned, source);
    }
    while (parts.length < source.length) parts.push('');
    if (parts.length > source.length) parts = parts.slice(0, source.length);
    return parts.map((p) => String(p || '').trim());
  }

  /** Align translated plain strings to an English list (Quick facts chips/items). */
  function alignStringListToSource(items, sourceItems) {
    const source = (sourceItems || []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!source.length) {
      return Array.isArray(items) ? items.map((s) => String(s || '').trim()).filter(Boolean) : [];
    }
    const input = Array.isArray(items) ? items.join(' ') : String(items || '');
    return alignPlainPartsToSource(input, source, { listItems: true });
  }

  function splitBySourceParagraphWeights(text, sourceParagraphs) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    const n = Array.isArray(sourceParagraphs) ? sourceParagraphs.length : 0;
    if (!cleaned) return [];
    if (n <= 1) return [cleaned];

    const weights = sourceParagraphs.map((p) => Math.max(1, String(p || '').length));
    const parts = [];
    let cursor = 0;

    const findBoundary = (base, minEnd, maxEnd) => {
      const rightLimit = Math.min(maxEnd, base + 80);
      for (let i = base; i <= rightLimit; i += 1) {
        const ch = cleaned[i - 1];
        if (/[。！？!?；;.]/.test(ch)) return i;
      }
      const leftLimit = Math.max(minEnd, base - 80);
      for (let i = base; i >= leftLimit; i -= 1) {
        const ch = cleaned[i - 1];
        if (/[。！？!?；;.]/.test(ch)) return i;
      }
      return base;
    };

    for (let i = 0; i < n - 1; i += 1) {
      const remainingParas = n - i;
      const remainingChars = cleaned.length - cursor;
      const remainingWeight = weights.slice(i).reduce((a, b) => a + b, 0);
      const target = Math.max(1, Math.round((remainingChars * weights[i]) / remainingWeight));
      const minEnd = cursor + 1;
      const maxEnd = cleaned.length - (remainingParas - 1);
      let end = Math.min(maxEnd, Math.max(minEnd, cursor + target));
      end = findBoundary(end, minEnd, maxEnd);
      end = Math.min(maxEnd, Math.max(minEnd, end));
      const piece = cleaned.slice(cursor, end).trim();
      parts.push(piece || cleaned.slice(cursor, Math.min(cleaned.length, cursor + 1)));
      cursor = end;
    }
    parts.push(cleaned.slice(cursor).trim());
    return parts.filter((p) => p && p.trim());
  }

  function splitSegmentByWeights(segment, weights) {
    const cleaned = String(segment || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    const n = Array.isArray(weights) ? weights.length : 0;
    if (n <= 1) return [cleaned];

    const safeWeights = weights.map((w) => Math.max(1, Number(w) || 1));
    const out = [];
    let cursor = 0;

    const findBoundary = (base, minEnd, maxEnd) => {
      const rightLimit = Math.min(maxEnd, base + 80);
      for (let i = base; i <= rightLimit; i += 1) {
        const ch = cleaned[i - 1];
        if (/[。！？!?；;.]/.test(ch)) return i;
      }
      const leftLimit = Math.max(minEnd, base - 80);
      for (let i = base; i >= leftLimit; i -= 1) {
        const ch = cleaned[i - 1];
        if (/[。！？!?；;.]/.test(ch)) return i;
      }
      return base;
    };

    for (let i = 0; i < n - 1; i += 1) {
      const remainingParts = n - i;
      const remainingChars = cleaned.length - cursor;
      const remainingWeight = safeWeights.slice(i).reduce((a, b) => a + b, 0);
      const target = Math.max(1, Math.round((remainingChars * safeWeights[i]) / remainingWeight));
      const minEnd = cursor + 1;
      const maxEnd = cleaned.length - (remainingParts - 1);
      let end = Math.min(maxEnd, Math.max(minEnd, cursor + target));
      end = findBoundary(end, minEnd, maxEnd);
      end = Math.min(maxEnd, Math.max(minEnd, end));
      const piece = cleaned.slice(cursor, end).trim();
      out.push(piece || cleaned.slice(cursor, Math.min(cleaned.length, cursor + 1)));
      cursor = end;
    }
    out.push(cleaned.slice(cursor).trim());
    return out.filter((p) => p && p.trim());
  }

  function isHeadingParagraph(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (t.length > 60) return false;
    // Mostly Latin heading (e.g. "Sólheimajökull", "Reynisfjara", "Vík").
    if (/[\u4e00-\u9fff]/.test(t)) return false;
    return /^[A-Za-zÀ-ÿ0-9'().,&\-\s/]+$/.test(t);
  }

  function alignTextToSourceParagraphs(text, sourceParagraphs) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    const paras = Array.isArray(sourceParagraphs) ? sourceParagraphs : [];
    if (!cleaned || paras.length <= 1) return splitBySourceParagraphWeights(cleaned, paras);

    const headingIdx = [];
    paras.forEach((p, i) => { if (isHeadingParagraph(p)) headingIdx.push(i); });
    if (!headingIdx.length) return splitBySourceParagraphWeights(cleaned, paras);

    const lower = cleaned.toLowerCase();
    const anchors = [];
    let searchFrom = 0;
    for (const idx of headingIdx) {
      const key = String(paras[idx] || '').trim();
      const pos = lower.indexOf(key.toLowerCase(), searchFrom);
      if (pos < 0) continue;
      anchors.push({ idx, key, start: pos, end: pos + key.length });
      searchFrom = pos + key.length;
    }
    if (!anchors.length) return splitBySourceParagraphWeights(cleaned, paras);

    const out = [];
    const pushBodyRange = (bodyText, paraStart, paraEndExclusive) => {
      if (paraEndExclusive <= paraStart) return;
      const bodyParas = paras.slice(paraStart, paraEndExclusive);
      const weights = bodyParas.map((p) => Math.max(1, String(p || '').length));
      const chunks = splitSegmentByWeights(bodyText, weights);
      for (let i = 0; i < bodyParas.length; i += 1) {
        out.push(chunks[i] || '');
      }
    };

    // Before first heading anchor.
    const first = anchors[0];
    pushBodyRange(cleaned.slice(0, first.start).trim(), 0, first.idx);

    for (let i = 0; i < anchors.length; i += 1) {
      const curr = anchors[i];
      out.push(curr.key);
      const next = anchors[i + 1];
      const bodyStartIdx = curr.idx + 1;
      const bodyEndIdx = next ? next.idx : paras.length;
      const bodyStartPos = curr.end;
      const bodyEndPos = next ? next.start : cleaned.length;
      const bodyText = cleaned.slice(bodyStartPos, bodyEndPos).trim();
      pushBodyRange(bodyText, bodyStartIdx, bodyEndIdx);
    }

    // Normalize count to match source paragraph count exactly.
    if (out.length !== paras.length) return splitBySourceParagraphWeights(cleaned, paras);
    return out.map((p) => String(p || '').trim());
  }

  /**
   * Bókun vendor HTML; OpenAI overlays are often plain text.
   * Re-wrap into the same <p>/<ul><li> structure as English source.
   */
  function plainTextToStructuredHtml(text, sourceHtml) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return '';
    if (/<[a-z][\s\S]*?>/i.test(trimmed)) return trimmed;

    const sourceBlocks = extractHtmlBlocks(sourceHtml);
    if (sourceBlocks.length > 0) {
      const sourceTexts = sourceBlocks.map((b) => b.text);
      const allListItems = sourceBlocks.every((b) => b.type === 'li');
      const parts = alignPlainPartsToSource(trimmed, sourceTexts, { listItems: allListItems });
      return blocksToHtml(sourceBlocks, parts);
    }

    const sourceParagraphs = extractParagraphTextsFromHtml(sourceHtml);
    let parts = alignPlainPartsToSource(trimmed, sourceParagraphs);
    if (parts.length <= 1) {
      parts = trimmed
        .split(/(?<=[。！？])\s*(?=[A-Z])/)
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (parts.length <= 1) {
      return `<p>${escapeHtmlText(trimmed)}</p>`;
    }
    return parts.map((p) => `<p>${escapeHtmlText(p)}</p>`).join('');
  }

  function plainTextToParagraphHtml(text, sourceHtml) {
    return plainTextToStructuredHtml(text, sourceHtml);
  }

  function prepareVendorHtml(content, sourceHtml) {
    const raw = String(content || '').trim();
    if (!raw) return '';
    if (/<[a-z][\s\S]*?>/i.test(raw)) return raw;
    return plainTextToStructuredHtml(raw, sourceHtml);
  }

  function cancellationPolicyHasVendorHtml(policy) {
    if (!policy || typeof policy !== 'object') return false;
    return ['descriptionHtml', 'html', 'bodyHtml', 'contentHtml'].some(
      (key) => typeof policy[key] === 'string' && /<[a-z][\s\S]*?>/i.test(policy[key]),
    );
  }

  function shouldUseStructuredCancellationPolicy(policy, lang) {
    if (!policy || lang === 'en') return false;
    if (cancellationPolicyHasVendorHtml(policy)) return false;
    return Array.isArray(policy.penaltyRules) && policy.penaltyRules.length > 0;
  }

  function cancellationLeadTimeLabel(hours, pick) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return '';
    const days = h % 24 === 0 ? h / 24 : null;
    if (days != null) {
      return pick({
        hant: `${days} 天`,
        hans: `${days} 天`,
        en: `${days} day${days !== 1 ? 's' : ''}`,
      });
    }
    return pick({
      hant: `${h} 小時`,
      hans: `${h} 小时`,
      en: `${h} hour${h !== 1 ? 's' : ''}`,
    });
  }

  /** Mirror normalizeActivity penaltyRules → <ul><li> with localized copy. */
  function buildLocalizedCancellationPolicyHtml(policy, pick) {
    if (!policy || typeof policy !== 'object') return '';

    const policyType = String(policy.type || policy.policyType || policy.policyTypeEnum || '').toUpperCase();
    if (policyType === 'NON_REFUNDABLE') {
      return `<p>${pick({
        hant: '此行程不可退款。',
        hans: '此行程不可退款。',
        en: 'This experience is non-refundable.',
      })}</p>`;
    }
    if (policyType === 'FULL_REFUND') {
      return `<p>${pick({
        hant: '可免費取消——行程開始前可全額退款。',
        hans: '可免费取消——行程开始前可全额退款。',
        en: 'Free cancellation — full refund before the experience starts.',
      })}</p>`;
    }
    if (policyType === 'SIMPLE' && Number.isFinite(Number(policy.simpleCutoffHours)) && policy.simpleCutoffHours > 0) {
      const timeStr = cancellationLeadTimeLabel(policy.simpleCutoffHours, pick);
      return `<p>${pick({
        hant: `行程開始前 ${timeStr} 可免費取消。`,
        hans: `行程开始前 ${timeStr} 可免费取消。`,
        en: `Free cancellation up to ${timeStr} before the experience starts.`,
      })}</p>`;
    }

    if (!Array.isArray(policy.penaltyRules) || !policy.penaltyRules.length) return '';

    const rules = policy.penaltyRules.map((r) => {
      const hours = Number(r.cutoffHours);
      const charge = Number(r.charge ?? r.percentage ?? 0);
      if (!Number.isFinite(hours) || hours <= 0) return null;
      const timeStr = cancellationLeadTimeLabel(hours, pick);
      const line = pick({
        hant: `若在行程開始前 ${timeStr} 內（含）取消預訂，將收取 ${charge}% 的取消費用。`,
        hans: `若在行程开始前 ${timeStr} 内（含）取消预订，将收取 ${charge}% 的取消费用。`,
        en: `We will charge a cancellation fee of ${charge}% if booking is cancelled ${timeStr} or less before event`,
      });
      return `<li>${escapeHtmlText(line)}</li>`;
    }).filter(Boolean);

    if (!rules.length) return '';
    return `<ul>${rules.join('')}</ul>`;
  }

  function prepareActivityDescription(description, sourceHtml) {
    const raw = String(description || '').trim();
    if (!raw) return { html: '', isRich: false, textLen: 0 };
    const hasTags = /<[a-z][\s\S]*?>/i.test(raw);
    const html = sanitizeVendorHtml(
      hasTags ? raw : prepareVendorHtml(raw, sourceHtml),
    );
    const textLen = hasTags
      ? html.replace(/<[^>]*>/g, '').length
      : raw.length;
    return { html, isRich: true, textLen };
  }

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
    convertFromUsd, convertToUsd, amountToUsd, looksLikeMislabeledIskAsUsd,
    formatDisplayPrice, formatDisplayPriceCompact, formatTotalDisplay, tripTotalUsd,
    fakePhoto, PhotoSparkles, proxyImageUrl, prefetchProxiedImage,
    isMobileViewport, useMobileViewport, imageProfileForViewport, useResponsiveImageProfile,
    aboveFoldImagePriorityCount, prefersReducedData,
    CATEGORIES, ROUTES, FACETS, formatCatalogCount, formatToursToolbarSummary, formatToursPageTitle,
    readUrlState, buildUrlForState, currentUrlString, URL_PATH_BY_SCREEN,
    TRIP_HUBS, HERO_POPULAR_CHIPS, TRIP_PAX_LIMITS, defaultTripSearch, normalizeTripSearch, loadTripSearch, saveTripSearch,
    isWishlisted, toggleWishlist, subscribeWishlist,
    showToast,
    sanitizeVendorHtml, vendorHtmlIsMeaningful,
    plainTextToParagraphHtml, plainTextToStructuredHtml, prepareVendorHtml,
    prepareActivityDescription, alignStringListToSource,
    buildLocalizedCancellationPolicyHtml, shouldUseStructuredCancellationPolicy,
    facetsFromTripSearch, formatTripSearchDateRange, formatTripSearchPax, formatTripSearchSummary,
    todayIsoDate, isoDateOffset,
    getSupplierOptions, activityVendor, vendorIdKey, vendorIdsMatch, LANGS, pick, makeT, applyHtmlLang,
    brandZhName, brandFullTitle, brandLogoSrc, brandLogoAlt, applyBrandDocument,
    SITE_THEMES, HERO_THEMES, ThemePicker,
    getInitialSiteTheme, setSiteThemeById, applySiteTheme,
    pickSiteThemeForSession, pickHeroThemeForSession, getOrPickHeroTheme,
  };
})();
