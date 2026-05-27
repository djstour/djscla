/* eslint-disable no-undef */
/* global React, ReactDOM */

  // DJS Tour · Admin Console — Phase 1 (read-only).
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
          <p className="admin-login__sub">Read-only control room (Phase 1).</p>

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
      { id: 'inquiries', label: 'Inquiries', badge: counts.inquiries },
      { id: 'env', label: 'Environment' },
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
          Phase 1 · read-only<br />
          <button onClick={onLogout}>Sign out</button>
        </div>
      </aside>
    );
  }

  // ---------------- Overview ----------------
  function OverviewPage({ overview }) {
    if (!overview) return <div className="admin-empty">Loading…</div>;

    const { activities, vendors, totals, lastSyncedAt, inquiries } = overview;

    return (
      <div>
        <h1 className="admin-page-title">Overview</h1>
        <p className="admin-page-sub">
          Last activity sync: <strong>{formatDateTime(lastSyncedAt)}</strong>
          {lastSyncedAt ? <span> · {timeAgo(lastSyncedAt)}</span> : null}
        </p>

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

  // ---------------- Activities page ----------------
  function ActivitiesPage({ token, vendors }) {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [statusFilter, setStatusFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('');
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');
    const [data, setData] = useState({ rows: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
      const t = setTimeout(() => setDebouncedQ(q), 300);
      return () => clearTimeout(t);
    }, [q]);

    useEffect(() => { setPage(1); }, [statusFilter, vendorFilter, debouncedQ]);

    useEffect(() => {
      let alive = true;
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
      });
      if (vendorFilter) params.set('vendorId', vendorFilter);
      if (debouncedQ) params.set('q', debouncedQ);
      adminFetch(`/api/admin/activities?${params}`, token)
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
    }, [token, page, pageSize, statusFilter, vendorFilter, debouncedQ]);

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

    return (
      <div>
        <h1 className="admin-page-title">Activities</h1>
        <p className="admin-page-sub">{formatNumber(data.total)} matching rows.</p>

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
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="6" className="admin-empty">No activities match.</td></tr>
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
      </div>
    );
  }

  // ---------------- Inquiries page ----------------
  function InquiriesPage({ token }) {
    const [page, setPage] = useState(1);
    const [pageSize] = useState(50);
    const [statusFilter, setStatusFilter] = useState('');
    const [data, setData] = useState({ rows: [], total: 0, statusCounts: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [openId, setOpenId] = useState(null);

    useEffect(() => { setPage(1); }, [statusFilter]);

    useEffect(() => {
      let alive = true;
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);
      adminFetch(`/api/admin/inquiries?${params}`, token)
        .then((res) => {
          if (!alive) return;
          setData({
            rows: res.rows || [],
            total: res.total || 0,
            statusCounts: res.statusCounts || data.statusCounts || null,
          });
        })
        .catch((err) => {
          if (!alive) return;
          setError(err.message || 'Failed to load inquiries');
        })
        .finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, page, pageSize, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

    function statusBadge(s) {
      if (s === 'new') return 'admin-badge admin-badge--info';
      if (s === 'redirected_to_bokun') return 'admin-badge admin-badge--warn';
      if (s === 'completed' || s === 'paid') return 'admin-badge admin-badge--ok';
      if (s === 'failed' || s === 'cancelled') return 'admin-badge admin-badge--err';
      return 'admin-badge admin-badge--off';
    }

    return (
      <div>
        <h1 className="admin-page-title">Inquiries</h1>
        <p className="admin-page-sub">
          {formatNumber(data.total)} matching · concierge leads + hosted-checkout redirects.
        </p>

        <div className="admin-table-wrap">
          <div className="admin-table-toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="new">new (concierge lead)</option>
              <option value="redirected_to_bokun">redirected_to_bokun</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
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
                  <th>Contact</th>
                  <th>Items</th>
                  <th>Hosted URL</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr><td colSpan="5" className="admin-empty">No inquiries yet.</td></tr>
                ) : data.rows.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => setOpenId(openId === row.id ? null : row.id)}>
                      <td>
                        {formatDateTime(row.createdAt)}
                        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{timeAgo(row.createdAt)}</div>
                      </td>
                      <td><span className={statusBadge(row.status)}>{row.status}</span></td>
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
                    {openId === row.id ? (
                      <tr>
                        <td colSpan="5" style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <pre className="admin-pre">{JSON.stringify(row, null, 2)}</pre>
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

  // ---------------- Environment ----------------
  function EnvironmentPage({ overview }) {
    if (!overview) return <div className="admin-empty">Loading…</div>;
    const env = overview.env || {};
    function flagBadge(b) {
      return b
        ? <span className="admin-badge admin-badge--ok">set</span>
        : <span className="admin-badge admin-badge--err">missing</span>;
    }
    return (
      <div>
        <h1 className="admin-page-title">Environment</h1>
        <p className="admin-page-sub">Server-side config visible to the running deployment. Values themselves are never returned.</p>

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

              <tr><th colSpan="2" style={{ background: 'rgba(0,0,0,0.04)' }}>Cron / Sync</th></tr>
              <tr><td>CRON_SECRET</td><td>{flagBadge(env.cron?.cronSecret)}</td></tr>
              <tr><td>CATALOG_SYNC_SECRET</td><td>{flagBadge(env.cron?.catalogSyncSecret)}</td></tr>
              <tr><td>CATALOG_SOURCE</td><td><code>{env.catalog?.source}</code></td></tr>
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

    const loadOverview = useCallback(() => {
      adminFetch('/api/admin/overview', token)
        .then((res) => { setOverview(res); setOverviewError(''); })
        .catch((err) => {
          setOverviewError(err.message || 'Failed to load overview');
          if (err.status === 401) onLogout();
        });
    }, [token, onLogout]);

    useEffect(() => { loadOverview(); }, [loadOverview]);

    const counts = {
      vendors: overview?.vendors?.length,
      activities: overview?.activities?.active,
      inquiries: overview?.inquiries?.total,
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

          {tab === 'overview' && <OverviewPage overview={overview} />}
          {tab === 'vendors' && <VendorsPage overview={overview} />}
          {tab === 'activities' && (
            <ActivitiesPage token={token} vendors={overview?.vendors || []} />
          )}
          {tab === 'inquiries' && <InquiriesPage token={token} />}
          {tab === 'env' && <EnvironmentPage overview={overview} />}
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
