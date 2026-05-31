/* HeroPaxPicker — travelers stepper popover for Hero search panel. */

(function () {
  const { useState, useEffect, useRef } = React;
  const { createPortal } = ReactDOM;
  const { Icon, pick, TRIP_PAX_LIMITS } = window.AuralisUI;

  const PANEL_MIN_WIDTH = 280;
  const DISMISS_GUARD_MS = 450;

  function HeroPaxPicker({
    open,
    onClose,
    anchorRef,
    adults,
    children,
    onChange,
    lang,
  }) {
    const T = (opts) => pick(lang, opts);
    const panelRef = useRef(null);
    const dismissGuardUntil = useRef(0);
    const [position, setPosition] = useState({ top: 0, left: 0, width: PANEL_MIN_WIDTH });

    useEffect(() => {
      if (!open) return undefined;

      dismissGuardUntil.current = Date.now() + DISMISS_GUARD_MS;

      function place() {
        const anchor = anchorRef && anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.max(PANEL_MIN_WIDTH, rect.width);
        let left = rect.left;
        const maxLeft = window.innerWidth - width - 12;
        if (left > maxLeft) left = Math.max(12, maxLeft);
        setPosition({
          top: rect.bottom + 8,
          left,
          width,
        });
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

    function patch(partial) {
      onChange && onChange({
        adults: partial.adults != null ? partial.adults : adults,
        children: partial.children != null ? partial.children : children,
      });
    }

    function stepAdults(delta) {
      const next = adults + delta;
      if (next < TRIP_PAX_LIMITS.adultMin || next > TRIP_PAX_LIMITS.adultMax) return;
      if (next + children > TRIP_PAX_LIMITS.totalMax) return;
      patch({ adults: next });
    }

    function stepChildren(delta) {
      const next = children + delta;
      if (next < TRIP_PAX_LIMITS.childMin || next > TRIP_PAX_LIMITS.childMax) return;
      if (adults + next > TRIP_PAX_LIMITS.totalMax) return;
      patch({ children: next });
    }

    if (!open || typeof document === 'undefined') return null;

    const panel = (
      <div
        ref={panelRef}
        className="hero-pax-picker hero-pax-picker--portal"
        role="dialog"
        aria-modal="true"
        aria-label={T({ hant: '選擇旅客人數', hans: '选择旅客人数', en: 'Select travelers' })}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <PaxRow
          label={T({ hant: '成人', hans: '成人', en: 'Adults' })}
          hint={T({ hant: '13 歲以上', hans: '13 岁以上', en: 'Age 13+' })}
          value={adults}
          onDec={() => stepAdults(-1)}
          onInc={() => stepAdults(1)}
          decDisabled={adults <= TRIP_PAX_LIMITS.adultMin}
          incDisabled={adults >= TRIP_PAX_LIMITS.adultMax || adults + children >= TRIP_PAX_LIMITS.totalMax}
          decLabel={T({ hant: '減少成人', hans: '减少成人', en: 'Decrease adults' })}
          incLabel={T({ hant: '增加成人', hans: '增加成人', en: 'Increase adults' })}
        />
        <PaxRow
          label={T({ hant: '孩童', hans: '孩童', en: 'Children' })}
          hint={T({ hant: '0–12 歲', hans: '0–12 岁', en: 'Ages 0–12' })}
          value={children}
          onDec={() => stepChildren(-1)}
          onInc={() => stepChildren(1)}
          decDisabled={children <= TRIP_PAX_LIMITS.childMin}
          incDisabled={children >= TRIP_PAX_LIMITS.childMax || adults + children >= TRIP_PAX_LIMITS.totalMax}
          decLabel={T({ hant: '減少孩童', hans: '减少孩童', en: 'Decrease children' })}
          incLabel={T({ hant: '增加孩童', hans: '增加孩童', en: 'Increase children' })}
        />
        <p className="hero-pax-picker__hint">
          {T({
            hant: `每筆訂單最多 ${TRIP_PAX_LIMITS.totalMax} 人`,
            hans: `每笔订单最多 ${TRIP_PAX_LIMITS.totalMax} 人`,
            en: `Up to ${TRIP_PAX_LIMITS.totalMax} travelers per booking`,
          })}
        </p>
        <button type="button" className="hero-pax-picker__done" onClick={() => onClose && onClose()}>
          {T({ hant: '完成', hans: '完成', en: 'Done' })}
        </button>
      </div>
    );

    return createPortal(panel, document.body);
  }

  function PaxRow({
    label, hint, value, onDec, onInc, decDisabled, incDisabled, decLabel, incLabel,
  }) {
    return (
      <div className="hero-pax-picker__row">
        <div className="hero-pax-picker__row-labels">
          <span className="hero-pax-picker__label">{label}</span>
          {hint ? <span className="hero-pax-picker__hint-inline">{hint}</span> : null}
        </div>
        <div className="hero-pax-picker__stepper">
          <button type="button" className="hero-pax-picker__step" onClick={onDec} disabled={decDisabled} aria-label={decLabel}>
            <Icon name="minus" size={16} />
          </button>
          <span className="hero-pax-picker__value" aria-live="polite">{value}</span>
          <button type="button" className="hero-pax-picker__step" onClick={onInc} disabled={incDisabled} aria-label={incLabel}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>
    );
  }

  window.AuralisUI.HeroPaxPicker = HeroPaxPicker;
})();
