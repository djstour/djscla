/* MonthAvailabilityCalendar — inline month grid that mirrors the Bókun
 * booking widget. Shows one month at a time with each day cell coloured
 * by live availability:
 *   • available  → soft aurora-green fill
 *   • sold out   → muted surface, struck-through
 *   • past       → disabled, hidden
 *   • selected   → strong border
 *
 * Fetches /api/availability/month?activityId=&start=&end= once per visible
 * month (results cached in-memory per session). Lightweight: single observer,
 * no portal, no backdrop-filter so it composes safely on mobile.
 */

(function () {
  const { useState, useEffect, useMemo, useCallback, useRef } = React;
  const { Icon, pick, todayIsoDate } = window.AuralisUI;

  // ---- date helpers ----
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoFromYmd(year, monthIndex, day) {
    return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
  }
  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }
  function startOfMonthIso(year, monthIndex) {
    return isoFromYmd(year, monthIndex, 1);
  }
  function endOfMonthIso(year, monthIndex) {
    return isoFromYmd(year, monthIndex, daysInMonth(year, monthIndex));
  }
  function monthCacheKey(activityId, year, monthIndex) {
    return `${activityId}:${year}-${pad2(monthIndex + 1)}`;
  }
  function locale(lang) {
    return lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
  }
  function monthTitle(year, monthIndex, lang) {
    return new Date(year, monthIndex, 1).toLocaleString(locale(lang), { month: 'long', year: 'numeric' });
  }
  // Mon-first weekday short labels.
  function weekdayLabels(lang) {
    const base = new Date(2026, 5, 1); // June 1 2026 is a Monday
    const out = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push(d.toLocaleString(locale(lang), { weekday: 'short' }));
    }
    return out;
  }

  // Cache of fetched month payloads ({ days, fetchedAt }) keyed by
  // `${activityId}:${YYYY-MM}`. Lives for the SPA session.
  const monthCache = new Map();
  // Inflight promises so a quick re-mount doesn't double-fetch.
  const inflight = new Map();

  function fetchMonth(activityId, year, monthIndex, lang) {
    const key = monthCacheKey(activityId, year, monthIndex);
    if (monthCache.has(key)) return Promise.resolve(monthCache.get(key));
    if (inflight.has(key)) return inflight.get(key);

    const start = startOfMonthIso(year, monthIndex);
    const end = endOfMonthIso(year, monthIndex);
    const qs = new URLSearchParams({ activityId: String(activityId), start, end, lang });
    const req = fetch(`/api/availability/month?${qs}`)
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok) {
          const err = new Error(data.error || `HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        // Map by date for O(1) lookup during render.
        const dayMap = new Map();
        (data.days || []).forEach((d) => dayMap.set(d.date, d));
        const value = { dayMap, fetchedAt: data.fetchedAt || new Date().toISOString() };
        monthCache.set(key, value);
        return value;
      })
      .finally(() => inflight.delete(key));

    inflight.set(key, req);
    return req;
  }

  function MonthAvailabilityCalendar({
    activityId,
    value,
    onChange,
    lang = 'hant',
  }) {
    const T = (opts) => pick(lang, opts);
    const today = todayIsoDate();
    const [todayY, todayM] = today.split('-').map(Number);

    // Initial displayed month: month containing `value`, else current month.
    const initial = useMemo(() => {
      if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m] = value.split('-').map(Number);
        return { year: y, monthIndex: m - 1 };
      }
      return { year: todayY, monthIndex: todayM - 1 };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [view, setView] = useState(initial);
    const [tick, setTick] = useState(0); // bump to re-render after async fetch
    const [error, setError] = useState(null);

    const cacheKey = monthCacheKey(activityId, view.year, view.monthIndex);
    const cached = monthCache.get(cacheKey);
    const loading = !cached && !error;

    // Fetch when activityId or visible month changes; also prefetch next month
    // to keep "next" navigation feeling instant.
    useEffect(() => {
      if (!activityId) return;
      let cancelled = false;
      setError(null);
      fetchMonth(activityId, view.year, view.monthIndex, lang)
        .then(() => { if (!cancelled) setTick((n) => n + 1); })
        .catch((err) => { if (!cancelled) setError(err); });

      const nextMonth = view.monthIndex === 11
        ? { year: view.year + 1, monthIndex: 0 }
        : { year: view.year, monthIndex: view.monthIndex + 1 };
      fetchMonth(activityId, nextMonth.year, nextMonth.monthIndex, lang).catch(() => {});

      return () => { cancelled = true; };
    }, [activityId, view.year, view.monthIndex, lang]);

    const goPrev = useCallback(() => {
      setView((v) => v.monthIndex === 0
        ? { year: v.year - 1, monthIndex: 11 }
        : { year: v.year, monthIndex: v.monthIndex - 1 });
    }, []);

    const goNext = useCallback(() => {
      setView((v) => v.monthIndex === 11
        ? { year: v.year + 1, monthIndex: 0 }
        : { year: v.year, monthIndex: v.monthIndex + 1 });
    }, []);

    const canGoPrev = !(view.year === todayY && view.monthIndex <= todayM - 1);

    // When fresh month data arrives that covers the externally-selected date,
    // surface the per-day snapshot once so the parent (BookPanel) can wire
    // the TIME dropdown + auto-check against actual published slots without
    // waiting for an explicit click.
    const lastSurfacedRef = useRef('');
    useEffect(() => {
      if (!cached || !value || !onChange) return;
      const info = cached.dayMap.get(value);
      if (!info) return;
      const key = `${cached.fetchedAt}:${value}`;
      if (lastSurfacedRef.current === key) return;
      lastSurfacedRef.current = key;
      onChange(value, info);
    }, [cached, value, onChange]);

    // Build the 7-column grid with Monday-first weekday header.
    const weeks = useMemo(() => {
      const total = daysInMonth(view.year, view.monthIndex);
      // JS getDay(): Sun=0..Sat=6. Convert to Mon=0..Sun=6.
      const firstDow = (new Date(view.year, view.monthIndex, 1).getDay() + 6) % 7;
      const cells = [];
      for (let i = 0; i < firstDow; i += 1) cells.push(null);
      for (let day = 1; day <= total; day += 1) cells.push(day);
      while (cells.length % 7 !== 0) cells.push(null);
      const rows = [];
      for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
      return rows;
    }, [view.year, view.monthIndex]);

    const dows = useMemo(() => weekdayLabels(lang), [lang]);
    const headerLabel = monthTitle(view.year, view.monthIndex, lang);

    function cellStatus(day) {
      if (!day) return { kind: 'empty' };
      const iso = isoFromYmd(view.year, view.monthIndex, day);
      if (iso < today) return { kind: 'past', iso };
      if (loading) return { kind: 'loading', iso };
      const hit = cached && cached.dayMap.get(iso);
      if (hit && hit.hasAvailability && !hit.soldOut) {
        return { kind: 'available', iso, capacityRemaining: hit.capacityRemaining };
      }
      // No row from upstream for this date (Bókun stopped publishing that day)
      // OR the row says soldOut. Both render identically in the Bókun widget.
      return { kind: 'sold_out', iso };
    }

    // Re-render hook: tick is touched after fetch resolves so cached read
    // picks up new data.
    /* eslint-disable no-unused-expressions */
    tick;
    /* eslint-enable no-unused-expressions */

    return (
      <div className="month-cal" role="group" aria-label={T({ hant: '可訂月曆', hans: '可订月历', en: 'Availability calendar' })}>
        <div className="month-cal__header">
          <button
            type="button"
            className="month-cal__nav"
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label={T({ hant: '上個月', hans: '上个月', en: 'Previous month' })}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <div className="month-cal__title" aria-live="polite">{headerLabel}</div>
          <button
            type="button"
            className="month-cal__nav"
            onClick={goNext}
            aria-label={T({ hant: '下個月', hans: '下个月', en: 'Next month' })}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </div>

        <div className="month-cal__dow-row" aria-hidden="true">
          {dows.map((d, i) => (
            <div key={i} className="month-cal__dow">{d}</div>
          ))}
        </div>

        <div className="month-cal__grid" role="grid">
          {weeks.map((row, ri) => (
            <div key={ri} className="month-cal__row" role="row">
              {row.map((day, ci) => {
                const st = cellStatus(day);
                if (st.kind === 'empty') {
                  return <div key={ci} className="month-cal__cell month-cal__cell--empty" />;
                }
                const selected = value && st.iso === value;
                const isClickable = st.kind === 'available' || st.kind === 'unknown' || st.kind === 'loading';
                const className = [
                  'month-cal__cell',
                  `month-cal__cell--${st.kind}`,
                  selected ? 'is-selected' : '',
                ].filter(Boolean).join(' ');
                const dayInfo = cached && cached.dayMap.get(st.iso);
                const baseDate = new Date(view.year, view.monthIndex, day).toLocaleDateString(locale(lang), {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
                const capacityLine = (() => {
                  if (st.kind !== 'available') return null;
                  const c = st.capacityRemaining;
                  if (c == null) return T({ hant: '名額不限', hans: '名额不限', en: 'Unlimited spots' });
                  return T({
                    hant: `剩 ${c} 位`,
                    hans: `剩 ${c} 位`,
                    en: `${c} ${c === 1 ? 'spot' : 'spots'} left`,
                  });
                })();
                const tooltip = st.kind === 'sold_out'
                  ? `${baseDate} — ${T({ hant: '額滿', hans: '已满', en: 'Sold out' })}`
                  : st.kind === 'available'
                  ? `${baseDate} — ${capacityLine}`
                  : baseDate;
                const ariaLabel = tooltip;
                return (
                  <button
                    key={ci}
                    type="button"
                    role="gridcell"
                    aria-selected={selected || undefined}
                    aria-label={ariaLabel}
                    title={tooltip}
                    className={className}
                    disabled={!isClickable && st.kind !== 'sold_out'}
                    onClick={() => {
                      if (st.kind === 'sold_out' || st.kind === 'past') return;
                      if (onChange) onChange(st.iso, dayInfo || null);
                    }}
                  >
                    <span className="month-cal__cell-day">{day}</span>
                    {st.kind === 'available' && st.capacityRemaining != null && st.capacityRemaining <= 8 && (
                      <span className="month-cal__cell-low" aria-hidden="true">{st.capacityRemaining}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {error ? (
          <div className="month-cal__error" role="alert">
            {T({
              hant: '可訂狀態暫時無法載入。',
              hans: '可订状态暂时无法加载。',
              en: 'Availability is temporarily unavailable.',
            })}
          </div>
        ) : (
          <div className="month-cal__legend" aria-hidden="true">
            <span className="month-cal__legend-item">
              <span className="month-cal__legend-swatch month-cal__legend-swatch--available" />
              {T({ hant: '可訂', hans: '可订', en: 'Available' })}
            </span>
            <span className="month-cal__legend-item">
              <span className="month-cal__legend-swatch month-cal__legend-swatch--sold_out" />
              {T({ hant: '額滿', hans: '已满', en: 'Sold out' })}
            </span>
          </div>
        )}
      </div>
    );
  }

  window.AuralisUI = window.AuralisUI || {};
  window.AuralisUI.MonthAvailabilityCalendar = MonthAvailabilityCalendar;
})();
