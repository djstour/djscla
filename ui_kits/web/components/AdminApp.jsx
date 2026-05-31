/* eslint-disable no-undef */
/* global React, ReactDOM */

  // DJS Tour · Admin Console — Phase 5 (translations + health).
//
// Self-contained app: does NOT import the public AuralisUI/AuralisData stacks
// so we can iterate independently and keep the admin bundle lean. Auth is a
// shared-secret stored in sessionStorage; rotate by changing ADMIN_PASSWORD
// on Vercel.

(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;

  const STORAGE_KEY = 'auralis.admin.token';
  const LANG_STORAGE_KEY = 'auralis.lang';
  const CURRENCY_STORAGE_KEY = 'auralis.currency';

  function getAuralisUI() {
    return window.AuralisUI || null;
  }

  function getAdminCopy() {
    return window.AuralisAdminCopy || null;
  }

  function createAdminT(lang) {
    const AC = getAdminCopy();
    if (AC && AC.createT) return AC.createT(lang);
    return (key) => key;
  }

  function readLang() {
    const UI = getAuralisUI();
    const langs = UI && UI.LANGS ? UI.LANGS : [
      { id: 'hant' }, { id: 'hans' }, { id: 'en' },
    ];
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) || '';
      return langs.find((l) => l.id === saved) ? saved : 'hant';
    } catch {
      return 'hant';
    }
  }

  function readCurrency(lang) {
    const UI = getAuralisUI();
    try {
      const saved = localStorage.getItem(CURRENCY_STORAGE_KEY) || '';
      const codes = UI && UI.DISPLAY_CURRENCIES
        ? UI.DISPLAY_CURRENCIES.map((c) => c.code)
        : ['TWD', 'CNY', 'USD'];
      if (codes.includes(saved)) return saved;
    } catch { /* noop */ }
    if (UI && UI.defaultCurrencyForLang) return UI.defaultCurrencyForLang(lang);
    return lang === 'hans' ? 'CNY' : lang === 'en' ? 'USD' : 'TWD';
  }

  function localeForLang(lang) {
    if (lang === 'hans') return 'zh-CN';
    if (lang === 'en') return 'en-GB';
    return 'zh-TW';
  }

  function useAdminPreferences() {
    const UI = getAuralisUI();
    const [lang, setLang] = useState(readLang);
    const [displayCurrency, setDisplayCurrency] = useState(() => readCurrency(readLang()));
    const [siteThemeId, setSiteThemeId] = useState(() => {
      if (UI && UI.getInitialSiteTheme) return UI.getInitialSiteTheme().id;
      return 'aurora';
    });
    const [fxRates, setFxRates] = useState({ USD: 1 });

    const t = useMemo(() => createAdminT(lang), [lang]);

    useEffect(() => {
      if (UI && UI.applyHtmlLang) UI.applyHtmlLang(lang);
      try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* noop */ }
      const AC = getAdminCopy();
      if (typeof document !== 'undefined' && AC && AC.pick) {
        document.title = AC.pick(lang, 'brandTitle') || document.title;
        if (document.body) {
          document.body.dataset.screenLabel = AC.pick(lang, 'brandTitle') || '';
        }
      }
    }, [lang, UI]);

    useEffect(() => {
      try { localStorage.setItem(CURRENCY_STORAGE_KEY, displayCurrency); } catch { /* noop */ }
    }, [displayCurrency]);

    useEffect(() => {
      if (!UI || !UI.setSiteThemeById) return;
      UI.setSiteThemeById(siteThemeId);
    }, [siteThemeId, UI]);

    useEffect(() => {
      fetch('/api/fx/rates')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.rates) setFxRates({ USD: 1, ...data.rates });
        })
        .catch(() => { /* optional for admin price preview */ });
    }, []);

    const handleLangChange = useCallback((nextLang) => {
      setLang(nextLang);
      if (UI && UI.defaultCurrencyForLang) {
        setDisplayCurrency(UI.defaultCurrencyForLang(nextLang));
      } else {
        setDisplayCurrency(readCurrency(nextLang));
      }
    }, [UI]);

    const handleThemeChange = useCallback((themeId) => {
      if (UI && UI.setSiteThemeById) UI.setSiteThemeById(themeId);
      setSiteThemeId(themeId);
    }, [UI]);

    const prefToolbar = UI && UI.PrefToolbar ? (
      <UI.PrefToolbar
        lang={lang}
        onLangChange={handleLangChange}
        displayCurrency={displayCurrency}
        onCurrencyChange={setDisplayCurrency}
        siteThemeId={siteThemeId}
        onSiteThemeChange={handleThemeChange}
        className="pref-toolbar--admin"
      />
    ) : null;

    return {
      lang,
      t,
      displayCurrency,
      siteThemeId,
      fxRates,
      prefToolbar,
      pick: UI && UI.pick ? (opts) => UI.pick(lang, opts) : (opts) => opts[lang] || opts.hant || '',
      formatDisplayPrice: (amountUsd) => {
        if (UI && UI.formatDisplayPrice) {
          return UI.formatDisplayPrice(amountUsd, displayCurrency, fxRates);
        }
        return formatPrice(amountUsd, displayCurrency);
      },
    };
  }

  function readToken() {
    try {
      const fromLocal = window.localStorage.getItem(STORAGE_KEY) || '';
      if (fromLocal) return fromLocal;
      const fromSession = window.sessionStorage.getItem(STORAGE_KEY) || '';
      if (fromSession) {
        window.localStorage.setItem(STORAGE_KEY, fromSession);
        return fromSession;
      }
      return '';
    } catch {
      return '';
    }
  }

  function writeToken(token) {
    try {
      if (token) {
        window.localStorage.setItem(STORAGE_KEY, token);
        window.sessionStorage.setItem(STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch { /* noop */ }
  }

  function ensureAdminTokenShared() {
    const token = readToken();
    if (token) writeToken(token);
    return token;
  }

  function openTranslationPreview(activityId, lang) {
    if (!ensureAdminTokenShared()) return;
    const url = `/tours/${encodeURIComponent(activityId)}?lang=${encodeURIComponent(lang)}&translationPreview=1`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function adminFetch(path, token, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data && data.code;
      err.data = data;
      throw err;
    }
    return data;
  }

  function formatNumber(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    return Number(n).toLocaleString();
  }

  function formatDateTime(iso, lang) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(localeForLang(lang || 'hant'), { hour12: false });
    } catch {
      return iso;
    }
  }

  function formatDurationMs(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    const n = Number(ms);
    if (n < 1000) return `${Math.round(n)} ms`;
    if (n < 60000) return `${(n / 1000).toFixed(1)} s`;
    const m = Math.floor(n / 60000);
    const s = Math.round((n % 60000) / 1000);
    return `${m}m ${s}s`;
  }

  const TRANSLATION_BATCH_STEPS = [
    'Scanning translation queue in Supabase…',
    'Loading activity payloads from catalog…',
    'Checking which fields are missing or stale…',
    'Calling OpenAI — Traditional Chinese (hant)…',
    'Calling OpenAI — Simplified Chinese (hans)…',
    'Translating titles, summaries, and descriptions…',
    'Translating itinerary stop names…',
    'Writing translation overlays to Supabase…',
    'Finishing batch — large batches can take several minutes…',
  ];

  const TRANSLATION_ROW_STEPS = [
    'Loading activity from catalog…',
    'Translating fields via OpenAI…',
    'Saving to Supabase…',
  ];

  function timeAgo(iso, lang) {
    const AC = getAdminCopy();
    if (AC && AC.timeAgo) return AC.timeAgo(iso, lang || 'hant');
    if (!iso) return '';
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '';
    const diff = Date.now() - ts;
    if (diff < 0) return '';
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  function formatPrice(value, currency) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 0,
      }).format(Number(value));
    } catch {
      return `${currency || 'USD'} ${Number(value).toFixed(0)}`;
    }
  }

  // ---------------- Login ----------------
  function LoginScreen({ onLoggedIn, prefToolbar, t }) {
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const onSubmit = async (e) => {
      e.preventDefault();
      if (!password) return;
      setSubmitting(true);
      setError('');
      try {
        await adminFetch('/api/admin/login', password, {
          method: 'POST',
          body: { password },
        });
        writeToken(password);
        onLoggedIn(password);
      } catch (err) {
        if (err.code === 'ADMIN_NOT_CONFIGURED') {
          setError(t('loginDisabled'));
        } else if (err.status === 401) {
          setError(t('loginIncorrect'));
        } else {
          setError(err.message || t('loginFailed'));
        }
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="admin-login">
        {prefToolbar ? (
          <div className="admin-login__prefs">{prefToolbar}</div>
        ) : null}
        <form className="admin-login__card" onSubmit={onSubmit}>
          <h1 className="admin-login__title">{t('brandTitle')}</h1>
          <p className="admin-login__sub">{t('loginSub')}</p>

          {error ? <div className="admin-login__error">{error}</div> : null}

          <div className="admin-login__field">
            <label htmlFor="admin-password">{t('password')}</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button type="submit" className="admin-btn" disabled={submitting || !password}>
            {submitting ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </div>
    );
  }

  // ---------------- Sidebar ----------------
  const ADMIN_NAV_ITEMS = [
    { id: 'overview', labelKey: 'navOverview' },
    { id: 'vendors', labelKey: 'navVendors', countKey: 'vendors' },
    { id: 'activities', labelKey: 'navActivities', countKey: 'activities' },
    { id: 'content', labelKey: 'navContent' },
    { id: 'marketing', labelKey: 'navMarketing', countKey: 'collections' },
    { id: 'inquiries', labelKey: 'navInquiries', countKey: 'inquiries' },
    { id: 'translations', labelKey: 'navTranslations', countKey: 'translationPending' },
    { id: 'health', labelKey: 'navHealth' },
  ];

  function buildNavItems(t, counts) {
    return ADMIN_NAV_ITEMS.map((it) => ({
      id: it.id,
      label: t(it.labelKey),
      badge: it.countKey != null ? counts[it.countKey] : null,
    }));
  }

  function Sidebar({ tab, setTab, counts, onLogout, prefToolbar, t, onNavSelect, onNavClose }) {
    const items = buildNavItems(t, counts);
    const pickTab = (id) => {
      setTab(id);
      if (onNavSelect) onNavSelect();
    };
    return (
      <aside className="admin-sidebar" aria-label={t('brandShort')}>
        <div className="admin-sidebar__head">
          <div className="admin-brand">
            <span className="admin-brand__dot" />
            <span>{t('brandShort')}</span>
          </div>
          {onNavClose ? (
            <button
              type="button"
              className="admin-sidebar__close"
              onClick={onNavClose}
              aria-label={t('navClose')}
            >
              ×
            </button>
          ) : null}
        </div>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`admin-nav-item${tab === it.id ? ' is-active' : ''}`}
            onClick={() => pickTab(it.id)}
          >
            <span>{it.label}</span>
            {it.badge != null ? <span className="admin-nav-badge">{formatNumber(it.badge)}</span> : null}
          </button>
        ))}
        <div className="admin-nav-spacer" />
        {prefToolbar ? (
          <div className="admin-sidebar__prefs">{prefToolbar}</div>
        ) : null}
        <div className="admin-sidebar__footer">
          {t('phaseFooter')}<br />
          <button type="button" onClick={onLogout}>{t('signOut')}</button>
        </div>
      </aside>
    );
  }

  function AdminJobRunning({
    title,
    step,
    elapsedSec,
    hint,
    progressPct = null,
  }) {
    const indeterminate = progressPct == null;
    return (
      <div
        className="admin-sync-running"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="admin-sync-running__head">
          <span className="admin-sync-spinner admin-sync-spinner--lg" aria-hidden="true" />
          <div>
            <strong>{title}</strong>
            <p className="admin-sync-running__step" key={step}>{step}</p>
          </div>
        </div>
        <div
          className="admin-sync-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : progressPct}
          aria-label={indeterminate ? 'Working' : `Estimated progress ${progressPct}%`}
        >
          {indeterminate ? (
            <div className="admin-sync-progress__bar" />
          ) : (
            <div
              className="admin-sync-progress__bar admin-sync-progress__bar--fill"
              style={{ width: `${progressPct}%` }}
            />
          )}
        </div>
        <p className="admin-sync-running__hint">{hint}</p>
      </div>
    );
  }

  function CatalogSyncRunning({ elapsedSec, stepIndex, t, lang }) {
    const AC = getAdminCopy();
    const steps = AC && AC.catalogSteps ? AC.catalogSteps(lang || 'hant') : [];
    const step = steps.length
      ? steps[stepIndex % steps.length]
      : t('catalogStep0');
    return (
      <AdminJobRunning
        title={t('catalogSyncProgress')}
        step={step}
        elapsedSec={elapsedSec}
        hint={t('catalogSyncHint', { s: elapsedSec })}
      />
    );
  }

  function TranslationRowRunning({ activityId, elapsedSec, stepIndex, t }) {
    return (
      <AdminJobRunning
        title={t('retranslateActivityProgress', { id: activityId })}
        step={TRANSLATION_ROW_STEPS[stepIndex % TRANSLATION_ROW_STEPS.length]}
        elapsedSec={elapsedSec}
        progressPct={Math.min(90, Math.round((elapsedSec / 75) * 100))}
        hint={t('retranslateActivityProgressHint', { s: elapsedSec })}
      />
    );
  }

  function TranslationBatchRunning({
    elapsedSec,
    stepIndex,
    batchSize,
    queueDepth,
    progressPct,
    estimatedSec,
    t,
  }) {
    const step = TRANSLATION_BATCH_STEPS[stepIndex % TRANSLATION_BATCH_STEPS.length];
    const estMin = Math.max(1, Math.ceil(estimatedSec / 60));
    return (
      <AdminJobRunning
        title={t('translationBatchProgress')}
        step={step}
        elapsedSec={elapsedSec}
        progressPct={progressPct}
        hint={(
          <>
            Elapsed {elapsedSec}s · up to {formatNumber(batchSize)} activities this run
            {queueDepth != null ? ` · ${formatNumber(queueDepth)} in queue` : ''}
            {' · '}
            typical {estMin}–{estMin + 2} min · keep this tab open (server limit ~5 min)
          </>
        )}
      />
    );
  }

  function CatalogSyncResult({ result, options, t }) {
    const counts = result.counts || {};
    const timings = result.timings || {};
    const totalMs = timings.totalMs || 1;
    const fetchPct = timings.fetchMs ? Math.round((timings.fetchMs / totalMs) * 100) : 0;
    const writePct = timings.writeMs ? Math.round((timings.writeMs / totalMs) * 100) : 0;

    const links = counts.vendorActivityLinks;
    const linkTotal = links && typeof links === 'object' ? links.total : links;
    const linkAdded = links && typeof links === 'object' ? links.added : 0;
    const linkRemoved = links && typeof links === 'object' ? links.removed : 0;

    const summaryChips = [];
    if (counts.upserted > 0) {
      summaryChips.push({ text: t('syncChipUpserted', { n: formatNumber(counts.upserted) }), tone: 'accent' });
    }
    if (counts.unchanged > 0) {
      summaryChips.push({ text: t('syncChipUnchanged', { n: formatNumber(counts.unchanged) }), tone: 'muted' });
    }
    if (counts.deactivated > 0) {
      summaryChips.push({ text: t('syncChipDeactivated', { n: formatNumber(counts.deactivated) }), tone: 'warn' });
    }
    if ((counts.componentsFetchFailed || 0) > 0) {
      summaryChips.push({
        text: t('syncChipFetchFailed', { n: formatNumber(counts.componentsFetchFailed) }),
        tone: 'warn',
      });
    }
    if ((counts.imageSynced || 0) > 0) {
      summaryChips.push({ text: t('syncChipImages', { n: formatNumber(counts.imageSynced) }), tone: 'accent' });
    }
    if (counts.detailTruncated) {
      summaryChips.push({ text: t('syncChipDetailTruncated'), tone: 'warn' });
    }
    if (counts.detailErrors > 0) {
      summaryChips.push({
        text: t('syncChipDetailErr', { n: formatNumber(counts.detailErrors) }),
        tone: 'warn',
      });
    }
    if ((counts.detailPriceWarnings || 0) > 0) {
      summaryChips.push({
        text: t('syncChipPriceWarn', { n: formatNumber(counts.detailPriceWarnings) }),
        tone: 'warn',
      });
    }
    if ((counts.detailPickupHosted || 0) > 0) {
      summaryChips.push({
        text: t('syncChipPickupHosted', { n: formatNumber(counts.detailPickupHosted) }),
        tone: 'neutral',
      });
    }
    if (linkAdded > 0 || linkRemoved > 0) {
      summaryChips.push({
        text: t('syncChipVendorLinks', { add: formatNumber(linkAdded), rem: formatNumber(linkRemoved) }),
        tone: 'neutral',
      });
    }
    if (!summaryChips.length) {
      summaryChips.push({ text: t('syncChipUpToDate'), tone: 'muted' });
    }

    const statGroups = [
      {
        id: 'channel',
        title: t('syncGroupChannel'),
        stats: [
          { label: t('syncUniqueChannel'), value: counts.uniqueInChannel, tone: 'neutral' },
          { label: t('syncContractProducts'), value: counts.contractTotal, tone: 'neutral' },
          {
            label: t('syncComponentsFailed'),
            value: counts.componentsFetchFailed || 0,
            tone: (counts.componentsFetchFailed || 0) > 0 ? 'warn' : 'muted',
          },
          { label: t('navVendors'), value: counts.vendors, tone: 'neutral' },
        ],
      },
      {
        id: 'writes',
        title: t('syncGroupWrites'),
        stats: [
          { label: t('syncUpserted'), value: counts.upserted, tone: counts.upserted > 0 ? 'accent' : 'muted' },
          { label: t('syncUnchanged'), value: counts.unchanged, tone: 'muted' },
        ],
      },
      {
        id: 'maintenance',
        title: t('syncGroupMaintenance'),
        stats: [
          {
            label: t('syncDeactivated'),
            value: counts.deactivated,
            tone: counts.deactivated > 0 ? 'warn' : 'muted',
          },
          {
            label: t('syncVendorLinks'),
            value: linkTotal,
            tone: 'neutral',
            hint: linkAdded || linkRemoved
              ? t('syncLinkHint', { add: formatNumber(linkAdded), rem: formatNumber(linkRemoved) })
              : null,
          },
        ],
      },
    ];

    if (options.syncImages || (counts.imageSynced != null && counts.imageSynced > 0)) {
      statGroups[1].stats.push({
        label: t('syncImagesMirrored'),
        value: counts.imageSynced || 0,
        tone: counts.imageSynced > 0 ? 'accent' : 'muted',
      });
    }

    if (options.forceDetail || counts.detailSynced > 0 || (counts.detailPending || 0) > 0) {
      const detailProgress = result.detailProgress;
      const runSynced = counts.detailSynced || 0;
      const runErrors = counts.detailErrors || 0;
      const detailQueued = counts.detailQueued ?? runSynced;
      const runQueueTotal = counts.detailNeedingTotal ?? counts.detailPending ?? 0;

      if (detailProgress && detailProgress.total > 0) {
        const { complete, total, missing } = detailProgress;
        const detailLabel = runErrors > 0
          ? t('syncDetailCatalogErr', { n: runErrors })
          : t('syncDetailCatalog');
        const allComplete = missing === 0;
        statGroups[1].stats.push({
          label: detailLabel,
          value: `${formatNumber(complete)} / ${formatNumber(total)}`,
          tone: allComplete ? 'accent' : (runErrors > 0 ? 'warn' : 'neutral'),
          raw: true,
          hint: allComplete
            ? t('syncDetailCatalogComplete')
            : (runErrors > 0
              ? t('syncDetailCatalogHintErr', { run: runSynced, errors: runErrors, missing })
              : t('syncDetailCatalogHint', { run: runSynced, missing })),
        });
        if (runSynced > 0 || runErrors > 0) {
          statGroups[1].stats.push({
            label: t('syncDetailThisRun'),
            value: `${formatNumber(runSynced)} / ${formatNumber(detailQueued)}`,
            tone: runErrors > 0 ? 'warn' : 'muted',
            raw: true,
            hint: runQueueTotal > 0
              ? t('syncDetailRunQueueHint', {
                queued: detailQueued,
                total: runQueueTotal,
              })
              : null,
          });
        }
      } else {
        const detailLabel = runErrors > 0
          ? t('syncDetailSyncedErr', { n: runErrors })
          : t('syncDetailSynced');
        const detailTotal = runQueueTotal;
        statGroups[1].stats.push({
          label: detailLabel,
          value: `${formatNumber(runSynced)} / ${formatNumber(detailTotal)}`,
          tone: runErrors > 0 ? 'warn' : 'neutral',
          raw: true,
          hint: (counts.detailPending || 0) > 0
            ? t('syncDetailPendingHint', {
              pending: counts.detailPending,
              queued: detailQueued,
              total: detailTotal,
            })
            : null,
        });
      }
      if ((counts.detailPriceWarnings || 0) > 0) {
        statGroups[1].stats.push({
          label: t('syncDetailPriceWarnings'),
          value: counts.detailPriceWarnings,
          tone: 'warn',
        });
      }
      if ((counts.detailPickupHosted || 0) > 0) {
        statGroups[1].stats.push({
          label: t('syncDetailPickupHosted'),
          value: counts.detailPickupHosted,
          tone: 'neutral',
        });
      }
    }

    return (
      <div className="admin-sync-result">
        <div className="admin-sync-result__header">
          <span className="admin-sync-result__icon" aria-hidden="true">✓</span>
          <div>
            <strong>{t('syncComplete')}</strong>
            <span className="admin-sync-result__meta">
              {t('syncVendorsFinished', {
                n: formatNumber(counts.vendors),
                dur: formatDurationMs(timings.totalMs),
              })}
            </span>
          </div>
        </div>

        <div className="admin-sync-summary" role="status">
          <div className="admin-sync-summary__label">{t('syncThisRun')}</div>
          <div className="admin-sync-summary__chips">
            {summaryChips.map((chip) => (
              <span
                key={chip.text}
                className={`admin-sync-summary__chip admin-sync-summary__chip--${chip.tone}`}
              >
                {chip.text}
              </span>
            ))}
          </div>
        </div>

        <div className="admin-sync-stat-groups">
          {statGroups.map((group) => (
            <section key={group.id} className="admin-sync-stat-group">
              <h3 className="admin-sync-stat-group__title">{group.title}</h3>
              <div className="admin-sync-stat-group__grid">
                {group.stats.map((s) => (
                  <div key={s.label} className={`admin-sync-stat admin-sync-stat--${s.tone}`}>
                    <span className="admin-sync-stat__value">
                      {s.raw ? s.value : formatNumber(s.value)}
                    </span>
                    <span className="admin-sync-stat__label">{s.label}</span>
                    {s.hint ? <span className="admin-sync-stat__hint">{s.hint}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {timings.fetchMs != null ? (
          <div className="admin-sync-result__timing">
            <div className="admin-sync-timing-row">
              <span>{t('syncTimingFetch')}</span>
              <span>{formatDurationMs(timings.fetchMs)}</span>
            </div>
            <div className="admin-sync-timing-bar" aria-hidden="true">
              <span className="admin-sync-timing-bar__fetch" style={{ width: `${fetchPct}%` }} />
              <span className="admin-sync-timing-bar__write" style={{ width: `${writePct}%` }} />
            </div>
            <div className="admin-sync-timing-row">
              <span>{t('syncTimingWrite')}</span>
              <span>{formatDurationMs(timings.writeMs)}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function CatalogCountExplainer({ activities, totals, vendors, t }) {
    const activeVendors = (vendors || []).filter((v) => v.isActive);
    const contract = totals?.contractTotal || 0;
    const unique = totals?.uniqueTotal || 0;
    const active = activities?.active || 0;
    const inactive = activities?.inactive || 0;
    const total = activities?.total || 0;

    return (
      <aside className="admin-callout admin-callout--info" aria-label={t('explainerTitle')}>
        <strong>{t('explainerTitle')}</strong>
        <p>
          {t('explainerBody', {
            contract: formatNumber(contract),
            unique: formatNumber(unique),
            active: formatNumber(active),
            inactive: formatNumber(inactive),
            total: formatNumber(total),
          })}
        </p>
        <p className="admin-callout__foot">
          {t('explainerFoot', {
            active: formatNumber(activeVendors.length),
            hidden: (vendors || []).length > activeVendors.length
              ? t('explainerHidden', { n: formatNumber(vendors.length - activeVendors.length) })
              : '',
          })}
        </p>
      </aside>
    );
  }

  // ---------------- Overview ----------------
  function OverviewPage({ overview, token, onRefresh, lang, t }) {
    const [syncing, setSyncing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState('');
    const [syncError, setSyncError] = useState('');
    const [syncResult, setSyncResult] = useState(null);
    const [syncElapsed, setSyncElapsed] = useState(0);
    const [syncStep, setSyncStep] = useState(0);
    const syncStartedRef = useRef(0);
    const [syncOpts, setSyncOpts] = useState({
      deactivateMissing: true,
      forceDetail: false,
      detailOnly: false,
      syncImages: false,
      maxDetailPerRun: 25,
    });

    useEffect(() => {
      if (!syncing) return undefined;
      syncStartedRef.current = Date.now();
      setSyncElapsed(0);
      setSyncStep(0);
      const tick = window.setInterval(() => {
        const sec = Math.floor((Date.now() - syncStartedRef.current) / 1000);
        setSyncElapsed(sec);
        setSyncStep(Math.floor(sec / 7));
      }, 500);
      return () => window.clearInterval(tick);
    }, [syncing]);

    const runRefreshStats = async () => {
      if (refreshing || typeof onRefresh !== 'function') return;
      setRefreshing(true);
      setRefreshError('');
      try {
        await onRefresh();
      } catch (err) {
        setRefreshError(err.message || t('refreshStatsFailed'));
      } finally {
        setRefreshing(false);
      }
    };

    const runCatalogSync = async () => {
      setSyncing(true);
      setSyncError('');
      setSyncResult(null);
      try {
        const res = await adminFetch('/api/admin/sync', token, {
          method: 'POST',
          body: syncOpts,
        });
        setSyncResult(res);
        await onRefresh();
      } catch (err) {
        setSyncError(err.message || t('syncFailed'));
      } finally {
        setSyncing(false);
      }
    };

    if (!overview) return <div className="admin-empty">{t('loading')}</div>;

    const { activities, vendors, totals, lastSyncedAt, inquiries, generatedAt } = overview;

    return (
      <div>
        <h1 className="admin-page-title">{t('overviewTitle')}</h1>
        <p className="admin-page-sub">
          {t('overviewSub')}<strong>{formatDateTime(lastSyncedAt, lang)}</strong>
          {lastSyncedAt ? <span> · {timeAgo(lastSyncedAt, lang)}</span> : null}
          {generatedAt ? (
            <span>
              {' · '}
              {t('statsRefreshedAt')}{' '}
              <strong>{formatDateTime(generatedAt, lang)}</strong>
            </span>
          ) : null}
        </p>

        <section className={`admin-sync-panel${syncing ? ' admin-sync-panel--busy' : ''}`}>
          <h2>{t('catalogSyncTitle')}</h2>
          <p>{t('catalogSyncDesc')}</p>
          <div className="admin-sync-options">
            <label>
              <input
                type="checkbox"
                checked={syncOpts.deactivateMissing}
                onChange={(e) => setSyncOpts((o) => ({ ...o, deactivateMissing: e.target.checked }))}
                disabled={syncing}
              />
              {t('optDeactivateMissing')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={syncOpts.forceDetail}
                onChange={(e) => setSyncOpts((o) => ({ ...o, forceDetail: e.target.checked }))}
                disabled={syncing}
              />
              {t('optForceDetail')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={syncOpts.detailOnly}
                onChange={(e) => setSyncOpts((o) => ({ ...o, detailOnly: e.target.checked }))}
                disabled={syncing}
              />
              {t('optDetailOnly')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={syncOpts.syncImages}
                onChange={(e) => setSyncOpts((o) => ({ ...o, syncImages: e.target.checked }))}
                disabled={syncing}
              />
              {t('optSyncImages')}
            </label>
            <label>
              {t('optDetailCap')}
              <input
                type="number"
                min={1}
                max={50}
                value={syncOpts.maxDetailPerRun}
                onChange={(e) => setSyncOpts((o) => ({
                  ...o,
                  maxDetailPerRun: Math.min(50, Math.max(1, Number(e.target.value) || 25)),
                }))}
                disabled={syncing}
              />
            </label>
          </div>
          <div className="admin-sync-actions">
            <button
              type="button"
              className={`admin-btn${syncing ? ' admin-btn--loading' : ''}`}
              onClick={runCatalogSync}
              disabled={syncing}
            >
              {syncing ? (
                <>
                  <span className="admin-sync-spinner" aria-hidden="true" />
                  {t('syncing')} {syncElapsed}s
                </>
              ) : (
                t('runCatalogSync')
              )}
            </button>
            <button
              type="button"
              className={`admin-btn admin-btn--ghost${refreshing ? ' admin-btn--loading' : ''}`}
              onClick={runRefreshStats}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              {refreshing ? (
                <>
                  <span className="admin-sync-spinner" aria-hidden="true" />
                  {t('refreshingStats')}
                </>
              ) : (
                t('refreshStats')
              )}
            </button>
          </div>
          {refreshError ? (
            <div className="admin-result admin-result--error">{refreshError}</div>
          ) : null}
          {syncing ? (
            <CatalogSyncRunning elapsedSec={syncElapsed} stepIndex={syncStep} t={t} lang={lang} />
          ) : null}
          {syncError ? (
            <div className="admin-result admin-result--error">{syncError}</div>
          ) : null}
          {syncResult && syncResult.counts && !syncing ? (
            <CatalogSyncResult result={syncResult} options={syncOpts} t={t} />
          ) : null}
        </section>

        <CatalogCountExplainer activities={activities} totals={totals} vendors={vendors} t={t} />

        <div className="admin-grid admin-grid--metrics">
          <div className="admin-card admin-card--primary">
            <div className="admin-card__label">{t('metricActiveSite')}</div>
            <div className="admin-card__value">{formatNumber(activities.active)}</div>
            <div className="admin-card__hint">{t('metricActiveHint')}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('metricContractRows')}</div>
            <div className="admin-card__value">{formatNumber(totals.contractTotal)}</div>
            <div className="admin-card__hint">
              {t('metricContractHint', { n: formatNumber(vendors.filter((v) => v.isActive).length) })}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('metricUniqueTrips')}</div>
            <div className="admin-card__value">{formatNumber(totals.uniqueTotal)}</div>
            <div className="admin-card__hint">{t('metricUniqueHint')}</div>
          </div>
          <div className="admin-card admin-card--warn">
            <div className="admin-card__label">{t('metricDeactivated')}</div>
            <div className="admin-card__value">{formatNumber(activities.inactive)}</div>
            <div className="admin-card__hint">
              {t('metricDeactivatedHint', { n: formatNumber(activities.total) })}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('metricInquiries')}</div>
            <div className="admin-card__value">{formatNumber(inquiries.last7d)}</div>
            <div className="admin-card__hint">{t('metricInquiriesHint', { total: formatNumber(inquiries.total) })}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('metricAbandoned')}</div>
            <div className="admin-card__value">{formatNumber(inquiries.abandoned)}</div>
            <div className="admin-card__hint">{t('metricAbandonedHint')}</div>
          </div>
        </div>

        <h2 className="admin-section-title">{t('vendorBreakdown')}</h2>
        <p className="admin-section-sub">{t('vendorBreakdownSub')}</p>
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--numeric">
            <thead>
              <tr>
                <th>{t('thVendor')}</th>
                <th>{t('thBokunId')}</th>
                <th>{t('thContractRows')}</th>
                <th>{t('thUniqueTrips')}</th>
                <th>{t('thLastSync')}</th>
                <th>{t('thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">{t('noVendorsSync')}</td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id} className={v.isActive ? '' : 'admin-table-row--muted'}>
                  <td><strong>{v.name}</strong></td>
                  <td><code className="admin-code">#{v.bokunVendorId}</code></td>
                  <td>{formatNumber(v.contractProductCount)}</td>
                  <td>{formatNumber(v.uniqueProductCount)}</td>
                  <td>{formatDateTime(v.lastSyncedAt, lang)}</td>
                  <td>
                    {v.isActive
                      ? <span className="admin-badge admin-badge--ok">{t('statusActive')}</span>
                      : <span className="admin-badge admin-badge--off">{t('statusInactive')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {vendors.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan="2"><strong>{t('totalListed')}</strong></td>
                  <td><strong>{formatNumber(totals.contractTotal)}</strong></td>
                  <td><strong>{formatNumber(totals.uniqueTotal)}</strong></td>
                  <td colSpan="2" />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    );
  }

  // ---------------- Vendors page ----------------
  function VendorsPage({ overview, lang, t }) {
    if (!overview) return <div className="admin-empty">{t('loading')}</div>;
    const { vendors } = overview;
    return (
      <div>
        <h1 className="admin-page-title">{t('vendorsTitle')}</h1>
        <p className="admin-page-sub">{t('vendorsSub')}</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('thVendor')}</th>
                <th>{t('thBokunId')}</th>
                <th>{t('thContracts')}</th>
                <th>{t('thUniqueProducts')}</th>
                <th>{t('thLastSync')}</th>
                <th>{t('thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">{t('noVendors')}</td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>#{v.bokunVendorId}</td>
                  <td>{formatNumber(v.contractProductCount)}</td>
                  <td>{formatNumber(v.uniqueProductCount)}</td>
                  <td>{formatDateTime(v.lastSyncedAt, lang)} <small style={{ color: 'var(--fg-3)' }}>{timeAgo(v.lastSyncedAt, lang)}</small></td>
                  <td>
                    {v.isActive
                      ? <span className="admin-badge admin-badge--ok">{t('statusActive')}</span>
                      : <span className="admin-badge admin-badge--off">{t('statusInactive')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------- Activity content editor (modal) ----------------
  function ActivityContentModal({ token, bokunActivityId, onClose, onSaved }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(null);
    const [supplierLinks, setSupplierLinks] = useState([]);
    const [supplierLinksLoading, setSupplierLinksLoading] = useState(false);

    function extractLinksFromHtml(html, sourceLabel) {
      const out = [];
      const seen = new Set();
      const raw = String(html || '');
      if (!raw) return out;

      const anchorRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = anchorRe.exec(raw))) {
        const href = (m[1] || m[2] || m[3] || '').trim();
        if (!href || !/^https?:\/\//i.test(href)) continue;
        const label = String(m[4] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (seen.has(href)) continue;
        seen.add(href);
        out.push({ href, label, source: sourceLabel });
      }

      const urlRe = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?])/g;
      const urls = raw.match(urlRe) || [];
      for (const hrefRaw of urls) {
        const href = String(hrefRaw || '').trim();
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({ href, label: '', source: sourceLabel });
      }

      return out;
    }

    useEffect(() => {
      if (!bokunActivityId) return undefined;
      let alive = true;
      setLoading(true);
      setError('');
      adminFetch(`/api/admin/activity-content?bokunActivityId=${encodeURIComponent(bokunActivityId)}`, token)
        .then((res) => { if (alive) setForm(res); })
        .catch((err) => { if (alive) setError(err.message || 'Load failed'); })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, [token, bokunActivityId]);

    useEffect(() => {
      if (!bokunActivityId) return undefined;
      let alive = true;
      setSupplierLinks([]);
      setSupplierLinksLoading(true);

      // Pull the full activity payload so we can surface vendor-provided
      // reference links (e.g. "Tour description") that we no longer render
      // on the public detail page.
      fetch(`/api/bokun/activity?id=${encodeURIComponent(bokunActivityId)}&lang=en&source=db`)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Load activity failed (${r.status})`)))
        .then((data) => {
          if (!alive) return;
          const a = (data && data.activity) || {};
          const links = [
            ...extractLinksFromHtml(a.ticketInfoHtml, 'Voucher / ticket message'),
            ...extractLinksFromHtml(a.description, 'Description'),
          ];
          // Prefer "Tour description" / "description" anchors first.
          links.sort((x, y) => {
            const ax = /tour description|description/i.test(x.label) ? 0 : 1;
            const ay = /tour description|description/i.test(y.label) ? 0 : 1;
            return ax - ay;
          });
          setSupplierLinks(links);
        })
        .catch(() => { if (alive) setSupplierLinks([]); })
        .finally(() => { if (alive) setSupplierLinksLoading(false); });

      return () => { alive = false; };
    }, [bokunActivityId]);

    const setTranslation = (field, lang, value) => {
      setForm((f) => ({
        ...f,
        translations: {
          ...f.translations,
          [field]: { ...f.translations[field], [lang]: value },
        },
      }));
    };

    const save = async () => {
      if (!form) return;
      setSaving(true);
      setError('');
      try {
        await adminFetch('/api/admin/activity-content', token, {
          method: 'PATCH',
          body: {
            bokunActivityId: form.bokunActivityId,
            isFeatured: form.featured.isFeatured,
            featuredRank: form.featured.featuredRank,
            coverImageOwnedUrl: form.owned.coverImageOwnedUrl,
            translations: form.translations,
          },
        });
        onSaved();
        onClose();
      } catch (err) {
        setError(err.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    };

    if (!bokunActivityId) return null;

    return (
      <div className="admin-modal-backdrop" onClick={onClose} role="presentation">
        <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="admin-modal__header">
            <h2>Activity content · {bokunActivityId}</h2>
            <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>Close</button>
          </div>
          {loading ? <div className="admin-empty">Loading…</div> : null}
          {error ? <div className="admin-login__error">{error}</div> : null}
          {form && !loading ? (
            <div className="admin-modal__body">
              <p className="admin-page-sub" style={{ marginTop: 0 }}>
                English source (Bókun): <strong>{form.english.title}</strong>
              </p>
              <div style={{ margin: '8px 0 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>
                  Supplier reference links (from Bókun payload)
                </div>
                {supplierLinksLoading ? (
                  <div className="admin-empty" style={{ padding: 0, color: 'var(--fg-3)' }}>Loading links…</div>
                ) : supplierLinks.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                    {supplierLinks.slice(0, 8).map((l) => (
                      <li key={`${l.source}:${l.href}`}>
                        <a href={l.href} target="_blank" rel="noopener noreferrer">
                          {l.label ? l.label : l.href}
                        </a>
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--fg-3)' }}>
                          {l.source}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="admin-empty" style={{ padding: 0, color: 'var(--fg-3)' }}>No links detected.</div>
                )}
              </div>
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>Featured on homepage</span>
                  <input
                    type="checkbox"
                    checked={form.featured.isFeatured}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      featured: { ...f.featured, isFeatured: e.target.checked },
                    }))}
                  />
                </label>
                <label className="admin-field">
                  <span>Featured rank (lower = first)</span>
                  <input
                    type="number"
                    value={form.featured.featuredRank ?? ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      featured: {
                        ...f.featured,
                        featuredRank: e.target.value === '' ? null : Number(e.target.value),
                      },
                    }))}
                  />
                </label>
                <label className="admin-field admin-field--wide">
                  <span>Hero image URL (owned override)</span>
                  <input
                    type="url"
                    value={form.owned.coverImageOwnedUrl || ''}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      owned: { ...f.owned, coverImageOwnedUrl: e.target.value },
                    }))}
                    placeholder="https://…"
                  />
                </label>
              </div>
              {['title', 'summary', 'description'].map((field) => (
                <fieldset key={field} className="admin-fieldset">
                  <legend>{field}</legend>
                  <div className="admin-form-grid">
                    {['hant', 'hans', 'en'].map((lng) => (
                      <label key={lng} className="admin-field admin-field--wide">
                        <span>{lng}</span>
                        {field === 'description' ? (
                          <textarea
                            rows={4}
                            value={(form.translations[field] && form.translations[field][lng]) || ''}
                            onChange={(e) => setTranslation(field, lng, e.target.value)}
                          />
                        ) : (
                          <input
                            type="text"
                            value={(form.translations[field] && form.translations[field][lng]) || ''}
                            onChange={(e) => setTranslation(field, lng, e.target.value)}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
          <div className="admin-modal__footer">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="admin-btn" onClick={save} disabled={saving || loading || !form}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function TranslationEditorModal({
    token,
    bokunActivityId,
    t,
    trustBusy,
    onClose,
    onSaved,
    onApprove,
  }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveNote, setSaveNote] = useState('');
    const [data, setData] = useState(null);
    const [draft, setDraft] = useState([]);

    const applyEditorData = useCallback((res) => {
      setData(res);
      setDraft((res.fields || []).map((f) => ({
        fieldPath: f.fieldPath,
        sourcePreview: f.sourcePreview,
        hant: f.hant?.text || '',
        hans: f.hans?.text || '',
        hantBroken: !!f.hant?.broken,
        hansBroken: !!f.hans?.broken,
      })));
    }, []);

    useEffect(() => {
      if (!bokunActivityId) return undefined;
      let alive = true;
      setLoading(true);
      setError('');
      setSaveNote('');
      adminFetch(
        `/api/admin/translations/edit?bokunActivityId=${encodeURIComponent(bokunActivityId)}`,
        token,
      )
        .then((res) => { if (alive) applyEditorData(res); })
        .catch((err) => { if (alive) setError(err.message || t('loadQueueFailed')); })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, [token, bokunActivityId, t, applyEditorData]);

    const setFieldLang = (fieldPath, lang, value) => {
      setDraft((rows) => rows.map((row) => (
        row.fieldPath === fieldPath ? { ...row, [lang]: value } : row
      )));
    };

    const buildUpdates = () => {
      const updates = [];
      draft.forEach((row) => {
        const orig = (data?.fields || []).find((f) => f.fieldPath === row.fieldPath);
        ['hant', 'hans'].forEach((lang) => {
          const next = String(row[lang] || '').trim();
          const prev = orig?.[lang]?.text || '';
          if (next && next !== prev) {
            updates.push({ fieldPath: row.fieldPath, lang, text: next });
          }
        });
      });
      return updates;
    };

    const save = async () => {
      const updates = buildUpdates();
      if (!updates.length) {
        setError(t('translationEditorNoChanges'));
        return;
      }
      setSaving(true);
      setError('');
      setSaveNote('');
      try {
        const res = await adminFetch('/api/admin/translations/edit', token, {
          method: 'PATCH',
          body: { bokunActivityId, updates },
        });
        applyEditorData(res);
        const hantReady = res.approval?.hant?.readyToApprove
          ? t('translationEditorReadyLabel')
          : t('translationEditorBlockedLabel');
        const hansReady = res.approval?.hans?.readyToApprove
          ? t('translationEditorReadyLabel')
          : t('translationEditorBlockedLabel');
        setSaveNote(t('translationEditorSaved', { hantReady, hansReady }));
        onSaved();
      } catch (err) {
        setError(err.message || t('actionFailed'));
      } finally {
        setSaving(false);
      }
    };

    if (!bokunActivityId) return null;

    return (
      <div className="admin-modal-backdrop" onClick={onClose} role="presentation">
        <div
          className="admin-modal admin-modal--wide"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="admin-modal__header">
            <h2>{t('translationEditorTitle')} · {bokunActivityId}</h2>
            <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
              {t('close')}
            </button>
          </div>
          {loading ? <div className="admin-empty">{t('loading')}</div> : null}
          {error ? <div className="admin-login__error">{error}</div> : null}
          {saveNote ? (
            <div className="admin-result" style={{ margin: '0 16px 8px' }}>{saveNote}</div>
          ) : null}
          {data && !loading ? (
            <div className="admin-modal__body">
              <p className="admin-page-sub" style={{ marginTop: 0 }}>{t('translationEditorSub')}</p>
              <p className="admin-page-sub" style={{ marginTop: 0 }}>
                <strong>{data.title}</strong>
              </p>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <LocaleApprovalBadge ap={data.approval?.hant} t={t} localeTag={t('localeTagHant')} />
                <LocaleApprovalBadge ap={data.approval?.hans} t={t} localeTag={t('localeTagHans')} />
              </div>
              {draft.map((row) => (
                <fieldset key={row.fieldPath} className="admin-fieldset">
                  <legend>
                    {row.fieldPath}
                    {row.hantBroken || row.hansBroken ? (
                      <span className="admin-locale-badge admin-locale-badge--blocked" style={{ marginLeft: 8 }}>
                        {t('translationEditorFieldBroken')}
                      </span>
                    ) : null}
                  </legend>
                  <p className="admin-page-sub" style={{ marginTop: 0, fontSize: 12 }}>
                    {t('translationEditorSource')}: {row.sourcePreview || '—'}
                  </p>
                  <div className="admin-form-grid">
                    <label className="admin-field admin-field--wide">
                      <span>{t('thApprovalHant')}</span>
                      <textarea
                        rows={row.fieldPath.endsWith('Html') || row.fieldPath === 'description' ? 5 : 2}
                        value={row.hant}
                        onChange={(e) => setFieldLang(row.fieldPath, 'hant', e.target.value)}
                      />
                    </label>
                    <label className="admin-field admin-field--wide">
                      <span>{t('thApprovalHans')}</span>
                      <textarea
                        rows={row.fieldPath.endsWith('Html') || row.fieldPath === 'description' ? 5 : 2}
                        value={row.hans}
                        onChange={(e) => setFieldLang(row.fieldPath, 'hans', e.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
          <div className="admin-modal__footer">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose} disabled={saving}>
              {t('cancel')}
            </button>
            {data?.approval?.hant?.readyToApprove ? (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={saving || trustBusy === `${bokunActivityId}:hant`}
                onClick={async () => {
                  const res = await onApprove(bokunActivityId, 'hant');
                  if (res) applyEditorData(res);
                }}
              >
                {trustBusy === `${bokunActivityId}:hant` ? '…' : t('approveTranslationHantBtn')}
              </button>
            ) : null}
            {data?.approval?.hans?.readyToApprove ? (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                disabled={saving || trustBusy === `${bokunActivityId}:hans`}
                onClick={async () => {
                  const res = await onApprove(bokunActivityId, 'hans');
                  if (res) applyEditorData(res);
                }}
              >
                {trustBusy === `${bokunActivityId}:hans` ? '…' : t('approveTranslationHansBtn')}
              </button>
            ) : null}
            <button type="button" className="admin-btn" onClick={save} disabled={saving || loading || !data}>
              {saving ? t('saving') : t('translationEditorSave')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Content page ----------------
  function ContentPage({ token, vendors, reloadKey, onRefresh, t }) {
    const [vendorId, setVendorId] = useState('');
    const [vendorForm, setVendorForm] = useState(null);
    const [vendorMsg, setVendorMsg] = useState('');
    const [vendorSaving, setVendorSaving] = useState(false);
    const [featured, setFeatured] = useState({ rows: [], total: 0 });
    const [featuredLoading, setFeaturedLoading] = useState(false);
    const [addFeaturedId, setAddFeaturedId] = useState('');
    const [contentEditId, setContentEditId] = useState(null);

    const loadFeatured = useCallback(() => {
      setFeaturedLoading(true);
      adminFetch('/api/admin/activities?featured=true&pageSize=50', token)
        .then((res) => setFeatured({ rows: res.rows || [], total: res.total || 0 }))
        .catch(() => setFeatured({ rows: [], total: 0 }))
        .finally(() => setFeaturedLoading(false));
    }, [token]);

    useEffect(() => { loadFeatured(); }, [loadFeatured, reloadKey]);

    useEffect(() => {
      if (!vendorId) { setVendorForm(null); return undefined; }
      let alive = true;
      adminFetch(`/api/admin/vendor?bokunVendorId=${encodeURIComponent(vendorId)}`, token)
        .then((res) => { if (alive) setVendorForm(res.vendor); })
        .catch(() => { if (alive) setVendorForm(null); });
      return () => { alive = false; };
    }, [token, vendorId]);

    const saveVendor = async () => {
      if (!vendorForm) return;
      setVendorSaving(true);
      setVendorMsg('');
      try {
        await adminFetch('/api/admin/vendor', token, {
          method: 'PATCH',
          body: {
            bokunVendorId: vendorForm.bokunVendorId,
            summary: vendorForm.summary,
            heroImageUrl: vendorForm.heroImageUrl,
            tags: vendorForm.tags,
          },
        });
        setVendorMsg(t('vendorSaved'));
        onRefresh();
      } catch (err) {
        setVendorMsg(err.message || t('saveFailed'));
      } finally {
        setVendorSaving(false);
      }
    };

    const addFeatured = async () => {
      const id = addFeaturedId.trim();
      if (!id) return;
      try {
        await adminFetch('/api/admin/activity-content', token, {
          method: 'PATCH',
          body: { bokunActivityId: id, isFeatured: true, featuredRank: featured.rows.length + 1 },
        });
        setAddFeaturedId('');
        loadFeatured();
        onRefresh();
      } catch (err) {
        setVendorMsg(err.message || 'Could not add featured');
      }
    };

    return (
      <div>
        <h1 className="admin-page-title">{t('contentTitle')}</h1>
        <p className="admin-page-sub">{t('contentSub')}</p>

        <section className="admin-sync-panel">
          <h2>{t('featuredSection')}</h2>
          <p>{t('featuredDesc')}</p>
          <div className="admin-sync-actions" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder={t('featuredIdPlaceholder')}
              value={addFeaturedId}
              onChange={(e) => setAddFeaturedId(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addFeatured}>{t('addFeatured')}</button>
            {featuredLoading ? <span style={{ fontSize: 12 }}>{t('loading')}</span> : null}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>{t('thTitle')}</th><th>ID</th><th>{t('thRank')}</th><th>{t('thActions')}</th></tr>
              </thead>
              <tbody>
                {featured.rows.length === 0 ? (
                  <tr><td colSpan="4" className="admin-empty">{t('noFeatured')}</td></tr>
                ) : featured.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.title}</strong></td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.featuredRank ?? '—'}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setContentEditId(row.bokunActivityId)}>{t('edit')}</button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger admin-btn--sm"
                          onClick={async () => {
                            await adminFetch('/api/admin/activity-content', token, {
                              method: 'PATCH',
                              body: { bokunActivityId: row.bokunActivityId, isFeatured: false },
                            });
                            loadFeatured();
                            onRefresh();
                          }}
                        >
                          {t('remove')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-sync-panel">
          <h2>{t('vendorProfile')}</h2>
          <div className="admin-form-grid" style={{ marginBottom: 12 }}>
            <label className="admin-field admin-field--wide">
              <span>{t('thVendor')}</span>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">{t('selectVendor')}</option>
                {(vendors || []).map((v) => (
                  <option key={v.id} value={v.bokunVendorId}>{v.name} (#{v.bokunVendorId})</option>
                ))}
              </select>
            </label>
          </div>
          {vendorForm ? (
            <div className="admin-form-grid">
              <label className="admin-field admin-field--wide">
                <span>Summary</span>
                <textarea
                  rows={3}
                  value={vendorForm.summary || ''}
                  onChange={(e) => setVendorForm((f) => ({ ...f, summary: e.target.value }))}
                />
              </label>
              <label className="admin-field admin-field--wide">
                <span>Hero image URL</span>
                <input
                  type="url"
                  value={vendorForm.heroImageUrl || ''}
                  onChange={(e) => setVendorForm((f) => ({ ...f, heroImageUrl: e.target.value }))}
                />
              </label>
              <label className="admin-field admin-field--wide">
                <span>Tags (comma-separated)</span>
                <input
                  type="text"
                  value={(vendorForm.tags || []).join(', ')}
                  onChange={(e) => setVendorForm((f) => ({
                    ...f,
                    tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                  }))}
                />
              </label>
            </div>
          ) : null}
          <div className="admin-sync-actions" style={{ marginTop: 12 }}>
            <button type="button" className="admin-btn" onClick={saveVendor} disabled={!vendorForm || vendorSaving}>
              {vendorSaving ? t('saving') : t('saveVendor')}
            </button>
            {vendorMsg ? <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{vendorMsg}</span> : null}
          </div>
        </section>

        {contentEditId ? (
          <ActivityContentModal
            token={token}
            bokunActivityId={contentEditId}
            onClose={() => setContentEditId(null)}
            onSaved={() => { loadFeatured(); onRefresh(); }}
          />
        ) : null}
      </div>
    );
  }

  function ContractPricingCell({ info, loading, formatPrice, t }) {
    if (loading) {
      return <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t('pricingLoading')}</span>;
    }
    if (!info) {
      return <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>—</span>;
    }
    if (!info.available) {
      const msg = info.reason === 'NO_CONTRACT' ? t('pricingNoContract') : t('pricingUnavailable');
      return (
        <div className="admin-price-stack">
          {info.listPrice ? (
            <div className="admin-price-stack__row">
              <span className="admin-price-stack__label">{t('pricingListLabel')}</span>
              <span>{formatPrice(info.listPrice.amount, info.listPrice.currency)}</span>
            </div>
          ) : null}
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{msg}</span>
        </div>
      );
    }
    return (
      <div className="admin-price-stack">
        {info.listPrice ? (
          <div className="admin-price-stack__row">
            <span className="admin-price-stack__label">{t('pricingListLabel')}</span>
            <span>{formatPrice(info.listPrice.amount, info.listPrice.currency)}</span>
          </div>
        ) : null}
        {info.commissionPct != null ? (
          <div className="admin-price-stack__row">
            <span className="admin-price-stack__label">{t('pricingCommissionLabel')}</span>
            <span>{info.commissionPct}%</span>
          </div>
        ) : null}
        {info.estimatedCost ? (
          <div className="admin-price-stack__row">
            <span className="admin-price-stack__label">{t('pricingCostLabel')}</span>
            <span>{formatPrice(info.estimatedCost.amount, info.estimatedCost.currency)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------- Activities page ----------------
  function ActivitiesPage({ token, vendors, reloadKey, formatDisplayPrice, lang, t }) {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [statusFilter, setStatusFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('');
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [data, setData] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rowBusy, setRowBusy] = useState(null);
    const [actionMsg, setActionMsg] = useState('');
    const [contentEditId, setContentEditId] = useState(null);
    const [contractById, setContractById] = useState({});
    const [contractPricingLoading, setContractPricingLoading] = useState(false);

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(q), 300);
      return () => clearTimeout(t);
    }, [q]);

    useEffect(() => { setPage(1); }, [statusFilter, vendorFilter, debouncedQ]);

    const fetchList = useCallback(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
      });
      if (vendorFilter) params.set('vendorId', vendorFilter);
      if (debouncedQ) params.set('q', debouncedQ);
      return adminFetch(`/api/admin/activities?${params}`, token);
    }, [token, page, pageSize, statusFilter, vendorFilter, debouncedQ]);

    useEffect(() => {
      let alive = true;
      setLoading(true);
      setError('');
      fetchList()
        .then((res) => {
          if (!alive) return;
          setData({ rows: res.rows || [], total: res.total || 0 });
        })
        .catch((err) => {
          if (!alive) return;
          setError(err.message || t('loadActivitiesFailed'));
        })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, [fetchList, reloadKey]);

    useEffect(() => {
      const rows = data.rows || [];
      if (!rows.length || !token) {
        setContractById({});
        return undefined;
      }
      let alive = true;
      setContractPricingLoading(true);
      adminFetch('/api/admin/activities/contract-pricing', token, {
        method: 'POST',
        body: { bokunActivityIds: rows.map((r) => r.bokunActivityId) },
      })
        .then((res) => {
          if (!alive) return;
          setContractById(res.byId || {});
        })
        .catch(() => {
          if (!alive) return;
          setContractById({});
        })
        .finally(() => {
          if (alive) setContractPricingLoading(false);
        });
      return () => { alive = false; };
    }, [data.rows, token, reloadKey]);

    const runRowAction = async (row, action, isActive) => {
      const id = row.bokunActivityId;
      setRowBusy(id);
      setActionMsg('');
      try {
        await adminFetch('/api/admin/activity', token, {
          method: 'POST',
          body: { action, bokunActivityId: id, isActive },
        });
        const res = await fetchList();
        setData({ rows: res.rows || [], total: res.total || 0 });
        setActionMsg(
          action === 'resync-detail'
            ? `Detail re-synced for ${id}`
            : `${id} is now ${isActive ? 'active' : 'inactive'}`,
        );
      } catch (err) {
        setActionMsg(err.message || t('actionFailed'));
      } finally {
        setRowBusy(null);
      }
    };

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

    return (
      <div>
        <h1 className="admin-page-title">{t('activitiesTitle')}</h1>
        <p className="admin-page-sub">
          {t('activitiesSub')} {t('activitiesMatching', { n: formatNumber(data.total) })}
          <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: 'var(--fg-3)' }}>
            {t('pricingHint')}
          </span>
          {actionMsg ? <span style={{ marginLeft: 12, color: 'var(--fg-3)' }}>{actionMsg}</span> : null}
        </p>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{t('filterAllStatuses')}</option>
              <option value="active">{t('filterActiveOnly')}</option>
              <option value="inactive">{t('filterInactiveOnly')}</option>
            </select>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="">{t('filterAllVendors')}</option>
              {(vendors || []).map((v) => (
                <option key={v.id} value={v.bokunVendorId}>
                  {v.name} (#{v.bokunVendorId})
                </option>
              ))}
            </select>
            {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t('loading')}</span> : null}
          </div>

          {error ? (
            <div className="admin-empty" style={{ color: '#b91c1c' }}>{error}</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('thTitle')}</th>
                  <th>{t('thBokunId')}</th>
                  <th>{t('thVendor')}</th>
                  <th>{t('thContractPricing')}</th>
                  <th>{t('thLastSync')}</th>
                  <th>{t('thStatus')}</th>
                  <th>{t('thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="7" className="admin-empty">{t('noActivitiesMatch')}</td></tr>
                ) : data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.slug}</div>
                    </td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.vendor ? row.vendor.name : '—'}</td>
                    <td>
                      <ContractPricingCell
                        info={contractById[String(row.bokunActivityId)]}
                        loading={contractPricingLoading}
                        formatPrice={formatPrice}
                        t={t}
                      />
                    </td>
                    <td>
                      {formatDateTime(row.lastSyncedAt, lang)}
                      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timeAgo(row.lastSyncedAt, lang)}</div>
                    </td>
                    <td>
                      {row.isActive
                        ? <span className="admin-badge admin-badge--ok">{t('statusActive')}</span>
                        : <span className="admin-badge admin-badge--off">{t('statusInactive')}</span>}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => setContentEditId(row.bokunActivityId)}
                        >
                          {t('contentBtn')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={rowBusy === row.bokunActivityId}
                          onClick={() => runRowAction(row, 'resync-detail')}
                        >
                          {rowBusy === row.bokunActivityId ? '…' : t('resyncDetail')}
                        </button>
                        {row.isActive ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            disabled={rowBusy === row.bokunActivityId}
                            onClick={() => runRowAction(row, 'set-active', false)}
                          >
                            {t('deactivate')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy === row.bokunActivityId}
                            onClick={() => runRowAction(row, 'set-active', true)}
                          >
                            {t('activate')}
                          </button>
                        )}
                        <a
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          href={`/tours/${encodeURIComponent(row.bokunActivityId)}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          {t('viewSite')}
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="admin-pagination">
            <span>{t('pageOf', { page, total: totalPages })}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{t('pagePrev')}</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{t('pageNext')}</button>
            </span>
          </div>
        </div>
        {contentEditId ? (
          <ActivityContentModal
            token={token}
            bokunActivityId={contentEditId}
            onClose={() => setContentEditId(null)}
            onSaved={() => fetchList().then((res) => setData({ rows: res.rows || [], total: res.total || 0 }))}
          />
        ) : null}
      </div>
    );
  }

  const COLLECTION_CHIP_IDS = ['aurora', 'glacier', 'hotspring', 'day', 'self-drive', 'water', 'snow', 'outdoor'];
  const COLLECTION_ROUTE_IDS = ['golden-circle', 'south-coast'];
  const FOLLOW_UP_OPTIONS = ['open', 'contacted', 'converted', 'lost', 'spam'];

  const EMPTY_COLLECTION = {
    slug: '',
    isActive: true,
    sortOrder: 0,
    maxItems: 6,
    filterType: 'chip',
    filterValue: 'aurora',
    activityIds: [],
    titles: { hant: '', hans: '', en: '' },
    overlines: { hant: '', hans: '', en: '' },
    ctaLabels: { hant: '', hans: '', en: '' },
    ctaChipId: 'aurora',
    ctaRouteId: null,
  };

  // ---------------- Marketing page ----------------
  function MarketingPage({ token, reloadKey, t }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
      setLoading(true);
      setError('');
      adminFetch('/api/admin/collections', token)
        .then((res) => setRows(res.rows || []))
        .catch((err) => setError(err.message || t('loadCollectionsFailed')))
        .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { load(); }, [load, reloadKey]);

    const save = async () => {
      if (!editing) return;
      setSaving(true);
      setMsg('');
      setError('');
      try {
        const body = {
          slug: editing.slug,
          isActive: editing.isActive,
          sortOrder: editing.sortOrder,
          maxItems: editing.maxItems,
          filterType: editing.filterType,
          filterValue: editing.filterType === 'manual' ? null : editing.filterValue,
          activityIds: editing.filterType === 'manual'
            ? String(editing.activityIdsText || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
            : [],
          titles: editing.titles,
          overlines: editing.overlines,
          ctaLabels: editing.ctaLabels,
          ctaChipId: editing.ctaChipId || null,
          ctaRouteId: editing.ctaRouteId || null,
        };
        if (editing.id) {
          await adminFetch(`/api/admin/collections?id=${editing.id}`, token, { method: 'PATCH', body });
        } else {
          await adminFetch('/api/admin/collections', token, { method: 'POST', body });
        }
        setMsg(t('collectionSaved'));
        setEditing(null);
        load();
      } catch (err) {
        setError(err.message || t('saveFailed'));
      } finally {
        setSaving(false);
      }
    };

    const remove = async (row) => {
      if (!window.confirm(t('deleteCollectionConfirm', { slug: row.slug }))) return;
      try {
        await adminFetch(`/api/admin/collections?id=${row.id}`, token, { method: 'DELETE' });
        load();
      } catch (err) {
        setError(err.message || t('deleteFailed'));
      }
    };

    return (
      <div>
        <h1 className="admin-page-title">{t('marketingTitle')}</h1>
        <p className="admin-page-sub">{t('marketingSub')}</p>

        <div className="admin-sync-actions" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="admin-btn"
            onClick={() => setEditing({
              ...EMPTY_COLLECTION,
              slug: `collection-${Date.now()}`,
              titles: { hant: '精選行程', hans: '精选行程', en: 'Curated trips' },
              overlines: { hant: '季節精選', hans: '季节精选', en: 'Season picks' },
            })}
          >
            {t('newCollection')}
          </button>
          {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t('loading')}</span> : null}
          {msg ? <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{msg}</span> : null}
        </div>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>{t('thOrder')}</th><th>{t('thSlug')}</th><th>{t('thTitle')} (EN)</th><th>{t('thFilter')}</th><th>{t('thStatus')}</th><th>{t('thActions')}</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">{t('noCollections')}</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sortOrder}</td>
                  <td><code>{row.slug}</code></td>
                  <td>{row.titles.en || row.titles.hant || '—'}</td>
                  <td>{row.filterType}{row.filterValue ? ` · ${row.filterValue}` : ''}</td>
                  <td>{row.isActive ? <span className="admin-badge admin-badge--ok">{t('badgeOn')}</span> : <span className="admin-badge admin-badge--off">{t('badgeOffShort')}</span>}</td>
                  <td>
                    <div className="admin-actions">
                      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditing({
                        ...row,
                        activityIdsText: (row.activityIds || []).join(', '),
                      })}>{t('edit')}</button>
                      <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(row)}>{t('delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editing ? (
          <div className="admin-modal-backdrop" onClick={() => setEditing(null)} role="presentation">
            <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="admin-modal__header">
                <h2>{editing.id ? `${t('edit')} · ${editing.slug}` : t('newCollection')}</h2>
                <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditing(null)}>{t('close')}</button>
              </div>
              <div className="admin-modal__body">
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Slug</span>
                    <input type="text" value={editing.slug} onChange={(e) => setEditing((f) => ({ ...f, slug: e.target.value }))} disabled={!!editing.id} />
                  </label>
                  <label className="admin-field">
                    <span>Sort order</span>
                    <input type="number" value={editing.sortOrder} onChange={(e) => setEditing((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} />
                  </label>
                  <label className="admin-field">
                    <span>Max cards</span>
                    <input type="number" min={1} max={24} value={editing.maxItems} onChange={(e) => setEditing((f) => ({ ...f, maxItems: Number(e.target.value) || 6 }))} />
                  </label>
                  <label className="admin-field">
                    <span>Active</span>
                    <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing((f) => ({ ...f, isActive: e.target.checked }))} />
                  </label>
                  <label className="admin-field">
                    <span>Filter type</span>
                    <select value={editing.filterType} onChange={(e) => setEditing((f) => ({ ...f, filterType: e.target.value }))}>
                      <option value="chip">chip</option>
                      <option value="route">route</option>
                      <option value="manual">manual IDs</option>
                    </select>
                  </label>
                  {editing.filterType === 'chip' ? (
                    <label className="admin-field">
                      <span>Chip</span>
                      <select value={editing.filterValue || ''} onChange={(e) => setEditing((f) => ({ ...f, filterValue: e.target.value }))}>
                        {COLLECTION_CHIP_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {editing.filterType === 'route' ? (
                    <label className="admin-field">
                      <span>Route</span>
                      <select value={editing.filterValue || ''} onChange={(e) => setEditing((f) => ({ ...f, filterValue: e.target.value }))}>
                        {COLLECTION_ROUTE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {editing.filterType === 'manual' ? (
                    <label className="admin-field admin-field--wide">
                      <span>Bókun activity IDs (comma-separated)</span>
                      <textarea rows={2} value={editing.activityIdsText || ''} onChange={(e) => setEditing((f) => ({ ...f, activityIdsText: e.target.value }))} />
                    </label>
                  ) : null}
                  {['hant', 'hans', 'en'].map((lng) => (
                    <label key={`title-${lng}`} className="admin-field admin-field--wide">
                      <span>Title · {lng}</span>
                      <input type="text" value={(editing.titles && editing.titles[lng]) || ''} onChange={(e) => setEditing((f) => ({
                        ...f,
                        titles: { ...f.titles, [lng]: e.target.value },
                      }))} />
                    </label>
                  ))}
                  {['hant', 'hans', 'en'].map((lng) => (
                    <label key={`over-${lng}`} className="admin-field admin-field--wide">
                      <span>Overline · {lng}</span>
                      <input type="text" value={(editing.overlines && editing.overlines[lng]) || ''} onChange={(e) => setEditing((f) => ({
                        ...f,
                        overlines: { ...f.overlines, [lng]: e.target.value },
                      }))} />
                    </label>
                  ))}
                  <label className="admin-field">
                    <span>CTA chip (View all)</span>
                    <select value={editing.ctaChipId || ''} onChange={(e) => setEditing((f) => ({ ...f, ctaChipId: e.target.value || null }))}>
                      <option value="">—</option>
                      {COLLECTION_CHIP_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>CTA route</span>
                    <select value={editing.ctaRouteId || ''} onChange={(e) => setEditing((f) => ({ ...f, ctaRouteId: e.target.value || null }))}>
                      <option value="">—</option>
                      {COLLECTION_ROUTE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="admin-modal__footer">
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setEditing(null)} disabled={saving}>{t('cancel')}</button>
                <button type="button" className="admin-btn" onClick={save} disabled={saving}>{saving ? t('saving') : t('save')}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------- Inquiries page ----------------
  function InquiriesPage({ token, lang, t }) {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [statusFilter, setStatusFilter] = useState('');
    const [abandonedOnly, setAbandonedOnly] = useState(false);
    const [data, setData] = useState({ rows: [], total: 0, statusCounts: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [openId, setOpenId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [notesDraft, setNotesDraft] = useState('');
    const [followDraft, setFollowDraft] = useState('open');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const loadList = useCallback(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);
      if (abandonedOnly) params.set('abandoned', 'true');
      return adminFetch(`/api/admin/inquiries?${params}`, token);
    }, [token, page, pageSize, statusFilter, abandonedOnly]);

    useEffect(() => { setPage(1); }, [statusFilter, abandonedOnly]);

    useEffect(() => {
      let alive = true;
      setLoading(true);
      setError('');
      loadList()
        .then((res) => {
          if (!alive) return;
          setData({
            rows: res.rows || [],
            total: res.total || 0,
            statusCounts: res.statusCounts || null,
          });
        })
        .catch((err) => {
          if (!alive) return;
          setError(err.message || t('loadInquiriesFailed'));
        })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, [loadList]);

    useEffect(() => {
      if (!openId) {
        setDetail(null);
        return undefined;
      }
      let alive = true;
      adminFetch(`/api/admin/inquiry?id=${openId}`, token)
        .then((res) => {
          if (!alive) return;
          const inq = res.inquiry;
          setDetail(inq);
          setNotesDraft(inq.adminNotes || '');
          setFollowDraft(inq.followUpStatus || 'open');
          setSaveMsg('');
        })
        .catch(() => { if (alive) setDetail(null); });
      return () => { alive = false; };
    }, [token, openId]);

    const saveFollowUp = async () => {
      if (!openId) return;
      setSaving(true);
      setSaveMsg('');
      try {
        const res = await adminFetch(`/api/admin/inquiry?id=${openId}`, token, {
          method: 'PATCH',
          body: { followUpStatus: followDraft, adminNotes: notesDraft },
        });
        setDetail(res.inquiry);
        setSaveMsg(t('savedOk'));
        const listRes = await loadList();
        setData({
          rows: listRes.rows || [],
          total: listRes.total || 0,
          statusCounts: listRes.statusCounts || data.statusCounts,
        });
      } catch (err) {
        setSaveMsg(err.message || t('saveFailed'));
      } finally {
        setSaving(false);
      }
    };

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

    function statusBadge(s) {
      if (s === 'new') return 'admin-badge admin-badge--info';
      if (s === 'redirected_to_bokun') return 'admin-badge admin-badge--warn';
      if (s === 'completed' || s === 'paid') return 'admin-badge admin-badge--ok';
      if (s === 'failed' || s === 'cancelled') return 'admin-badge admin-badge--err';
      return 'admin-badge admin-badge--off';
    }

    function followBadge(s) {
      if (s === 'converted') return 'admin-badge admin-badge--ok';
      if (s === 'contacted') return 'admin-badge admin-badge--info';
      if (s === 'lost' || s === 'spam') return 'admin-badge admin-badge--off';
      return 'admin-badge admin-badge--warn';
    }

    return (
      <div>
        <h1 className="admin-page-title">{t('inquiriesTitle')}</h1>
        <p className="admin-page-sub">
          {t('inquiriesMatching', { n: formatNumber(data.total) })}
        </p>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={abandonedOnly}>
              <option value="">{t('filterAllStatuses')}</option>
              <option value="new">new (concierge lead)</option>
              <option value="redirected_to_bokun">redirected_to_bokun</option>
            </select>
            <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={abandonedOnly} onChange={(e) => setAbandonedOnly(e.target.checked)} />
              {t('abandonedCartsOnly')}
            </label>
            {data.statusCounts ? (
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                {Object.entries(data.statusCounts).map(([k, v]) => `${k}:${v}`).join(' · ')}
              </span>
            ) : null}
            {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t('loading')}</span> : null}
          </div>

          {error ? (
            <div className="admin-empty" style={{ color: '#b91c1c' }}>{error}</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('thCreated')}</th>
                  <th>{t('thStatus')}</th>
                  <th>{t('saveFollowUp')}</th>
                  <th>{t('thContact')}</th>
                  <th>{t('thItems')}</th>
                  <th>{t('thHostedUrl')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="6" className="admin-empty">{t('noInquiries')}</td></tr>
                ) : data.rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={row.isAbandoned ? 'admin-row--abandoned' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    >
                      <td>
                        {formatDateTime(row.createdAt, lang)}
                        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timeAgo(row.createdAt, lang)}</div>
                      </td>
                      <td><span className={statusBadge(row.status)}>{row.status}</span></td>
                      <td><span className={followBadge(row.followUpStatus)}>{row.followUpStatus}</span></td>
                      <td>
                        <strong>{row.name}</strong>
                        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.email}{row.phone ? ` · ${row.phone}` : ''}</div>
                      </td>
                      <td>{Array.isArray(row.selectedTrip) ? `${row.selectedTrip.length} item${row.selectedTrip.length === 1 ? '' : 's'}` : '—'}</td>
                      <td>
                        {row.hostedCheckoutUrl
                          ? <a href={row.hostedCheckoutUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>open ↗</a>
                          : '—'}
                      </td>
                    </tr>
                    {openId === row.id && detail ? (
                      <tr>
                        <td colSpan="6" className="admin-inquiry-detail">
                          <div className="admin-inquiry-detail__grid">
                            <div>
                              <h3>Contact</h3>
                              <p><strong>{detail.name}</strong><br />{detail.email}{detail.phone ? <><br />{detail.phone}</> : null}</p>
                              <p>Lang: {detail.lang || '—'} · Pax: {detail.pax ?? '—'}</p>
                              {detail.travelStartDate ? <p>Travel: {detail.travelStartDate}{detail.travelEndDate ? ` → ${detail.travelEndDate}` : ''}</p> : null}
                              {detail.notes ? <p className="admin-inquiry-detail__notes">{detail.notes}</p> : null}
                            </div>
                            <div>
                              <h3>Follow-up</h3>
                              <label className="admin-field">
                                <span>Status</span>
                                <select value={followDraft} onChange={(e) => setFollowDraft(e.target.value)}>
                                  {FOLLOW_UP_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </label>
                              <label className="admin-field admin-field--wide">
                                <span>Internal notes</span>
                                <textarea rows={4} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Call back, sent quote, etc." />
                              </label>
                              <div className="admin-sync-actions">
                                <button type="button" className="admin-btn admin-btn--sm" onClick={saveFollowUp} disabled={saving}>
                                  {saving ? t('saving') : t('saveFollowUp')}
                                </button>
                                {saveMsg ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{saveMsg}</span> : null}
                              </div>
                            </div>
                          </div>
                          {Array.isArray(detail.selectedTrip) && detail.selectedTrip.length ? (
                            <details style={{ marginTop: 12 }}>
                              <summary style={{ cursor: 'pointer', fontSize: 13 }}>Trip payload ({detail.selectedTrip.length})</summary>
                              <pre className="admin-pre">{JSON.stringify(detail.selectedTrip, null, 2)}</pre>
                            </details>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}

          <div className="admin-pagination">
            <span>{t('pageOf', { page, total: totalPages })}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{t('pagePrev')}</button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>{t('pageNext')}</button>
            </span>
          </div>
        </div>
      </div>
    );
  }

  function localeApprovalBadgeProps(ap) {
    if (!ap) return { className: 'admin-locale-badge admin-locale-badge--none', label: '—', showCheck: false };
    if (ap.live) {
      return { className: 'admin-locale-badge admin-locale-badge--approved', label: 'approvalApproved', showCheck: true };
    }
    if (ap.readyToApprove) {
      return { className: 'admin-locale-badge admin-locale-badge--ready', label: 'approvalReady', showCheck: false };
    }
    if ((ap.missing || 0) > 0 || (ap.stale || 0) > 0) {
      return { className: 'admin-locale-badge admin-locale-badge--pending', label: 'approvalNeedsTranslation', showCheck: false };
    }
    return { className: 'admin-locale-badge admin-locale-badge--blocked', label: 'approvalBlocked', showCheck: false };
  }

  function LocaleApprovalBadge({ ap, t, localeTag, count }) {
    const meta = localeApprovalBadgeProps(ap);
    const label = meta.label === '—' ? '—' : t(meta.label);
    const title = ap?.message || label;
    return (
      <span className={meta.className} title={title}>
        {localeTag ? <span className="admin-locale-badge__tag">{localeTag}</span> : null}
        {meta.showCheck ? <span className="admin-locale-badge__icon" aria-hidden="true">✓</span> : null}
        {count != null ? formatNumber(count) : label}
      </span>
    );
  }

  function LocaleApprovalSummary({ summary, activeActivities, t }) {
    if (!summary) return null;
    const total = formatNumber(activeActivities ?? summary.scannedTotal ?? 0);
    return (
      <div className="admin-locale-summary">
        <div className="admin-locale-summary__group">
          <span className="admin-locale-summary__label">{t('approvalSummaryApproved')}</span>
          <LocaleApprovalBadge ap={{ live: true }} t={t} localeTag={t('localeTagHant')} count={summary.liveHant} />
          <LocaleApprovalBadge ap={{ live: true }} t={t} localeTag={t('localeTagHans')} count={summary.liveHans} />
        </div>
        <div className="admin-locale-summary__group">
          <span className="admin-locale-summary__label">{t('approvalSummaryReady')}</span>
          <LocaleApprovalBadge ap={{ readyToApprove: true }} t={t} localeTag={t('localeTagHant')} count={summary.readyHant} />
          <LocaleApprovalBadge ap={{ readyToApprove: true }} t={t} localeTag={t('localeTagHans')} count={summary.readyHans} />
          <span className="admin-locale-badge admin-locale-badge--ready" title={t('approvalReadyCount', {
            hant: formatNumber(summary.readyHant),
            hans: formatNumber(summary.readyHans),
            both: formatNumber(summary.readyBoth),
          })}
          >
            {t('approvalBothReadyShort')} · {formatNumber(summary.readyBoth)}
          </span>
        </div>
        {(summary.blockedActivities > 0 || summary.blockedHant > 0 || summary.blockedHans > 0) ? (
          <div className="admin-locale-summary__group">
            <span className="admin-locale-summary__label">{t('approvalSummaryBlocked')}</span>
            <LocaleApprovalBadge ap={{ message: t('approvalBlocked') }} t={t} localeTag={t('localeTagHant')} count={summary.blockedHant} />
            <LocaleApprovalBadge ap={{ message: t('approvalBlocked') }} t={t} localeTag={t('localeTagHans')} count={summary.blockedHans} />
            <span className="admin-locale-badge admin-locale-badge--blocked" title={t('blockedQueueSub', {
              liveHant: formatNumber(summary.liveHant),
              liveHans: formatNumber(summary.liveHans),
              total,
            })}
            >
              {t('navActivities')} · {formatNumber(summary.blockedActivities)}
            </span>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------- Translations page ----------------
  function TranslationsPage({ token, reloadKey, t }) {
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState(null);
    const [rowBusy, setRowBusy] = useState(null);
    const [batchSize, setBatchSize] = useState(12);
    const [batchElapsed, setBatchElapsed] = useState(0);
    const [batchStep, setBatchStep] = useState(0);
    const [rowElapsed, setRowElapsed] = useState(0);
    const [rowStep, setRowStep] = useState(0);
    const [trustBusy, setTrustBusy] = useState(null);
    const [selectedApproval, setSelectedApproval] = useState(() => new Set());
    const [bothLangsOnly, setBothLangsOnly] = useState(false);
    const [batchTrustNote, setBatchTrustNote] = useState('');
    const [selectedBlocked, setSelectedBlocked] = useState(() => new Set());
    const [blockedBatchBusy, setBlockedBatchBusy] = useState(null);
    const [blockedBatchNote, setBlockedBatchNote] = useState('');
    const [translationEditorId, setTranslationEditorId] = useState(null);
    const batchStartedRef = useRef(0);
    const rowStartedRef = useRef(0);

    const queueDepth = queue?.stats?.queueDepth;
    const batchEstimateSec = Math.min(295, Math.max(40, batchSize * 22));
    const batchProgressPct = running
      ? Math.min(92, Math.round((batchElapsed / batchEstimateSec) * 100))
      : 0;

    useEffect(() => {
      if (!running) return undefined;
      batchStartedRef.current = Date.now();
      setBatchElapsed(0);
      setBatchStep(0);
      const tick = window.setInterval(() => {
        const sec = Math.floor((Date.now() - batchStartedRef.current) / 1000);
        setBatchElapsed(sec);
        setBatchStep(Math.floor(sec / 5));
      }, 500);
      return () => window.clearInterval(tick);
    }, [running]);

    useEffect(() => {
      if (!rowBusy) return undefined;
      rowStartedRef.current = Date.now();
      setRowElapsed(0);
      setRowStep(0);
      const tick = window.setInterval(() => {
        const sec = Math.floor((Date.now() - rowStartedRef.current) / 1000);
        setRowElapsed(sec);
        setRowStep(Math.floor(sec / 4));
      }, 500);
      return () => window.clearInterval(tick);
    }, [rowBusy]);

    useEffect(() => {
      if (!blockedBatchBusy) return undefined;
      rowStartedRef.current = Date.now();
      setRowElapsed(0);
      setRowStep(0);
      const tick = window.setInterval(() => {
        const sec = Math.floor((Date.now() - rowStartedRef.current) / 1000);
        setRowElapsed(sec);
        setRowStep(Math.floor(sec / 4));
      }, 500);
      return () => window.clearInterval(tick);
    }, [blockedBatchBusy?.currentId, blockedBatchBusy?.done]);

    const loadQueue = useCallback(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminFetch('/api/admin/translations?maxScan=500&pendingLimit=50&approvalLimit=100&blockedLimit=100', token);
        setQueue(res);
        setSelectedApproval(new Set());
        setSelectedBlocked(new Set());
        return res;
      } catch (err) {
        setError(err.message || t('loadQueueFailed'));
        return null;
      } finally {
        setLoading(false);
      }
    }, [token, t]);

    useEffect(() => { loadQueue(); }, [loadQueue, reloadKey]);

    const runBatch = async () => {
      setRunning(true);
      setRunResult(null);
      setError('');
      try {
        const res = await adminFetch('/api/admin/translations', token, {
          method: 'POST',
          body: { action: 'run-batch', maxActivities: batchSize },
        });
        setRunResult(res);
        loadQueue();
      } catch (err) {
        setError(err.message || t('batchFailed'));
      } finally {
        setRunning(false);
      }
    };

    const syncOne = async (bokunActivityId, { force = false } = {}) => {
      setRowBusy(bokunActivityId);
      setError('');
      try {
        await adminFetch('/api/admin/translations', token, {
          method: 'POST',
          body: {
            action: 'sync-activities',
            activityIds: [Number(bokunActivityId)],
            force: force === true,
            maxTranslations: 80,
          },
        });
        loadQueue();
      } catch (err) {
        setError(err.message || 'Sync failed');
      } finally {
        setRowBusy(null);
      }
    };

    async function syncBlockedBatch(ids) {
      const list = [...ids].map(String).filter(Boolean);
      if (!list.length) return;
      setBlockedBatchNote('');
      setError('');
      let ok = 0;
      const failed = [];
      setBlockedBatchBusy({ done: 0, total: list.length, currentId: list[0] });
      try {
        for (let i = 0; i < list.length; i += 1) {
          const id = list[i];
          setBlockedBatchBusy({ done: i, total: list.length, currentId: id });
          try {
            // eslint-disable-next-line no-await-in-loop
            await adminFetch('/api/admin/translations', token, {
              method: 'POST',
              body: {
                action: 'sync-activities',
                activityIds: [Number(id)],
                force: true,
                maxTranslations: 80,
              },
            });
            ok += 1;
          } catch (err) {
            failed.push(`${id}: ${err.message || 'Sync failed'}`);
          }
        }
        if (failed.length) {
          setError(failed.slice(0, 5).join(' · '));
        }
        await loadQueue();
        setBlockedBatchNote(t('batchRetranslateBlockedResult', {
          ok: formatNumber(ok),
          failed: failed.length ? ` · ${failed.length} failed` : '',
        }));
      } finally {
        setBlockedBatchBusy(null);
      }
    }

    function toggleBlockedSelect(id, on) {
      setSelectedBlocked((prev) => {
        const next = new Set(prev);
        if (on) next.add(String(id));
        else next.delete(String(id));
        return next;
      });
    }

    async function approveListing(bokunActivityId, lang) {
      const busyKey = `${bokunActivityId}:${lang}`;
      setTrustBusy(busyKey);
      setError('');
      setBatchTrustNote('');
      try {
        const res = await adminFetch('/api/admin/translations/trust', token, {
          method: 'POST',
          body: { activityIds: [String(bokunActivityId)], lang, trusted: true },
        });
        const row = (res.results || []).find((r) => String(r.id) === String(bokunActivityId));
        if (row && !row.ok) {
          throw new Error(row.error || row.audit?.message || t('translationTrustFailed'));
        }
        loadQueue();
      } catch (err) {
        setError(err.message || t('translationTrustFailed'));
      } finally {
        setTrustBusy(null);
      }
    }

    const approveFromEditor = async (id, lang) => {
      await approveListing(id, lang);
      if (String(translationEditorId) !== String(id)) return null;
      try {
        return await adminFetch(
          `/api/admin/translations/edit?bokunActivityId=${encodeURIComponent(id)}`,
          token,
        );
      } catch {
        return null;
      }
    };

    async function approveListingBatch(lang, { ids } = {}) {
      const rows = filteredApprovalRows;
      const sourceIds = ids && ids.length ? ids : [...selectedApproval];
      const eligible = sourceIds
        .filter((id) => {
          const row = rows.find((r) => String(r.bokunActivityId) === String(id));
          return row?.approval?.[lang]?.readyToApprove;
        });
      if (!eligible.length) return;
      const liveBefore = lang === 'hant'
        ? (queue?.approvalSummary?.liveHant ?? 0)
        : (queue?.approvalSummary?.liveHans ?? 0);
      setTrustBusy(`batch:${lang}`);
      setError('');
      setBatchTrustNote('');
      let ok = 0;
      const failed = [];
      try {
        for (let i = 0; i < eligible.length; i += 50) {
          const chunk = eligible.slice(i, i + 50);
          // eslint-disable-next-line no-await-in-loop
          const res = await adminFetch('/api/admin/translations/trust', token, {
            method: 'POST',
            body: { activityIds: chunk.map(String), lang, trusted: true },
          });
          (res.results || []).forEach((r) => {
            if (r.ok) ok += 1;
            else failed.push(`${r.id}: ${r.error || r.audit?.message || t('translationTrustFailed')}`);
          });
        }
        if (failed.length) {
          setError(failed.slice(0, 5).join(' · '));
        }
        const refreshed = await loadQueue();
        const liveAfter = lang === 'hant'
          ? (refreshed?.approvalSummary?.liveHant ?? liveBefore)
          : (refreshed?.approvalSummary?.liveHans ?? liveBefore);
        const delta = Math.max(0, liveAfter - liveBefore);
        const resultKey = lang === 'hans' ? 'batchApproveResultHans' : 'batchApproveResult';
        setBatchTrustNote(t(resultKey, {
          ok: formatNumber(ok),
          failed: failed.length ? ` · ${failed.length} failed` : '',
          liveBefore: formatNumber(liveBefore),
          liveAfter: formatNumber(liveAfter),
          delta: formatNumber(delta),
        }));
      } catch (err) {
        setError(err.message || t('translationTrustFailed'));
      } finally {
        setTrustBusy(null);
      }
    }

    function approveAllReady(lang) {
      const ids = filteredApprovalRows
        .filter((row) => row.approval?.[lang]?.readyToApprove)
        .map((row) => String(row.bokunActivityId));
      if (!ids.length) return;
      approveListingBatch(lang, { ids });
    }

    function toggleApprovalSelect(id, on) {
      setSelectedApproval((prev) => {
        const next = new Set(prev);
        if (on) next.add(String(id));
        else next.delete(String(id));
        return next;
      });
    }

    const approvalSummary = queue?.approvalSummary;
    const filteredApprovalRows = (queue?.approvalQueue || []).filter((row) => (
      !bothLangsOnly
      || (row.approval?.hant?.readyToApprove && row.approval?.hans?.readyToApprove)
    ));
    const selectedHantCount = [...selectedApproval].filter((id) => {
      const row = filteredApprovalRows.find((r) => String(r.bokunActivityId) === String(id));
      return row?.approval?.hant?.readyToApprove;
    }).length;
    const selectedHansCount = [...selectedApproval].filter((id) => {
      const row = filteredApprovalRows.find((r) => String(r.bokunActivityId) === String(id));
      return row?.approval?.hans?.readyToApprove;
    }).length;
    const blockedRows = queue?.blockedQueue || [];
    const selectedBlockedCount = selectedBlocked.size;
    const rowBusyFromBlocked = !!(rowBusy && blockedRows.some(
      (r) => String(r.bokunActivityId) === String(rowBusy),
    ));
    const anyTranslateBusy = running || !!rowBusy || !!blockedBatchBusy;

    const cov = queue && queue.coverage;
    const stats = queue && queue.stats;

    return (
      <div>
        {translationEditorId ? (
          <TranslationEditorModal
            token={token}
            bokunActivityId={translationEditorId}
            t={t}
            trustBusy={trustBusy}
            onClose={() => setTranslationEditorId(null)}
            onSaved={loadQueue}
            onApprove={approveFromEditor}
          />
        ) : null}
        <h1 className="admin-page-title">{t('translationsTitle')}</h1>
        <p className="admin-page-sub">
          {t('translationsSub', { n: formatNumber(queue?.activeActivities) })}
          {queue?.scannedAt ? ` · ${formatDateTime(queue.scannedAt)}` : ''}.
        </p>

        <p className="admin-page-sub" style={{ marginTop: -8 }}>
          {t('translationVerifyPolicy')}
        </p>
        <LocaleApprovalSummary summary={approvalSummary} activeActivities={queue?.activeActivities} t={t} />

        <div className="admin-grid" style={{ marginBottom: 20 }}>
          <div className="admin-card">
            <div className="admin-card__label">{t('fieldCoverage')}</div>
            <div className="admin-card__value">{cov ? `${cov.percentComplete}%` : '—'}</div>
            <div className="admin-card__hint">
              {cov ? `${formatNumber(cov.translatedFields)} / ${formatNumber(cov.requiredFields)} fields` : '—'}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('queueDepthLabel')}</div>
            <div className="admin-card__value">{formatNumber(stats?.queueDepth)}</div>
            <div className="admin-card__hint">{t('queueDepthHint')}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('fullyTranslated')}</div>
            <div className="admin-card__value">{formatNumber(stats?.complete)}</div>
            <div className="admin-card__hint">{formatNumber(stats?.partial)} partial · {formatNumber(stats?.pending)} empty</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">{t('cronEstimate')}</div>
            <div className="admin-card__value">{queue?.cron?.estimatedRunsToClear ?? '—'}</div>
            <div className="admin-card__hint">runs @ {queue?.cron?.maxActivitiesPerRun || 12}/batch · {queue?.cron?.schedule || 'every 6h'}</div>
          </div>
        </div>

        <section className={`admin-sync-panel${running ? ' admin-sync-panel--busy' : ''}`}>
          <h2>{t('runTranslationBatch')}</h2>
          <p>{t('runTranslationBatchDesc')}</p>
          <div className="admin-sync-actions">
            <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {t('batchSize')}
              <input
                type="number"
                min={1}
                max={30}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.min(30, Math.max(1, Number(e.target.value) || 12)))}
                disabled={anyTranslateBusy}
                style={{ width: 56 }}
              />
            </label>
            <button
              type="button"
              className={`admin-btn${running ? ' admin-btn--loading' : ''}`}
              onClick={runBatch}
              disabled={anyTranslateBusy}
            >
              {running ? (
                <>
                  <span className="admin-sync-spinner" aria-hidden="true" />
                  {t('translating')} {batchElapsed}s
                </>
              ) : (
                t('runBatchNow')
              )}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={loadQueue} disabled={anyTranslateBusy || loading}>
              {t('refreshQueue')}
            </button>
          </div>
          {running ? (
            <TranslationBatchRunning
              elapsedSec={batchElapsed}
              stepIndex={batchStep}
              batchSize={batchSize}
              queueDepth={queueDepth}
              progressPct={batchProgressPct}
              estimatedSec={batchEstimateSec}
              t={t}
            />
          ) : null}
          {rowBusy && !running && !rowBusyFromBlocked ? (
            <TranslationRowRunning
              activityId={rowBusy}
              elapsedSec={rowElapsed}
              stepIndex={rowStep}
              t={t}
            />
          ) : null}
          {runResult && runResult.summary && !running ? (
            <div className="admin-sync-result" style={{ marginTop: 14 }}>
              <div className="admin-sync-result__header">
                <span className="admin-sync-result__icon" aria-hidden="true">✓</span>
                <div>
                  <strong>Batch complete</strong>
                  <span className="admin-sync-result__meta">
                    {formatNumber(runResult.summary.translated)} fields translated ·{' '}
                    {formatNumber(runResult.summary.skipped)} skipped ·{' '}
                    {formatNumber(runResult.summary.pendingActivities)} activities processed
                    {runResult.summary.coveragePercent != null
                      ? ` · coverage now ~${runResult.summary.coveragePercent}%`
                      : ''}
                    {runResult.summary.transientErrors != null || runResult.summary.permanentErrors != null
                      ? ` · errors T:${formatNumber(runResult.summary.transientErrors || 0)} / P:${formatNumber(runResult.summary.permanentErrors || 0)}`
                      : ''}
                  </span>
                </div>
              </div>
              {runResult.summary.activityIds && runResult.summary.activityIds.length ? (
                <p className="admin-sync-running__hint" style={{ marginTop: 10 }}>
                  Activity IDs: {runResult.summary.activityIds.join(', ')}
                </p>
              ) : null}
              {runResult.summary.errors && runResult.summary.errors.length ? (
                <pre className="admin-pre" style={{ marginTop: 10 }}>{JSON.stringify(runResult.summary.errors, null, 2)}</pre>
              ) : null}
              {runResult.summary.dlq && runResult.summary.dlq.length ? (
                <div className="admin-result admin-result--warn" style={{ marginTop: 10 }}>
                  DLQ candidates ({runResult.summary.dlq.length}): repeated failures, retry manually from queue after upstream stabilizes.
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}
        {batchTrustNote ? (
          <div
            className="admin-result"
            style={{
              marginBottom: 12,
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
            }}
          >
            {batchTrustNote}
          </div>
        ) : null}
        {blockedBatchNote ? (
          <div
            className="admin-result"
            style={{
              marginBottom: 12,
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
            }}
          >
            {blockedBatchNote}
          </div>
        ) : null}

        <h2 style={{ fontSize: 16, margin: '8px 0 8px' }}>{t('approvalQueueTitle')}</h2>
        <p className="admin-page-sub" style={{ marginTop: 0, marginBottom: 8 }}>{t('approvalQueueSub')}</p>
        <p className="admin-page-sub" style={{ marginTop: 0, marginBottom: 12 }}>{t('approvalVerifyHint')}</p>
        <div className="admin-sync-actions" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={bothLangsOnly}
              onChange={(e) => setBothLangsOnly(e.target.checked)}
              disabled={loading || anyTranslateBusy || !!trustBusy}
            />
            {t('approvalBothLangsOnly')}
          </label>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={loading || anyTranslateBusy || !!trustBusy || !filteredApprovalRows.length}
            onClick={() => setSelectedApproval(new Set(filteredApprovalRows.map((r) => String(r.bokunActivityId))))}
          >
            {t('batchApproveSelectAll')}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            disabled={!selectedApproval.size || !!trustBusy}
            onClick={() => setSelectedApproval(new Set())}
          >
            {t('batchApproveClear')}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!selectedHantCount || anyTranslateBusy || trustBusy === 'batch:hant'}
            onClick={() => approveListingBatch('hant')}
          >
            {trustBusy === 'batch:hant' ? '…' : `${t('batchApproveHantBtn')} (${selectedHantCount})`}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!(approvalSummary?.readyHant) || anyTranslateBusy || !!trustBusy}
            onClick={() => approveAllReady('hant')}
          >
            {trustBusy === 'batch:hant' ? '…' : `${t('batchApproveAllReadyHant')} (${formatNumber(approvalSummary?.readyHant || 0)})`}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!selectedHansCount || anyTranslateBusy || trustBusy === 'batch:hans'}
            onClick={() => approveListingBatch('hans')}
          >
            {trustBusy === 'batch:hans' ? '…' : `${t('batchApproveHansBtn')} (${selectedHansCount})`}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!(approvalSummary?.readyHans) || anyTranslateBusy || !!trustBusy}
            onClick={() => approveAllReady('hans')}
          >
            {trustBusy === 'batch:hans' ? '…' : `${t('batchApproveAllReadyHans')} (${formatNumber(approvalSummary?.readyHans || 0)})`}
          </button>
        </div>
        <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
          {loading ? <div className="admin-empty">{t('scanningCatalog')}</div> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }} aria-label="Select" />
                  <th>{t('navActivities')}</th>
                  <th>ID</th>
                  <th>{t('thApprovalHant')}</th>
                  <th>{t('thApprovalHans')}</th>
                  <th>{t('thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {!filteredApprovalRows.length ? (
                  <tr><td colSpan="6" className="admin-empty">{t('queueEmpty')}</td></tr>
                ) : filteredApprovalRows.map((row) => {
                  const id = String(row.bokunActivityId);
                  const hant = row.approval?.hant;
                  const hans = row.approval?.hans;
                  return (
                    <tr key={`approve-${id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedApproval.has(id)}
                          onChange={(e) => toggleApprovalSelect(id, e.target.checked)}
                          disabled={!!trustBusy || anyTranslateBusy}
                        />
                      </td>
                      <td><strong>{row.title}</strong></td>
                      <td>{id}</td>
                      <td><LocaleApprovalBadge ap={hant} t={t} localeTag={t('localeTagHant')} /></td>
                      <td><LocaleApprovalBadge ap={hans} t={t} localeTag={t('localeTagHans')} /></td>
                      <td className="admin-health-issues__actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={anyTranslateBusy || !!trustBusy}
                          onClick={() => setTranslationEditorId(id)}
                        >
                          {t('editTranslationBtn')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          title={t('previewTranslationHantHint')}
                          onClick={() => openTranslationPreview(id, 'hant')}
                        >
                          {t('previewTranslationHantBtn')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          title={t('previewTranslationHansHint')}
                          onClick={() => openTranslationPreview(id, 'hans')}
                        >
                          {t('previewTranslationHansBtn')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={!hant?.readyToApprove || trustBusy === `${id}:hant` || anyTranslateBusy || !!trustBusy}
                          onClick={() => approveListing(id, 'hant')}
                          title={hant?.readyToApprove ? t('approveTranslationHantHint') : (hant?.message || t('translationTrustFailed'))}
                        >
                          {trustBusy === `${id}:hant` ? '…' : t('approveTranslationHantBtn')}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={!hans?.readyToApprove || trustBusy === `${id}:hans` || anyTranslateBusy || !!trustBusy}
                          onClick={() => approveListing(id, 'hans')}
                          title={hans?.readyToApprove ? t('approveTranslationHansHint') : (hans?.message || t('translationTrustFailed'))}
                        >
                          {trustBusy === `${id}:hans` ? '…' : t('approveTranslationHansBtn')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {(queue?.blockedQueue?.length > 0) ? (
          <>
            <h2 style={{ fontSize: 16, margin: '24px 0 8px' }}>{t('blockedQueueTitle')}</h2>
            <p className="admin-page-sub" style={{ marginTop: 0, marginBottom: 8 }}>
              {t('blockedQueueSub', {
                liveHant: formatNumber(approvalSummary?.liveHant),
                liveHans: formatNumber(approvalSummary?.liveHans),
                total: formatNumber(queue?.activeActivities),
              })}
            </p>
            <p className="admin-page-sub" style={{ marginTop: 0, marginBottom: 12 }}>
              {t('batchRetranslateBlockedHint')}
            </p>
            {blockedBatchBusy ? (
              <AdminJobRunning
                title={t('batchRetranslateBlockedProgress', {
                  done: formatNumber(blockedBatchBusy.done + 1),
                  total: formatNumber(blockedBatchBusy.total),
                  id: blockedBatchBusy.currentId,
                })}
                step={TRANSLATION_ROW_STEPS[rowStep % TRANSLATION_ROW_STEPS.length]}
                elapsedSec={rowElapsed}
                progressPct={Math.min(
                  95,
                  Math.round(((blockedBatchBusy.done + 0.5) / blockedBatchBusy.total) * 100),
                )}
                hint={t('batchRetranslateBlockedHint')}
              />
            ) : null}
            {rowBusyFromBlocked && !blockedBatchBusy ? (
              <div style={{ marginBottom: 12 }}>
                <TranslationRowRunning
                  activityId={rowBusy}
                  elapsedSec={rowElapsed}
                  stepIndex={rowStep}
                  t={t}
                />
              </div>
            ) : null}
            <div className="admin-sync-actions" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={loading || anyTranslateBusy || !!trustBusy || !blockedRows.length}
                onClick={() => setSelectedBlocked(new Set(blockedRows.map((r) => String(r.bokunActivityId))))}
              >
                {t('batchApproveSelectAll')}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={!selectedBlockedCount || anyTranslateBusy || !!trustBusy}
                onClick={() => setSelectedBlocked(new Set())}
              >
                {t('batchApproveClear')}
              </button>
              <button
                type="button"
                className={`admin-btn admin-btn--sm${blockedBatchBusy ? ' admin-btn--loading' : ''}`}
                disabled={!selectedBlockedCount || anyTranslateBusy || !!trustBusy}
                onClick={() => syncBlockedBatch([...selectedBlocked])}
              >
                {blockedBatchBusy ? (
                  <>
                    <span className="admin-sync-spinner" aria-hidden="true" />
                    {t('batchRetranslateBusyBtn')}
                  </>
                ) : (
                  `${t('batchRetranslateBlockedBtn')} (${formatNumber(selectedBlockedCount)})`
                )}
              </button>
              <button
                type="button"
                className={`admin-btn admin-btn--sm${blockedBatchBusy ? ' admin-btn--loading' : ''}`}
                disabled={!blockedRows.length || anyTranslateBusy || !!trustBusy}
                onClick={() => syncBlockedBatch(blockedRows.map((r) => r.bokunActivityId))}
              >
                {blockedBatchBusy ? (
                  <>
                    <span className="admin-sync-spinner" aria-hidden="true" />
                    {t('batchRetranslateBusyBtn')}
                  </>
                ) : (
                  `${t('batchRetranslateAllBlockedBtn')} (${formatNumber(blockedRows.length)})`
                )}
              </button>
            </div>
            <div className="admin-table-wrap" style={{ marginBottom: 28 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }} aria-label="Select" />
                    <th>{t('navActivities')}</th>
                    <th>ID</th>
                    <th>{t('thApprovalHant')}</th>
                    <th>{t('thApprovalHans')}</th>
                    <th>{t('thBlockReason')}</th>
                    <th>{t('thActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.blockedQueue.map((row) => {
                    const id = String(row.bokunActivityId);
                    return (
                      <tr key={`blocked-${id}`}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBlocked.has(id)}
                            onChange={(e) => toggleBlockedSelect(id, e.target.checked)}
                            disabled={anyTranslateBusy || !!trustBusy}
                          />
                        </td>
                        <td><strong>{row.title}</strong></td>
                        <td>{id}</td>
                        <td><LocaleApprovalBadge ap={row.approval?.hant} t={t} localeTag={t('localeTagHant')} /></td>
                        <td><LocaleApprovalBadge ap={row.approval?.hans} t={t} localeTag={t('localeTagHans')} /></td>
                        <td style={{ fontSize: 12, maxWidth: 320 }}>{row.blockHint || '—'}</td>
                        <td className="admin-health-issues__actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={anyTranslateBusy || !!trustBusy}
                            onClick={() => setTranslationEditorId(id)}
                          >
                            {t('editTranslationBtn')}
                          </button>
                          <button
                            type="button"
                            className={`admin-btn admin-btn--ghost admin-btn--sm${rowBusy === id ? ' admin-btn--loading' : ''}`}
                            disabled={rowBusy === id || anyTranslateBusy}
                            onClick={() => syncOne(id, { force: true })}
                          >
                            {rowBusy === id ? (
                              <>
                                <span className="admin-sync-spinner" aria-hidden="true" />
                                {`${rowElapsed}s`}
                              </>
                            ) : (
                              t('translateOne')
                            )}
                          </button>
                          <a
                            href={`/tours/${id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                          >
                            {t('healthViewTour')}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <h2 style={{ fontSize: 16, margin: '8px 0 12px' }}>{t('pendingQueue')}</h2>
        <div className="admin-table-wrap">
          {loading ? <div className="admin-empty">{t('scanningCatalog')}</div> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('navActivities')}</th>
                  <th>ID</th>
                  <th>{t('thCoverage')}</th>
                  <th>{t('thMissing')}</th>
                  <th>{t('thStale')}</th>
                  <th>{t('thApprovalHant')}</th>
                  <th>{t('thApprovalHans')}</th>
                  <th>{t('thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {!queue?.pending?.length ? (
                  <tr><td colSpan="8" className="admin-empty">{t('queueEmpty')}</td></tr>
                ) : queue.pending.map((row) => (
                  <tr key={row.bokunActivityId}>
                    <td><strong>{row.title}</strong></td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.percent}%</td>
                    <td>{formatNumber(row.missing)}</td>
                    <td>{formatNumber(row.stale)}</td>
                    <td><LocaleApprovalBadge ap={row.approval?.hant} t={t} localeTag={t('localeTagHant')} /></td>
                    <td><LocaleApprovalBadge ap={row.approval?.hans} t={t} localeTag={t('localeTagHans')} /></td>
                    <td className="admin-health-issues__actions">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        disabled={rowBusy === row.bokunActivityId || anyTranslateBusy}
                        onClick={() => syncOne(row.bokunActivityId)}
                      >
                        {rowBusy === row.bokunActivityId ? `… ${rowElapsed}s` : t('translateBtn')}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        title={t('previewTranslationHantHint')}
                        onClick={() => openTranslationPreview(row.bokunActivityId, 'hant')}
                      >
                        {t('previewTranslationHantBtn')}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        title={t('previewTranslationHansHint')}
                        onClick={() => openTranslationPreview(row.bokunActivityId, 'hans')}
                      >
                        {t('previewTranslationHansBtn')}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        disabled={
                          !(row.approval?.hant?.readyToApprove)
                          || trustBusy === `${row.bokunActivityId}:hant`
                          || running
                          || !!rowBusy
                          || !!trustBusy
                        }
                        onClick={() => approveListing(row.bokunActivityId, 'hant')}
                        title={
                          row.approval?.hant?.readyToApprove
                            ? t('approveTranslationHantHint')
                            : (row.approval?.hant?.message || t('translationTrustFailed'))
                        }
                      >
                        {trustBusy === `${row.bokunActivityId}:hant` ? '…' : t('approveTranslationHantBtn')}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        disabled={
                          !(row.approval?.hans?.readyToApprove)
                          || trustBusy === `${row.bokunActivityId}:hans`
                          || running
                          || !!rowBusy
                          || !!trustBusy
                        }
                        onClick={() => approveListing(row.bokunActivityId, 'hans')}
                        title={
                          row.approval?.hans?.readyToApprove
                            ? t('approveTranslationHansHint')
                            : (row.approval?.hans?.message || t('translationTrustFailed'))
                        }
                      >
                        {trustBusy === `${row.bokunActivityId}:hans` ? '…' : t('approveTranslationHansBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ---------------- Health page ----------------
  function CatalogQualityIssues({ check, t, token, onRefresh }) {
    if (!check || check.id !== 'catalog-quality') return null;
    const priceRows = (check.issues && check.issues.priceImplausible) || [];
    const untrustedRows = (check.issues && check.issues.priceUntrusted) || [];
    const missingRows = (check.issues && check.issues.missingV2Detail) || [];
    const pickupHosted = Number(check.pickupHostedOnly) || 0;
    const [verifyBusy, setVerifyBusy] = useState(false);
    if (!priceRows.length && !untrustedRows.length && !missingRows.length && !pickupHosted) return null;

    const minUsd = check.minPlausibleUsd != null ? check.minPlausibleUsd : 12;

    function copyId(id) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(id)).catch(() => {});
      }
    }

    async function postPriceAction(path, ids, extra = {}) {
      if (!token || !ids.length) return;
      setVerifyBusy(true);
      try {
        await adminFetch(path, token, {
          method: 'POST',
          body: { activityIds: ids.slice(0, 50), ...extra },
        });
        if (onRefresh) onRefresh();
      } catch (err) {
        console.warn('[admin] price action', err.message || err);
      } finally {
        setVerifyBusy(false);
      }
    }

    function issueTable(rows, { showMaxUsd = false, showRefUsd = false, showReason = false } = {}) {
      if (!rows.length) return null;
      return (
        <div className="admin-table-wrap admin-health-issues__table">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('healthColActivityId')}</th>
                <th>{t('healthColTitle')}</th>
                {showMaxUsd ? <th>{t('healthColMaxUsd')}</th> : null}
                {showRefUsd ? <th>{t('healthColRefUsd')}</th> : null}
                {showReason ? <th>{t('healthColReason')}</th> : null}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><code>{row.id}</code></td>
                  <td>{row.title || '—'}</td>
                  {showMaxUsd ? (
                    <td>{Number.isFinite(Number(row.maxDisplayUsd)) ? `$${row.maxDisplayUsd}` : '—'}</td>
                  ) : null}
                  {showRefUsd ? (
                    <td>{row.source || '—'}</td>
                  ) : null}
                  {showReason ? (
                    <td><code>{row.reason || '—'}</code></td>
                  ) : null}
                  <td className="admin-health-issues__actions">
                    <a href={`/tours/${row.id}`} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--ghost admin-btn--sm">
                      {t('healthViewTour')}
                    </a>
                    <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => copyId(row.id)}>
                      {t('healthCopyId')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="admin-health-issues">
        {priceRows.length > 0 ? (
          <div className="admin-health-issues__block">
            <p className="admin-health-issues__hint">{t('healthImplausiblePriceHint', { min: minUsd })}</p>
            <p style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={verifyBusy}
                onClick={() => postPriceAction(
                  '/api/admin/prices/trust',
                  priceRows.map((r) => r.id),
                  { trusted: true, note: 'Admin verified catalog price vs Bókun' },
                )}
              >
                {verifyBusy ? '…' : t('healthTrustPricesBtn')}
              </button>
            </p>
            {issueTable(priceRows, { showMaxUsd: true })}
          </div>
        ) : null}
        {untrustedRows.length > 0 ? (
          <div className="admin-health-issues__block">
            <p className="admin-health-issues__hint">{t('healthUntrustedPriceHint')}</p>
            <p style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                disabled={verifyBusy}
                onClick={() => postPriceAction('/api/admin/prices/verify', untrustedRows.map((r) => r.id))}
              >
                {verifyBusy ? '…' : t('healthVerifyPricesBtn')}
              </button>
            </p>
            {issueTable(untrustedRows, { showMaxUsd: true, showRefUsd: true, showReason: true })}
          </div>
        ) : null}
        {missingRows.length > 0 ? (
          <div className="admin-health-issues__block">
            <p className="admin-health-issues__hint">{t('healthMissingV2Hint')}</p>
            {issueTable(missingRows, {})}
          </div>
        ) : null}
        {pickupHosted > 0 ? (
          <p className="admin-health-issues__note">{t('healthPickupHostedNote', { n: pickupHosted })}</p>
        ) : null}
      </div>
    );
  }

  function HealthPage({ token, overview, t }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [heavyLoading, setHeavyLoading] = useState(false);
    const [error, setError] = useState('');

    function overallFromChecks(checks) {
      if (checks.some((c) => c.status === 'fail')) return 'unhealthy';
      if (checks.some((c) => c.status === 'warn')) return 'degraded';
      return 'healthy';
    }

    function mergeHealthReports(fast, heavy) {
      if (!fast) return heavy;
      if (!heavy) return fast;
      const checkMap = new Map();
      (fast.checks || []).forEach((c) => checkMap.set(c.id, c));
      (heavy.checks || []).forEach((c) => checkMap.set(c.id, c));
      const checks = [...checkMap.values()];
      return {
        ...fast,
        ...heavy,
        checks,
        overall: overallFromChecks(checks),
        env: fast.env || heavy.env,
        translation: heavy.translation ?? fast.translation,
        generatedAt: heavy.generatedAt || fast.generatedAt,
      };
    }

    const loadHealth = useCallback(() => {
      setLoading(true);
      setHeavyLoading(true);
      setError('');
      setReport(null);

      adminFetch('/api/admin/health?mode=fast', token)
        .then((res) => setReport(res))
        .catch((err) => setError(err.message || t('healthCheckFailed')))
        .finally(() => setLoading(false));

      adminFetch('/api/admin/health?mode=heavy', token)
        .then((res) => setReport((prev) => mergeHealthReports(prev, res)))
        .catch((err) => {
          setReport((prev) => ({
            ...(prev || {}),
            translation: { error: err.message || t('healthCheckFailed') },
          }));
        })
        .finally(() => setHeavyLoading(false));
    }, [token, t]);

    useEffect(() => { loadHealth(); }, [loadHealth]);

    const env = (report && report.env) || overview?.env || {};

    function flagBadge(b) {
      return b
        ? <span className="admin-badge admin-badge--ok">{t('envSet')}</span>
        : <span className="admin-badge admin-badge--err">{t('envMissing')}</span>;
    }

    function checkStatusClass(status) {
      if (status === 'ok') return 'admin-health-check--ok';
      if (status === 'warn') return 'admin-health-check--warn';
      return 'admin-health-check--fail';
    }

    const overall = report?.overall || 'unknown';
    const translationCheck = (report?.checks || []).find((c) => c.id === 'translation-queue');
    const translationBanner = (() => {
      if (heavyLoading && !report?.translation) {
        return t('healthTranslationLoading');
      }
      if (report?.translation?.error) {
        return t('healthTranslationError', { msg: report.translation.error });
      }
      if (report?.translation && Number.isFinite(Number(report.translation.queueDepth))) {
        return t('healthTranslationSummary', {
          queue: formatNumber(report.translation.queueDepth),
          pct: Number.isFinite(Number(report.translation.percentComplete))
            ? report.translation.percentComplete
            : '—',
        });
      }
      if (translationCheck?.message) return translationCheck.message;
      return null;
    })();

    return (
      <div>
        <h1 className="admin-page-title">{t('healthTitle')}</h1>
        <p className="admin-page-sub">{t('healthSub')}</p>

        <div className="admin-sync-actions" style={{ marginBottom: 16 }}>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={loadHealth} disabled={loading || heavyLoading}>
            {loading || heavyLoading ? t('checking') : t('rerunChecks')}
          </button>
          {report?.generatedAt ? (
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t('lastRun')} {formatDateTime(report.generatedAt)}</span>
          ) : null}
          {heavyLoading ? (
            <span style={{ fontSize: 12, color: 'var(--fg-3)', marginLeft: 8 }}>{t('healthHeavyLoading')}</span>
          ) : null}
        </div>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}

        {report ? (
          <div className={`admin-health-banner admin-health-banner--${overall}`}>
            <strong>{t('healthOverall')}: {overall === 'healthy' ? t('healthHealthy') : overall === 'degraded' ? t('healthDegraded') : overall === 'unhealthy' ? t('healthUnhealthy') : overall}</strong>
            {translationBanner ? (
              <span style={{ marginLeft: 12, fontWeight: 400 }}>
                {translationBanner}
              </span>
            ) : null}
          </div>
        ) : null}

        {report && report.checks ? (
          <div className="admin-health-checks">
            {report.checks.map((c) => (
              <div key={c.id} className={`admin-health-check ${checkStatusClass(c.status)}`}>
                <div className="admin-health-check__head">
                  <span className="admin-health-check__status">{c.status}</span>
                  <strong>{c.label}</strong>
                  {c.latencyMs > 0 ? <span className="admin-health-check__latency">{c.latencyMs} ms</span> : null}
                </div>
                <p>{c.message}</p>
                {c.id === 'catalog-quality' ? (
                  <CatalogQualityIssues check={c} t={t} token={token} onRefresh={loadHealth} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <h2 style={{ fontSize: 16, margin: '24px 0 12px' }}>{t('envVarsTitle')}</h2>
        <p className="admin-page-sub" style={{ marginTop: 0 }}>{t('envVarsSub')}</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Bókun API</th></tr>
              <tr><td>BOKUN_ACCESS_KEY</td><td>{flagBadge(env.bokun?.accessKey)}</td></tr>
              <tr><td>BOKUN_SECRET_KEY</td><td>{flagBadge(env.bokun?.secretKey)}</td></tr>
              <tr><td>BOKUN_API_HOST</td><td>{env.bokun?.apiHost || <span className="admin-badge admin-badge--off">{t('badgeDefault')}</span>}</td></tr>
              <tr><td>BOKUN_SHOP_URL</td><td>{env.bokun?.shopUrl || <span className="admin-badge admin-badge--err">{t('envMissing')}</span>}</td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Supabase</th></tr>
              <tr><td>SUPABASE_URL</td><td>{flagBadge(env.supabase?.url)}</td></tr>
              <tr><td>SUPABASE_ANON_KEY</td><td>{flagBadge(env.supabase?.anonKey)}</td></tr>
              <tr><td>SUPABASE_SERVICE_ROLE_KEY</td><td>{flagBadge(env.supabase?.serviceKey)}</td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>OpenAI</th></tr>
              <tr><td>OPENAI_API_KEY</td><td>{flagBadge(env.openai?.apiKey)}</td></tr>
              <tr><td>OPENAI_TRANSLATION_MODEL</td><td><code>{env.openai?.model || 'gpt-4o'}</code></td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Cron / Sync</th></tr>
              <tr><td>CRON_SECRET</td><td>{flagBadge(env.cron?.cronSecret)}</td></tr>
              <tr><td>CATALOG_SYNC_SECRET</td><td>{flagBadge(env.cron?.catalogSyncSecret)}</td></tr>
              <tr><td>TRANSLATION_SYNC_SECRET</td><td>{flagBadge(env.cron?.translationSyncSecret)}</td></tr>
              <tr><td>CATALOG_SOURCE</td><td><code>{env.catalog?.source}</code></td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Admin</th></tr>
              <tr><td>ADMIN_PASSWORD</td><td>{flagBadge(env.admin?.password)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------- Shell ----------------
  function AdminShell({ token, onLogout, prefs }) {
    const {
      lang,
      t,
      prefToolbar,
      formatDisplayPrice,
    } = prefs || {};
    const [tab, setTab] = useState('overview');
    const [navOpen, setNavOpen] = useState(false);
    const [overview, setOverview] = useState(null);
    const [overviewError, setOverviewError] = useState('');
    const [translationPending, setTranslationPending] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
      if (!navOpen) return undefined;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (e) => {
        if (e.key === 'Escape') setNavOpen(false);
      };
      window.addEventListener('keydown', onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onKey);
      };
    }, [navOpen]);

    const loadOverview = useCallback(() => {
      const cacheBust = `_=${Date.now()}`;
      return adminFetch(`/api/admin/overview?${cacheBust}`, token)
        .then((res) => {
          setOverview(res);
          setOverviewError('');
          return res;
        })
        .catch((err) => {
          const message = err.message || (t ? t('loadOverviewFailed') : 'Failed to load overview');
          setOverviewError(message);
          if (err.status === 401) onLogout();
          throw err;
        });
    }, [token, onLogout, t]);

    useEffect(() => { loadOverview().catch(() => {}); }, [loadOverview]);

    const loadTranslationPending = useCallback(() => {
      if (!token) return Promise.resolve();
      return adminFetch('/api/admin/translations?maxScan=200&pendingLimit=1', token)
        .then((res) => {
          const depth = res?.stats?.queueDepth;
          setTranslationPending(Number.isFinite(Number(depth)) ? Number(depth) : null);
        })
        .catch(() => setTranslationPending(null));
    }, [token]);

    useEffect(() => { loadTranslationPending(); }, [loadTranslationPending, reloadKey]);

    const refreshAll = useCallback(() => {
      return Promise.all([loadOverview(), loadTranslationPending()]).then(() => {
        setReloadKey((k) => k + 1);
      });
    }, [loadOverview, loadTranslationPending]);

    const counts = {
      vendors: overview?.vendors?.filter((v) => v.isActive).length,
      activities: overview?.activities?.active,
      inquiries: overview?.inquiries?.total,
      collections: overview?.marketing?.collectionsActive,
      translationPending,
    };
    const navItems = buildNavItems(t, counts);
    const activeNavLabel = (navItems.find((it) => it.id === tab) || navItems[0]).label;

    return (
      <div className={`admin-shell${navOpen ? ' admin-shell--nav-open' : ''}`}>
        <button
          type="button"
          className="admin-nav-overlay"
          aria-label={t('navClose')}
          onClick={() => setNavOpen(false)}
        />
        <Sidebar
          tab={tab}
          setTab={setTab}
          counts={counts}
          onLogout={onLogout}
          prefToolbar={prefToolbar}
          t={t}
          onNavSelect={() => setNavOpen(false)}
          onNavClose={() => setNavOpen(false)}
        />
        <div className="admin-body">
          <header className="admin-mobile-header">
            <button
              type="button"
              className="admin-mobile-header__menu"
              aria-expanded={navOpen}
              aria-label={t('navMenu')}
              onClick={() => setNavOpen(true)}
            >
              <span className="admin-mobile-header__menu-icon" aria-hidden="true" />
            </button>
            <div className="admin-mobile-header__title">{activeNavLabel}</div>
            <button type="button" className="admin-mobile-header__logout" onClick={onLogout}>
              {t('signOut')}
            </button>
          </header>
          <main className="admin-main">
          {prefToolbar ? (
            <div className="admin-topbar admin-topbar--mobile-only">{prefToolbar}</div>
          ) : null}
          {overviewError ? (
            <div className="admin-login__error" style={{ marginBottom: 16 }}>
              {overviewError}
            </div>
          ) : null}

          {tab === 'overview' && (
            <OverviewPage overview={overview} token={token} onRefresh={refreshAll} lang={lang} t={t} />
          )}
          {tab === 'vendors' && <VendorsPage overview={overview} lang={lang} t={t} />}
          {tab === 'activities' && (
            <ActivitiesPage
              token={token}
              vendors={overview?.vendors || []}
              reloadKey={reloadKey}
              formatDisplayPrice={formatDisplayPrice}
              lang={lang}
              t={t}
            />
          )}
          {tab === 'content' && (
            <ContentPage
              token={token}
              vendors={overview?.vendors}
              reloadKey={reloadKey}
              onRefresh={refreshAll}
              t={t}
            />
          )}
          {tab === 'marketing' && (
            <MarketingPage token={token} reloadKey={reloadKey} t={t} />
          )}
          {tab === 'inquiries' && <InquiriesPage token={token} lang={lang} t={t} />}
          {tab === 'translations' && (
            <TranslationsPage token={token} reloadKey={reloadKey} t={t} />
          )}
          {tab === 'health' && <HealthPage token={token} overview={overview} t={t} />}
          </main>
        </div>
      </div>
    );
  }

  function AuralisAdmin() {
    const [token, setToken] = useState(() => readToken());
    const prefs = useAdminPreferences();

    const onLoggedIn = (t) => setToken(t);
    const onLogout = () => { writeToken(''); setToken(''); };

    if (!token) {
      return <LoginScreen onLoggedIn={onLoggedIn} prefToolbar={prefs.prefToolbar} t={prefs.t} />;
    }
    return <AdminShell token={token} onLogout={onLogout} prefs={prefs} />;
  }

  window.AuralisAdmin = AuralisAdmin;
})();
