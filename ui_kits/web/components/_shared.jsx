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
    return conn.saveData === true || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  }

  function imageProfileForViewport() {
    if (isMobileViewport() || prefersReducedData()) {
      return {
        card: { w: 400, q: 76 },
        heroFast: { w: 400, q: 76 },
        heroHi: null,
        gallery: { w: 112, q: 72 },
        prefetch: { w: 400, q: 76 },
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

  // Lucide-icon wrapper. Renders <i data-lucide="name"></i> and calls createIcons
  // on every render so dynamic icons attach correctly.
  function Icon({ name, size = 18, color, strokeWidth = 1.75, style, className }) {
    const ref = useRef(null);
    useEffect(() => {
      if (window.lucide && ref.current) {
        ref.current.innerHTML = '';
        const el = document.createElement('i');
        el.setAttribute('data-lucide', name);
        ref.current.appendChild(el);
        window.lucide.createIcons({
          nameAttr: 'data-lucide',
          attrs: { width: size, height: size, 'stroke-width': strokeWidth, ...(color ? { color } : {}) },
        });
      }
    }, [name, size, color, strokeWidth]);
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
    { code: 'USD', symbol: '$',   name: { hant: '美元',       hans: '美元',       en: 'US dollar' } },
    { code: 'TWD', symbol: 'NT$', name: { hant: '新台幣',     hans: '新台币',     en: 'Taiwan dollar' } },
    { code: 'CNY', symbol: '¥',   name: { hant: '人民幣',     hans: '人民币',     en: 'Chinese yuan' } },
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

  function formatTotalDisplay(totalUsd, displayCurrency, rates) {
    return formatDisplayPrice(totalUsd, displayCurrency, rates);
  }

  function tripTotalUsd(trip) {
    return (trip || []).reduce((s, t) => s + (Number(t.priceUsd ?? t.price) || 0), 0);
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
  const CATEGORIES = [
    { id: 'self-drive', icon: 'car-front',     label: { hant: '自駕',   hans: '自驾',   en: 'Self-drive' } },
    { id: 'aurora',     icon: 'sparkles',      label: { hant: '極光',   hans: '极光',   en: 'Northern Lights' } },
    { id: 'glacier',    icon: 'mountain-snow', label: { hant: '冰川',   hans: '冰川',   en: 'Glacier' } },
    { id: 'hotspring',  icon: 'droplets',      label: { hant: '溫泉',   hans: '温泉',   en: 'Hot spring' } },
    { id: 'day',        icon: 'sun',           label: { hant: '一日遊', hans: '一日游', en: 'Day trip' } },
    { id: 'premium',    icon: 'crown',         label: { hant: '頂級',   hans: '顶级',   en: 'Premium' } },
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
    if (!href || href === url) return;
    if (typeof document === 'undefined') return;
    if (document.querySelector(`link[rel="preload"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    document.head.appendChild(link);
  }

  /** Supplier filter options derived from live Bókun activities. */
  function getSupplierOptions(lang, activities = []) {
    const all = { id: 'all', label: pick(lang, { hant: '全部供應商', hans: '全部供应商', en: 'All suppliers' }) };
    const byId = new Map();
    (activities || []).forEach((vm) => {
      const v = vm.raw && vm.raw.vendor;
      if (!v || v.id == null) return;
      if (!byId.has(v.id)) byId.set(v.id, { id: v.id, label: v.title || vm.supplier || String(v.id) });
    });
    const vendors = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
    return [all, ...vendors];
  }

  window.AuralisUI = {
    Icon, formatPrice, singleCurrency, formatTotalAmount,
    CURRENCIES, DISPLAY_CURRENCIES, currencyLabel, FX_BASE, defaultCurrencyForLang,
    convertFromUsd, formatDisplayPrice, formatTotalDisplay, tripTotalUsd,
    fakePhoto, PhotoSparkles, proxyImageUrl, prefetchProxiedImage,
    isMobileViewport, imageProfileForViewport, useResponsiveImageProfile,
    CATEGORIES, formatCatalogCount, getSupplierOptions, LANGS, pick, makeT, applyHtmlLang,
  };
})();
