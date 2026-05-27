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

  function readToken() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function writeToken(token) {
    try {
      if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* noop */ }
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

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('zh-TW', { hour12: false });
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

  const CATALOG_SYNC_STEPS = [
    'Connecting to Bókun contract channel…',
    'Fetching product list from channel…',
    'Comparing source hashes…',
    'Upserting activities into Supabase…',
    'Updating vendor ↔ activity links…',
    'Syncing activity details (if enabled)…',
  ];

  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = Date.now() - t;
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
  function LoginScreen({ onLoggedIn }) {
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
          setError('Admin disabled — set ADMIN_PASSWORD in environment first.');
        } else if (err.status === 401) {
          setError('Incorrect password.');
        } else {
          setError(err.message || 'Login failed.');
        }
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="admin-login">
        <form className="admin-login__card" onSubmit={onSubmit}>
          <h1 className="admin-login__title">DJS Tour · Admin</h1>
          <p className="admin-login__sub">Catalog control room — sync, detail refresh, activate/deactivate.</p>

          {error ? <div className="admin-login__error">{error}</div> : null}

          <div className="admin-login__field">
            <label htmlFor="admin-password">Password</label>
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  // ---------------- Sidebar ----------------
  function Sidebar({ tab, setTab, counts, onLogout }) {
    const items = [
      { id: 'overview', label: 'Overview' },
      { id: 'vendors', label: 'Vendors', badge: counts.vendors },
      { id: 'activities', label: 'Activities', badge: counts.activities },
      { id: 'content', label: 'Content' },
      { id: 'marketing', label: 'Marketing', badge: counts.collections },
      { id: 'inquiries', label: 'Inquiries', badge: counts.inquiries },
      { id: 'translations', label: 'Translations', badge: counts.translationPending },
      { id: 'health', label: 'Health' },
    ];
    return (
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand__dot" />
          <span>DJS Tour · Admin</span>
        </div>
        {items.map((it) => (
          <button
            key={it.id}
            className={`admin-nav-item${tab === it.id ? ' is-active' : ''}`}
            onClick={() => setTab(it.id)}
          >
            <span>{it.label}</span>
            {it.badge != null ? <span className="admin-nav-badge">{formatNumber(it.badge)}</span> : null}
          </button>
        ))}
        <div className="admin-nav-spacer" />
        <div className="admin-sidebar__footer">
          Phase 5 · ops<br />
          <button onClick={onLogout}>Sign out</button>
        </div>
      </aside>
    );
  }

  function CatalogSyncRunning({ elapsedSec, stepIndex }) {
    const step = CATALOG_SYNC_STEPS[stepIndex % CATALOG_SYNC_STEPS.length];
    return (
      <div className="admin-sync-running" role="status" aria-live="polite">
        <div className="admin-sync-running__head">
          <span className="admin-sync-spinner admin-sync-spinner--lg" aria-hidden="true" />
          <div>
            <strong>Catalog sync in progress</strong>
            <p className="admin-sync-running__step">{step}</p>
          </div>
        </div>
        <div className="admin-sync-progress" aria-hidden="true">
          <div className="admin-sync-progress__bar" />
        </div>
        <p className="admin-sync-running__hint">
          Elapsed {elapsedSec}s · typical run 30–90s · keep this tab open
        </p>
      </div>
    );
  }

  function CatalogSyncResult({ result, options }) {
    const counts = result.counts || {};
    const timings = result.timings || {};
    const totalMs = timings.totalMs || 1;
    const fetchPct = timings.fetchMs ? Math.round((timings.fetchMs / totalMs) * 100) : 0;
    const writePct = timings.writeMs ? Math.round((timings.writeMs / totalMs) * 100) : 0;

    const stats = [
      { label: 'Unique in channel', value: counts.uniqueInChannel, tone: 'neutral' },
      { label: 'Contract products', value: counts.contractTotal, tone: 'neutral' },
      { label: 'Upserted', value: counts.upserted, tone: counts.upserted > 0 ? 'accent' : 'muted' },
      { label: 'Unchanged', value: counts.unchanged, tone: 'muted' },
      {
        label: 'Deactivated',
        value: counts.deactivated,
        tone: counts.deactivated > 0 ? 'warn' : 'muted',
      },
      { label: 'Vendor links', value: counts.vendorActivityLinks, tone: 'neutral' },
    ];

    if (options.syncImages || (counts.imageSynced != null && counts.imageSynced > 0)) {
      stats.push({
        label: 'Images mirrored',
        value: counts.imageSynced || 0,
        tone: counts.imageSynced > 0 ? 'accent' : 'muted',
      });
    }

    if (options.forceDetail || counts.detailSynced > 0 || counts.detailPending > 0) {
      const detailLabel = counts.detailErrors > 0
        ? `Detail synced (${counts.detailErrors} errors)`
        : 'Detail synced';
      stats.push({
        label: detailLabel,
        value: `${formatNumber(counts.detailSynced)} / ${formatNumber(counts.detailPending)}`,
        tone: counts.detailErrors > 0 ? 'warn' : 'neutral',
        raw: true,
      });
    }

    return (
      <div className="admin-sync-result">
        <div className="admin-sync-result__header">
          <span className="admin-sync-result__icon" aria-hidden="true">✓</span>
          <div>
            <strong>Sync complete</strong>
            <span className="admin-sync-result__meta">
              {formatNumber(counts.vendors)} vendor{counts.vendors === 1 ? '' : 's'}
              {' · '}
              finished in {formatDurationMs(timings.totalMs)}
            </span>
          </div>
        </div>

        <div className="admin-sync-result__stats">
          {stats.map((s) => (
            <div key={s.label} className={`admin-sync-stat admin-sync-stat--${s.tone}`}>
              <span className="admin-sync-stat__value">
                {s.raw ? s.value : formatNumber(s.value)}
              </span>
              <span className="admin-sync-stat__label">{s.label}</span>
            </div>
          ))}
        </div>

        {timings.fetchMs != null ? (
          <div className="admin-sync-result__timing">
            <div className="admin-sync-timing-row">
              <span>Bókun fetch</span>
              <span>{formatDurationMs(timings.fetchMs)}</span>
            </div>
            <div className="admin-sync-timing-bar" aria-hidden="true">
              <span className="admin-sync-timing-bar__fetch" style={{ width: `${fetchPct}%` }} />
              <span className="admin-sync-timing-bar__write" style={{ width: `${writePct}%` }} />
            </div>
            <div className="admin-sync-timing-row">
              <span>Process &amp; persist</span>
              <span>{formatDurationMs(timings.writeMs)}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------- Overview ----------------
  function OverviewPage({ overview, token, onRefresh }) {
    const [syncing, setSyncing] = useState(false);
    const [syncError, setSyncError] = useState('');
    const [syncResult, setSyncResult] = useState(null);
    const [syncElapsed, setSyncElapsed] = useState(0);
    const [syncStep, setSyncStep] = useState(0);
    const syncStartedRef = useRef(0);
    const [syncOpts, setSyncOpts] = useState({
      deactivateMissing: true,
      forceDetail: false,
      syncImages: false,
      maxDetailPerRun: 40,
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
        onRefresh();
      } catch (err) {
        setSyncError(err.message || 'Sync failed');
      } finally {
        setSyncing(false);
      }
    };

    if (!overview) return <div className="admin-empty">Loading…</div>;

    const { activities, vendors, totals, lastSyncedAt, inquiries } = overview;

    return (
      <div>
        <h1 className="admin-page-title">Overview</h1>
        <p className="admin-page-sub">
          Last activity sync: <strong>{formatDateTime(lastSyncedAt)}</strong>
          {lastSyncedAt ? <span> · {timeAgo(lastSyncedAt)}</span> : null}
        </p>

        <section className={`admin-sync-panel${syncing ? ' admin-sync-panel--busy' : ''}`}>
          <h2>Catalog sync</h2>
          <p>
            Pull the latest Bókun contract channel into Supabase. Typical runtime 30–90s;
            do not close this tab while running.
          </p>
          <div className="admin-sync-options">
            <label>
              <input
                type="checkbox"
                checked={syncOpts.deactivateMissing}
                onChange={(e) => setSyncOpts((o) => ({ ...o, deactivateMissing: e.target.checked }))}
                disabled={syncing}
              />
              Deactivate products no longer in channel
            </label>
            <label>
              <input
                type="checkbox"
                checked={syncOpts.forceDetail}
                onChange={(e) => setSyncOpts((o) => ({ ...o, forceDetail: e.target.checked }))}
                disabled={syncing}
              />
              Force detail re-fetch (slow)
            </label>
            <label>
              <input
                type="checkbox"
                checked={syncOpts.syncImages}
                onChange={(e) => setSyncOpts((o) => ({ ...o, syncImages: e.target.checked }))}
                disabled={syncing}
              />
              Mirror images to Supabase Storage
            </label>
            <label>
              Detail batch cap
              <input
                type="number"
                min={1}
                max={120}
                value={syncOpts.maxDetailPerRun}
                onChange={(e) => setSyncOpts((o) => ({
                  ...o,
                  maxDetailPerRun: Math.min(120, Math.max(1, Number(e.target.value) || 40)),
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
                  Syncing… {syncElapsed}s
                </>
              ) : (
                'Run catalog sync'
              )}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              onClick={onRefresh}
              disabled={syncing}
            >
              Refresh stats
            </button>
          </div>
          {syncing ? (
            <CatalogSyncRunning elapsedSec={syncElapsed} stepIndex={syncStep} />
          ) : null}
          {syncError ? (
            <div className="admin-result admin-result--error">{syncError}</div>
          ) : null}
          {syncResult && syncResult.counts && !syncing ? (
            <CatalogSyncResult result={syncResult} options={syncOpts} />
          ) : null}
        </section>

        <div className="admin-grid">
          <div className="admin-card">
            <div className="admin-card__label">Active activities</div>
            <div className="admin-card__value">{formatNumber(activities.active)}</div>
            <div className="admin-card__hint">{formatNumber(activities.inactive)} deactivated · {formatNumber(activities.total)} total</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Contract products</div>
            <div className="admin-card__value">{formatNumber(totals.contractTotal)}</div>
            <div className="admin-card__hint">across {formatNumber(vendors.length)} vendor{vendors.length === 1 ? '' : 's'}</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Unique products</div>
            <div className="admin-card__value">{formatNumber(totals.uniqueTotal)}</div>
            <div className="admin-card__hint">After dedup across vendors</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Inquiries</div>
            <div className="admin-card__value">{formatNumber(inquiries.last7d)}</div>
            <div className="admin-card__hint">{formatNumber(inquiries.total)} all-time · last 7d</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Abandoned checkouts</div>
            <div className="admin-card__value">{formatNumber(inquiries.abandoned)}</div>
            <div className="admin-card__hint">Hosted Bókun · open follow-up · &gt;1h</div>
          </div>
        </div>

        <h2 style={{ fontSize: 16, margin: '8px 0 12px', color: 'var(--fg-1)' }}>Vendor breakdown</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Bókun ID</th>
                <th>Contracts</th>
                <th>Unique</th>
                <th>Last sync</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">No vendors yet — run /api/catalog/sync first.</td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>#{v.bokunVendorId}</td>
                  <td>{formatNumber(v.contractProductCount)}</td>
                  <td>{formatNumber(v.uniqueProductCount)}</td>
                  <td>{formatDateTime(v.lastSyncedAt)}</td>
                  <td>
                    {v.isActive
                      ? <span className="admin-badge admin-badge--ok">active</span>
                      : <span className="admin-badge admin-badge--off">inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------- Vendors page ----------------
  function VendorsPage({ overview }) {
    if (!overview) return <div className="admin-empty">Loading…</div>;
    const { vendors } = overview;
    return (
      <div>
        <h1 className="admin-page-title">Vendors</h1>
        <p className="admin-page-sub">Snapshot from the last catalog sync (read-only).</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Bókun ID</th>
                <th>Contracts</th>
                <th>Unique products</th>
                <th>Last sync</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">No vendors yet.</td></tr>
              ) : vendors.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.name}</strong></td>
                  <td>#{v.bokunVendorId}</td>
                  <td>{formatNumber(v.contractProductCount)}</td>
                  <td>{formatNumber(v.uniqueProductCount)}</td>
                  <td>{formatDateTime(v.lastSyncedAt)} <small style={{ color: 'var(--fg-3)' }}>{timeAgo(v.lastSyncedAt)}</small></td>
                  <td>
                    {v.isActive
                      ? <span className="admin-badge admin-badge--ok">active</span>
                      : <span className="admin-badge admin-badge--off">inactive</span>}
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

  // ---------------- Content page ----------------
  function ContentPage({ token, vendors, reloadKey, onRefresh }) {
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
        setVendorMsg('Vendor profile saved.');
        onRefresh();
      } catch (err) {
        setVendorMsg(err.message || 'Save failed');
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
        <h1 className="admin-page-title">Content</h1>
        <p className="admin-page-sub">Owned copy, vendor profiles, and homepage featured rail.</p>

        <section className="admin-sync-panel">
          <h2>Homepage featured</h2>
          <p>Shown on djstour.com when at least one activity is marked featured. Falls back to first six tours otherwise.</p>
          <div className="admin-sync-actions" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Bókun activity ID to feature…"
              value={addFeaturedId}
              onChange={(e) => setAddFeaturedId(e.target.value)}
              style={{ minWidth: 220 }}
            />
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addFeatured}>Add featured</button>
            {featuredLoading ? <span style={{ fontSize: 12 }}>Loading…</span> : null}
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Title</th><th>ID</th><th>Rank</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {featured.rows.length === 0 ? (
                  <tr><td colSpan="4" className="admin-empty">No featured activities yet.</td></tr>
                ) : featured.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.title}</strong></td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.featuredRank ?? '—'}</td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setContentEditId(row.bokunActivityId)}>Edit</button>
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
                          Remove
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
          <h2>Vendor profile</h2>
          <div className="admin-form-grid" style={{ marginBottom: 12 }}>
            <label className="admin-field admin-field--wide">
              <span>Vendor</span>
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Select vendor…</option>
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
              {vendorSaving ? 'Saving…' : 'Save vendor'}
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

  // ---------------- Activities page ----------------
  function ActivitiesPage({ token, vendors, reloadKey }) {
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
          setError(err.message || 'Failed to load activities');
        })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }, [fetchList, reloadKey]);

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
        setActionMsg(err.message || 'Action failed');
      } finally {
        setRowBusy(null);
      }
    };

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

    return (
      <div>
        <h1 className="admin-page-title">Activities</h1>
        <p className="admin-page-sub">
          {formatNumber(data.total)} matching rows.
          {actionMsg ? <span style={{ marginLeft: 12, color: 'var(--fg-3)' }}>{actionMsg}</span> : null}
        </p>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <input
              type="search"
              placeholder="Search by English title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
              <option value="">All vendors</option>
              {(vendors || []).map((v) => (
                <option key={v.id} value={v.bokunVendorId}>
                  {v.name} (#{v.bokunVendorId})
                </option>
              ))}
            </select>
            {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading…</span> : null}
          </div>

          {error ? (
            <div className="admin-empty" style={{ color: '#b91c1c' }}>{error}</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Bókun ID</th>
                  <th>Vendor</th>
                  <th>Price from</th>
                  <th>Last sync</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="7" className="admin-empty">No activities match.</td></tr>
                ) : data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.title}</strong>
                      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{row.slug}</div>
                    </td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.vendor ? row.vendor.name : '—'}</td>
                    <td>{formatPrice(row.priceFrom, row.currency)}</td>
                    <td>
                      {formatDateTime(row.lastSyncedAt)}
                      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timeAgo(row.lastSyncedAt)}</div>
                    </td>
                    <td>
                      {row.isActive
                        ? <span className="admin-badge admin-badge--ok">active</span>
                        : <span className="admin-badge admin-badge--off">inactive</span>}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => setContentEditId(row.bokunActivityId)}
                        >
                          Content
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={rowBusy === row.bokunActivityId}
                          onClick={() => runRowAction(row, 'resync-detail')}
                        >
                          {rowBusy === row.bokunActivityId ? '…' : 'Re-sync detail'}
                        </button>
                        {row.isActive ? (
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger admin-btn--sm"
                            disabled={rowBusy === row.bokunActivityId}
                            onClick={() => runRowAction(row, 'set-active', false)}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            disabled={rowBusy === row.bokunActivityId}
                            onClick={() => runRowAction(row, 'set-active', true)}
                          >
                            Activate
                          </button>
                        )}
                        <a
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          href={`/tours/${encodeURIComponent(row.bokunActivityId)}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          View site
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="admin-pagination">
            <span>Page {page} / {totalPages}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
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
  function MarketingPage({ token, reloadKey }) {
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
        .catch((err) => setError(err.message || 'Failed to load collections'))
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
        setMsg('Collection saved.');
        setEditing(null);
        load();
      } catch (err) {
        setError(err.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    };

    const remove = async (row) => {
      if (!window.confirm(`Delete collection "${row.slug}"?`)) return;
      try {
        await adminFetch(`/api/admin/collections?id=${row.id}`, token, { method: 'DELETE' });
        load();
      } catch (err) {
        setError(err.message || 'Delete failed');
      }
    };

    return (
      <div>
        <h1 className="admin-page-title">Marketing</h1>
        <p className="admin-page-sub">Homepage collection rails below the featured section. Filter by chip, route, or manual activity IDs.</p>

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
            New collection
          </button>
          {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading…</span> : null}
          {msg ? <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>{msg}</span> : null}
        </div>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Order</th><th>Slug</th><th>Title (EN)</th><th>Filter</th><th>Active</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan="6" className="admin-empty">No collections yet — add one to show homepage rails.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sortOrder}</td>
                  <td><code>{row.slug}</code></td>
                  <td>{row.titles.en || row.titles.hant || '—'}</td>
                  <td>{row.filterType}{row.filterValue ? ` · ${row.filterValue}` : ''}</td>
                  <td>{row.isActive ? <span className="admin-badge admin-badge--ok">on</span> : <span className="admin-badge admin-badge--off">off</span>}</td>
                  <td>
                    <div className="admin-actions">
                      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditing({
                        ...row,
                        activityIdsText: (row.activityIds || []).join(', '),
                      })}>Edit</button>
                      <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(row)}>Delete</button>
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
                <h2>{editing.id ? `Edit · ${editing.slug}` : 'New collection'}</h2>
                <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => setEditing(null)}>Close</button>
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
                <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                <button type="button" className="admin-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------- Inquiries page ----------------
  function InquiriesPage({ token }) {
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
          setError(err.message || 'Failed to load inquiries');
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
        setSaveMsg('Saved.');
        const listRes = await loadList();
        setData({
          rows: listRes.rows || [],
          total: listRes.total || 0,
          statusCounts: listRes.statusCounts || data.statusCounts,
        });
      } catch (err) {
        setSaveMsg(err.message || 'Save failed');
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
        <h1 className="admin-page-title">Inquiries</h1>
        <p className="admin-page-sub">
          {formatNumber(data.total)} matching · concierge leads + hosted-checkout redirects.
        </p>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={abandonedOnly}>
              <option value="">All statuses</option>
              <option value="new">new (concierge lead)</option>
              <option value="redirected_to_bokun">redirected_to_bokun</option>
            </select>
            <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={abandonedOnly} onChange={(e) => setAbandonedOnly(e.target.checked)} />
              Abandoned carts only
            </label>
            {data.statusCounts ? (
              <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
                {Object.entries(data.statusCounts).map(([k, v]) => `${k}:${v}`).join(' · ')}
              </span>
            ) : null}
            {loading ? <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Loading…</span> : null}
          </div>

          {error ? (
            <div className="admin-empty" style={{ color: '#b91c1c' }}>{error}</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Follow-up</th>
                  <th>Contact</th>
                  <th>Items</th>
                  <th>Hosted URL</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="6" className="admin-empty">No inquiries yet.</td></tr>
                ) : data.rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr
                      className={row.isAbandoned ? 'admin-row--abandoned' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    >
                      <td>
                        {formatDateTime(row.createdAt)}
                        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timeAgo(row.createdAt)}</div>
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
                                  {saving ? 'Saving…' : 'Save follow-up'}
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
            <span>Page {page} / {totalPages}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Translations page ----------------
  function TranslationsPage({ token, reloadKey }) {
    const [queue, setQueue] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState(null);
    const [rowBusy, setRowBusy] = useState(null);
    const [batchSize, setBatchSize] = useState(12);

    const loadQueue = useCallback(() => {
      setLoading(true);
      setError('');
      adminFetch('/api/admin/translations?maxScan=500&pendingLimit=50', token)
        .then((res) => setQueue(res))
        .catch((err) => setError(err.message || 'Failed to load queue'))
        .finally(() => setLoading(false));
    }, [token]);

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
        setError(err.message || 'Batch failed');
      } finally {
        setRunning(false);
      }
    };

    const syncOne = async (bokunActivityId) => {
      setRowBusy(bokunActivityId);
      setError('');
      try {
        await adminFetch('/api/admin/translations', token, {
          method: 'POST',
          body: { action: 'sync-activities', activityIds: [Number(bokunActivityId)] },
        });
        loadQueue();
      } catch (err) {
        setError(err.message || 'Sync failed');
      } finally {
        setRowBusy(null);
      }
    };

    const cov = queue && queue.coverage;
    const stats = queue && queue.stats;

    return (
      <div>
        <h1 className="admin-page-title">Translations</h1>
        <p className="admin-page-sub">
          OpenAI background sync for hant/hans overlays. Scanned {formatNumber(queue?.activeActivities)} active activities
          {queue?.scannedAt ? ` · ${formatDateTime(queue.scannedAt)}` : ''}.
        </p>

        <div className="admin-grid" style={{ marginBottom: 20 }}>
          <div className="admin-card">
            <div className="admin-card__label">Field coverage</div>
            <div className="admin-card__value">{cov ? `${cov.percentComplete}%` : '—'}</div>
            <div className="admin-card__hint">
              {cov ? `${formatNumber(cov.translatedFields)} / ${formatNumber(cov.requiredFields)} fields` : '—'}
            </div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Queue depth</div>
            <div className="admin-card__value">{formatNumber(stats?.queueDepth)}</div>
            <div className="admin-card__hint">activities need translation work</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Fully translated</div>
            <div className="admin-card__value">{formatNumber(stats?.complete)}</div>
            <div className="admin-card__hint">{formatNumber(stats?.partial)} partial · {formatNumber(stats?.pending)} empty</div>
          </div>
          <div className="admin-card">
            <div className="admin-card__label">Cron estimate</div>
            <div className="admin-card__value">{queue?.cron?.estimatedRunsToClear ?? '—'}</div>
            <div className="admin-card__hint">runs @ {queue?.cron?.maxActivitiesPerRun || 12}/batch · {queue?.cron?.schedule || 'every 6h'}</div>
          </div>
        </div>

        <section className="admin-sync-panel">
          <h2>Run translation batch</h2>
          <p>Same worker as Vercel cron — translates up to N activities per run (title, summary, description, stops).</p>
          <div className="admin-sync-actions">
            <label style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Batch size
              <input
                type="number"
                min={1}
                max={30}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.min(30, Math.max(1, Number(e.target.value) || 12)))}
                disabled={running}
                style={{ width: 56 }}
              />
            </label>
            <button type="button" className={`admin-btn${running ? ' admin-btn--loading' : ''}`} onClick={runBatch} disabled={running}>
              {running ? (
                <>
                  <span className="admin-sync-spinner" aria-hidden="true" />
                  Translating…
                </>
              ) : (
                'Run batch now'
              )}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={loadQueue} disabled={running || loading}>
              Refresh queue
            </button>
          </div>
          {runResult && runResult.summary ? (
            <div className="admin-sync-result" style={{ marginTop: 14 }}>
              <div className="admin-sync-result__header">
                <span className="admin-sync-result__icon" aria-hidden="true">✓</span>
                <div>
                  <strong>Batch complete</strong>
                  <span className="admin-sync-result__meta">
                    {formatNumber(runResult.summary.translated)} translated ·{' '}
                    {formatNumber(runResult.summary.skipped)} skipped ·{' '}
                    {formatNumber(runResult.summary.pendingActivities)} activities in batch
                  </span>
                </div>
              </div>
              {runResult.summary.errors && runResult.summary.errors.length ? (
                <pre className="admin-pre" style={{ marginTop: 10 }}>{JSON.stringify(runResult.summary.errors, null, 2)}</pre>
              ) : null}
            </div>
          ) : null}
        </section>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}

        <h2 style={{ fontSize: 16, margin: '8px 0 12px' }}>Pending queue</h2>
        <div className="admin-table-wrap">
          {loading ? <div className="admin-empty">Scanning catalog…</div> : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>ID</th>
                  <th>Coverage</th>
                  <th>Missing</th>
                  <th>Stale</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!queue?.pending?.length ? (
                  <tr><td colSpan="6" className="admin-empty">Queue empty — all scanned activities are up to date.</td></tr>
                ) : queue.pending.map((row) => (
                  <tr key={row.bokunActivityId}>
                    <td><strong>{row.title}</strong></td>
                    <td>{row.bokunActivityId}</td>
                    <td>{row.percent}%</td>
                    <td>{formatNumber(row.missing)}</td>
                    <td>{formatNumber(row.stale)}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                        disabled={rowBusy === row.bokunActivityId || running}
                        onClick={() => syncOne(row.bokunActivityId)}
                      >
                        {rowBusy === row.bokunActivityId ? '…' : 'Translate'}
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
  function HealthPage({ token, overview }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadHealth = useCallback(() => {
      setLoading(true);
      setError('');
      adminFetch('/api/admin/health', token)
        .then((res) => setReport(res))
        .catch((err) => setError(err.message || 'Health check failed'))
        .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => { loadHealth(); }, [loadHealth]);

    const env = (report && report.env) || overview?.env || {};

    function flagBadge(b) {
      return b
        ? <span className="admin-badge admin-badge--ok">set</span>
        : <span className="admin-badge admin-badge--err">missing</span>;
    }

    function checkStatusClass(status) {
      if (status === 'ok') return 'admin-health-check--ok';
      if (status === 'warn') return 'admin-health-check--warn';
      return 'admin-health-check--fail';
    }

    const overall = report?.overall || 'unknown';

    return (
      <div>
        <h1 className="admin-page-title">Health</h1>
        <p className="admin-page-sub">Live probes + environment flags for this deployment.</p>

        <div className="admin-sync-actions" style={{ marginBottom: 16 }}>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={loadHealth} disabled={loading}>
            {loading ? 'Checking…' : 'Re-run checks'}
          </button>
          {report?.generatedAt ? (
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Last run {formatDateTime(report.generatedAt)}</span>
          ) : null}
        </div>

        {error ? <div className="admin-result admin-result--error">{error}</div> : null}

        {report ? (
          <div className={`admin-health-banner admin-health-banner--${overall}`}>
            <strong>Overall: {overall}</strong>
            {report.translation ? (
              <span style={{ marginLeft: 12, fontWeight: 400 }}>
                Translation queue {formatNumber(report.translation.queueDepth)} · {report.translation.percentComplete}% field coverage
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
              </div>
            ))}
          </div>
        ) : null}

        <h2 style={{ fontSize: 16, margin: '24px 0 12px' }}>Environment variables</h2>
        <p className="admin-page-sub" style={{ marginTop: 0 }}>Presence only — values are never returned.</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Bókun API</th></tr>
              <tr><td>BOKUN_ACCESS_KEY</td><td>{flagBadge(env.bokun?.accessKey)}</td></tr>
              <tr><td>BOKUN_SECRET_KEY</td><td>{flagBadge(env.bokun?.secretKey)}</td></tr>
              <tr><td>BOKUN_API_HOST</td><td>{env.bokun?.apiHost || <span className="admin-badge admin-badge--off">default</span>}</td></tr>
              <tr><td>BOKUN_SHOP_URL</td><td>{env.bokun?.shopUrl || <span className="admin-badge admin-badge--err">missing</span>}</td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Supabase</th></tr>
              <tr><td>SUPABASE_URL</td><td>{flagBadge(env.supabase?.url)}</td></tr>
              <tr><td>SUPABASE_ANON_KEY</td><td>{flagBadge(env.supabase?.anonKey)}</td></tr>
              <tr><td>SUPABASE_SERVICE_ROLE_KEY</td><td>{flagBadge(env.supabase?.serviceKey)}</td></tr>

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>OpenAI</th></tr>
              <tr><td>OPENAI_API_KEY</td><td>{flagBadge(env.openai?.apiKey)}</td></tr>
              <tr><td>OPENAI_TRANSLATION_MODEL</td><td><code>{env.openai?.model || 'gpt-4o-mini'}</code></td></tr>

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
  function AdminShell({ token, onLogout }) {
    const [tab, setTab] = useState('overview');
    const [overview, setOverview] = useState(null);
    const [overviewError, setOverviewError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    const loadOverview = useCallback(() => {
      adminFetch('/api/admin/overview', token)
        .then((res) => { setOverview(res); setOverviewError(''); })
        .catch((err) => {
          setOverviewError(err.message || 'Failed to load overview');
          if (err.status === 401) onLogout();
        });
    }, [token, onLogout]);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    const refreshAll = useCallback(() => {
      loadOverview();
      setReloadKey((k) => k + 1);
    }, [loadOverview]);

    const counts = {
      vendors: overview?.vendors?.length,
      activities: overview?.activities?.active,
      inquiries: overview?.inquiries?.total,
      collections: overview?.marketing?.collectionsActive,
      translationPending: null,
    };

    return (
      <div className="admin-shell">
        <Sidebar tab={tab} setTab={setTab} counts={counts} onLogout={onLogout} />
        <main className="admin-main">
          {overviewError ? (
            <div className="admin-login__error" style={{ marginBottom: 16 }}>
              {overviewError}
            </div>
          ) : null}

          {tab === 'overview' && (
            <OverviewPage overview={overview} token={token} onRefresh={refreshAll} />
          )}
          {tab === 'vendors' && <VendorsPage overview={overview} />}
          {tab === 'activities' && (
            <ActivitiesPage
              token={token}
              vendors={overview?.vendors || []}
              reloadKey={reloadKey}
            />
          )}
          {tab === 'content' && (
            <ContentPage
              token={token}
              vendors={overview?.vendors}
              reloadKey={reloadKey}
              onRefresh={refreshAll}
            />
          )}
          {tab === 'marketing' && (
            <MarketingPage token={token} reloadKey={reloadKey} />
          )}
          {tab === 'inquiries' && <InquiriesPage token={token} />}
          {tab === 'translations' && (
            <TranslationsPage token={token} reloadKey={reloadKey} />
          )}
          {tab === 'health' && <HealthPage token={token} overview={overview} />}
        </main>
      </div>
    );
  }

  function AuralisAdmin() {
    const [token, setToken] = useState(() => readToken());

    const onLoggedIn = (t) => setToken(t);
    const onLogout = () => { writeToken(''); setToken(''); };

    if (!token) return <LoginScreen onLoggedIn={onLoggedIn} />;
    return <AdminShell token={token} onLogout={onLogout} />;
  }

  window.AuralisAdmin = AuralisAdmin;
})();
