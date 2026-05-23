/* Shared utilities & helpers for the Auralis UI kit
   Exposes window.AuralisUI = { Icon, formatPrice, fakePhoto, ... } */

(function () {
  const { useEffect, useRef } = React;

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

  /** Format amount using Bókun ISO currency (ISK, EUR, USD, …). */
  function formatPrice(n, currency) {
    const amount = Number(n);
    if (!Number.isFinite(amount)) return '—';
    const code = (currency || 'ISK').toUpperCase();
    const noDecimals = ['ISK', 'JPY', 'KRW'].includes(code);
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
    { code: 'USD', label: 'USD $' },
    { code: 'TWD', label: 'TWD NT$' },
    { code: 'CNY', label: 'CNY ¥' },
    { code: 'HKD', label: 'HKD HK$' },
    { code: 'SGD', label: 'SGD S$' },
    { code: 'MYR', label: 'MYR RM' },
    { code: 'MOP', label: 'MOP MOP$' },
    { code: 'CAD', label: 'CAD $' },
    { code: 'AUD', label: 'AUD $' },
  ];

  const FX_BASE = 'USD';

  function defaultCurrencyForLang(lang) {
    return ({ hant: 'TWD', hans: 'CNY', en: 'USD' }[lang] || 'USD');
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
    const zeroDec = ['TWD', 'CNY', 'HKD', 'JPY', 'KRW', 'ISK', 'MOP', 'MYR'].includes(c);
    return zeroDec ? Math.round(amount) : Math.round(amount * 100) / 100;
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
  // i18n helper.
  // `lang` is one of: 'hant' (繁體) | 'hans' (简体) | 'en'.
  // Pass an object { hant, hans, en } to pick(); if a translation is
  // missing we fall back hant→hans→en, which is the safest order for
  // this brand (Taiwan-first content).
  // ------------------------------------------------------------------
  const LANGS = [
    { id: 'hant', label: '繁',  htmlLang: 'zh-Hant' },
    { id: 'hans', label: '简',  htmlLang: 'zh-Hans' },
    { id: 'en',   label: 'EN', htmlLang: 'en' },
  ];

  function pick(lang, options) {
    if (!options) return '';
    if (options[lang] != null) return options[lang];
    if (options.hant != null) return options.hant;
    if (options.hans != null) return options.hans;
    return options.en || '';
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
    { id: 'self-drive', icon: 'car-front',     label: { hant: '自駕 · Self-drive',       hans: '自驾 · Self-drive',       en: 'Self-drive' } },
    { id: 'aurora',     icon: 'sparkles',      label: { hant: '極光 · Northern Lights',  hans: '极光 · Northern Lights',  en: 'Northern Lights' } },
    { id: 'glacier',    icon: 'mountain-snow', label: { hant: '冰川 · Glacier',          hans: '冰川 · Glacier',          en: 'Glacier' } },
    { id: 'hotspring',  icon: 'droplets',      label: { hant: '溫泉 · Hot spring',       hans: '温泉 · Hot spring',       en: 'Hot spring' } },
    { id: 'day',        icon: 'sun',           label: { hant: '一日遊 · Day trip',       hans: '一日游 · Day trip',       en: 'Day trip' } },
    { id: 'premium',    icon: 'crown',         label: { hant: '頂級 · Premium',          hans: '顶级 · Premium',          en: 'Premium' } },
  ];

  // -------------------------------------------------------------------
  // Supplier options — derived from the live Bókun vendor list. We expose
  // this as a function rather than a constant so the labels follow the
  // current language, and so the list automatically picks up new vendors
  // as Bókun adds them.
  // -------------------------------------------------------------------
  function getSupplierOptions(lang) {
    const all = { id: 'all', label: pick(lang, { hant: '全部 · All suppliers', hans: '全部 · All suppliers', en: 'All suppliers' }) };
    const vendors = window.AuralisData && window.AuralisData.MOCK_BOKUN_VENDORS;
    if (!vendors) return [all];
    return [all, ...Object.values(vendors).map(v => ({ id: v.id, label: v.title }))];
  }

  window.AuralisUI = {
    Icon, formatPrice, singleCurrency, formatTotalAmount,
    CURRENCIES, FX_BASE, defaultCurrencyForLang,
    convertFromUsd, formatDisplayPrice, formatTotalDisplay, tripTotalUsd,
    fakePhoto, PhotoSparkles, CATEGORIES, getSupplierOptions, LANGS, pick, makeT, applyHtmlLang,
  };
})();
