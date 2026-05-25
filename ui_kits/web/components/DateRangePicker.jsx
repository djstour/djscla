/* DateRangePicker — dual-month range calendar for Hero trip dates. */

(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const { createPortal } = ReactDOM;
  const { Icon, pick, todayIsoDate } = window.AuralisUI;

  const PICKER_MAX_WIDTH = 576;
  const DISMISS_GUARD_MS = 450;

  function tripDateLocale(lang) {
    return lang === 'en' ? 'en-GB' : lang === 'hans' ? 'zh-Hans-CN' : 'zh-Hant-TW';
  }

  function isoFromYmd(year, monthIndex, day) {
    const m = String(monthIndex + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  function parseIso(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return { year: y, monthIndex: m - 1, day: d };
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function compareIso(a, b) {
    if (!a || !b) return 0;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function isBetweenIso(iso, start, end) {
    return compareIso(iso, start) >= 0 && compareIso(iso, end) <= 0;
  }

  function monthTitle(year, monthIndex, lang) {
    const locale = tripDateLocale(lang);
    return new Date(year, monthIndex, 1).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
  }

  function weekdayLabels(lang) {
    const locale = tripDateLocale(lang);
    const base = new Date(2024, 0, 1); // Mon
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'narrow' });
    });
  }

  function buildMonthCells(year, monthIndex) {
    const total = daysInMonth(year, monthIndex);
    const pad = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let day = 1; day <= total; day++) {
      cells.push(isoFromYmd(year, monthIndex, day));
    }
    return cells;
  }

  function MonthGrid({
    year,
    monthIndex,
    lang,
    minDate,
    draftStart,
    draftEnd,
    hoverIso,
    awaitingEnd,
    onDayClick,
    onDayHover,
  }) {
    const cells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);
    const weekdays = useMemo(() => weekdayLabels(lang), [lang]);
    const previewEnd = awaitingEnd && hoverIso && draftStart
      ? hoverIso
      : null;
    const rangeStart = draftStart;
    let rangeEnd = draftEnd;
    if (previewEnd && rangeStart && compareIso(previewEnd, rangeStart) >= 0) {
      rangeEnd = previewEnd;
    } else if (rangeStart && rangeEnd && compareIso(rangeEnd, rangeStart) < 0) {
      rangeEnd = rangeStart;
    }

    return (
      <div className="date-range-picker__month">
        <div className="date-range-picker__month-title">{monthTitle(year, monthIndex, lang)}</div>
        <div className="date-range-picker__weekdays">
          {weekdays.map((w) => (
            <span key={w} className="date-range-picker__weekday">{w}</span>
          ))}
        </div>
        <div className="date-range-picker__days" role="grid">
          {cells.map((iso, i) => {
            if (!iso) {
              return <span key={`e-${i}`} className="date-range-picker__day date-range-picker__day--empty" />;
            }
            const disabled = compareIso(iso, minDate) < 0;
            const isStart = iso === draftStart;
            const isEnd = iso === draftEnd;
            const inRange = rangeStart && rangeEnd && isBetweenIso(iso, rangeStart, rangeEnd);
            const highlight = inRange;

            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                disabled={disabled}
                className={[
                  'date-range-picker__day',
                  highlight ? ' is-in-range' : '',
                  isStart ? ' is-start' : '',
                  isEnd ? ' is-end' : '',
                  disabled ? ' is-disabled' : '',
                ].join('')}
                onClick={() => !disabled && onDayClick(iso)}
                onMouseEnter={() => !disabled && onDayHover(iso)}
                onFocus={() => !disabled && onDayHover(iso)}
              >
                {parseIso(iso).day}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function computePickerPosition(anchorEl) {
    if (!anchorEl || typeof window === 'undefined') {
      return { top: 80, left: 16, width: PICKER_MAX_WIDTH };
    }
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(PICKER_MAX_WIDTH, vw - 24);
    let left = rect.left;
    if (left + width > vw - 12) left = vw - 12 - width;
    if (left < 12) left = 12;
    let top = rect.bottom + 8;
    const estimatedHeight = 420;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - estimatedHeight - 8);
    }
    return { top, left, width };
  }

  function DateRangePicker({
    open,
    anchorRef,
    startDate,
    endDate,
    minDate,
    onChange,
    onClose,
    lang = 'hant',
  }) {
    const T = (opts) => pick(lang, opts);
    const panelRef = useRef(null);
    const dismissGuardUntil = useRef(0);
    const [position, setPosition] = useState(() => ({ top: 80, left: 16, width: PICKER_MAX_WIDTH }));
    const min = minDate || todayIsoDate();

    const initial = parseIso(startDate || min);
    const [view, setView] = useState({ year: initial.year, month: initial.monthIndex });
    const [draftStart, setDraftStart] = useState(startDate);
    const [draftEnd, setDraftEnd] = useState(endDate);
    const [hoverIso, setHoverIso] = useState(null);
    const [awaitingEnd, setAwaitingEnd] = useState(false);

    useEffect(() => {
      if (!open) return;
      const p = parseIso(startDate || min);
      setView({ year: p.year, month: p.monthIndex });
      setDraftStart(startDate);
      setDraftEnd(endDate);
      setHoverIso(null);
      setAwaitingEnd(false);
    }, [open, startDate, endDate, min]);

    useEffect(() => {
      if (!open) return undefined;
      dismissGuardUntil.current = Date.now() + DISMISS_GUARD_MS;

      function place() {
        const anchor = anchorRef && anchorRef.current;
        setPosition(computePickerPosition(anchor));
      }
      place();
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);

      function shouldIgnoreDismiss() {
        return Date.now() < dismissGuardUntil.current;
      }

      function onOutside(e) {
        if (shouldIgnoreDismiss()) return;
        const target = e.target;
        if (panelRef.current && panelRef.current.contains(target)) return;
        const anchor = anchorRef && anchorRef.current;
        if (anchor && anchor.contains(target)) return;
        onClose && onClose();
      }

      function onKey(e) {
        if (e.key === 'Escape') onClose && onClose();
      }

      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('touchstart', onOutside, { capture: true, passive: true });
      document.addEventListener('keydown', onKey);
      return () => {
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('touchstart', onOutside, true);
        document.removeEventListener('keydown', onKey);
      };
    }, [open, onClose, anchorRef]);

    function shiftMonths(delta) {
      setView((v) => {
        let nm = v.month + delta;
        let ny = v.year;
        while (nm < 0) { nm += 12; ny -= 1; }
        while (nm > 11) { nm -= 12; ny += 1; }
        return { year: ny, month: nm };
      });
    }

    const month2Index = view.month === 11 ? 0 : view.month + 1;
    const month2Year = view.month === 11 ? view.year + 1 : view.year;

    function handleDayClick(iso) {
      if (compareIso(iso, min) < 0) return;

      if (!awaitingEnd) {
        setDraftStart(iso);
        setDraftEnd(iso);
        setAwaitingEnd(true);
        setHoverIso(null);
        return;
      }

      if (compareIso(iso, draftStart) < 0) {
        setDraftStart(iso);
        setDraftEnd(iso);
        setAwaitingEnd(true);
        return;
      }

      const nextStart = draftStart;
      const nextEnd = iso;
      setDraftEnd(nextEnd);
      setAwaitingEnd(false);
      setHoverIso(null);
      onChange && onChange({ startDate: nextStart, endDate: nextEnd });
      onClose && onClose();
    }

    if (!open || typeof document === 'undefined') return null;

    const panel = (
      <div
        ref={panelRef}
        className="date-range-picker date-range-picker--portal"
        role="dialog"
        aria-modal="true"
        aria-label={T({ hant: '選擇日期區間', hans: '选择日期区间', en: 'Select date range' })}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="date-range-picker__nav">
          <button type="button" className="date-range-picker__nav-btn" onClick={() => shiftMonths(-1)} aria-label={T({ hant: '上個月', hans: '上个月', en: 'Previous month' })}>
            <Icon name="chevron-left" size={18} />
          </button>
          <button type="button" className="date-range-picker__nav-btn" onClick={() => shiftMonths(1)} aria-label={T({ hant: '下個月', hans: '下个月', en: 'Next month' })}>
            <Icon name="chevron-right" size={18} />
          </button>
        </div>

        <div className="date-range-picker__months">
          <MonthGrid
            year={view.year}
            monthIndex={view.month}
            lang={lang}
            minDate={min}
            draftStart={draftStart}
            draftEnd={draftEnd}
            hoverIso={hoverIso}
            awaitingEnd={awaitingEnd}
            onDayClick={handleDayClick}
            onDayHover={setHoverIso}
          />
          <MonthGrid
            year={month2Year}
            monthIndex={month2Index}
            lang={lang}
            minDate={min}
            draftStart={draftStart}
            draftEnd={draftEnd}
            hoverIso={hoverIso}
            awaitingEnd={awaitingEnd}
            onDayClick={handleDayClick}
            onDayHover={setHoverIso}
          />
        </div>

        <p className="date-range-picker__hint">
          {awaitingEnd
            ? T({ hant: '請選擇回程日', hans: '请选择回程日', en: 'Select your return date' })
            : T({ hant: '請選擇出發日', hans: '请选择出发日', en: 'Select your departure date' })}
        </p>
      </div>
    );

    return createPortal(panel, document.body);
  }

  window.AuralisUI.DateRangePicker = DateRangePicker;
})();
