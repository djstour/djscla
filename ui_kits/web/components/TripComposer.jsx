/* TripComposer — day-slot itinerary builder for Hero (Phase 1 MVP). */

(function () {
  const { useState, useMemo, useEffect } = React;
  const {
    Icon, pick, CATEGORIES, TRIP_COMPOSER_TEMPLATES, TRIP_GEO_ROUTES, tripNightCountFromSearch,
    formatTripSearchDateRange, formatTripSearchPax, loadTripPlan, saveTripPlan,
  } = window.AuralisUI;

  const SLOT_INTENT_LABELS = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, c.label]),
  );
  SLOT_INTENT_LABELS['golden-circle'] = { hant: '黃金圈', hans: '黄金圈', en: 'Golden Circle' };
  SLOT_INTENT_LABELS['south-coast'] = { hant: '南岸', hans: '南岸', en: 'South Coast' };

  function slotLabel(intentId, lang) {
    const labels = SLOT_INTENT_LABELS[intentId];
    return labels ? pick(lang, labels) : intentId;
  }

  function TripComposer({ tripSearch, lang, onBrowse }) {
    const T = (opts) => pick(lang, opts);
    const nights = tripNightCountFromSearch(tripSearch);
    const dayCount = Math.min(Math.max(nights, 1), 10);

    const savedPlan = loadTripPlan();
    const [intents, setIntents] = useState(savedPlan.intents || []);
    const [geoRoute, setGeoRoute] = useState(savedPlan.geoRoute || 'all');
    const [templateRoutes, setTemplateRoutes] = useState([]);
    const [slots, setSlots] = useState(() => {
      const base = Array.isArray(savedPlan.slots) && savedPlan.slots.length
        ? savedPlan.slots.slice(0, dayCount)
        : Array(dayCount).fill(null);
      while (base.length < dayCount) base.push(null);
      return base.slice(0, dayCount);
    });

    useEffect(() => {
      saveTripPlan({ geoRoute, slots, intents });
    }, [geoRoute, slots, intents]);

    useEffect(() => {
      setSlots((prev) => {
        const next = Array(dayCount).fill(null);
        for (let i = 0; i < Math.min(prev.length, dayCount); i += 1) {
          next[i] = prev[i];
        }
        return next;
      });
    }, [dayCount]);

    const templateLabels = TRIP_COMPOSER_TEMPLATES.map((tpl) => pick(lang, tpl.label));

    function toggleIntent(id) {
      setIntents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    function assignSlot(dayIndex) {
      const intent = intents[intents.length - 1] || intents[0];
      if (!intent) return;
      setSlots((prev) => {
        const next = [...prev];
        next[dayIndex] = intent;
        return next;
      });
    }

    function clearSlot(dayIndex) {
      setSlots((prev) => {
        const next = [...prev];
        next[dayIndex] = null;
        return next;
      });
    }

    function applyTemplate(tpl) {
      setIntents(tpl.intents.slice());
      setTemplateRoutes(tpl.routes ? tpl.routes.slice() : []);
      if (tpl.routes && tpl.routes[0]) setGeoRoute(tpl.routes[0]);
      const nextSlots = Array(dayCount).fill(null);
      tpl.slots.forEach((intentId, i) => {
        if (i < dayCount) nextSlots[i] = intentId;
      });
      setSlots(nextSlots);
    }

    const slotIntents = useMemo(
      () => [...new Set(slots.filter(Boolean))],
      [slots],
    );

    function handleBrowse() {
      const browseIntents = slotIntents.length ? slotIntents : intents;
      if (onBrowse) {
        onBrowse({
          intents: browseIntents,
          routes: templateRoutes,
          slots,
          geoRoute,
        });
      }
    }

    return (
      <div className="trip-composer">
        <div className="trip-composer__meta">
          <span>{formatTripSearchDateRange(tripSearch, lang)}</span>
          <span className="trip-composer__meta-sep" aria-hidden="true">·</span>
          <span>{formatTripSearchPax(tripSearch, lang)}</span>
          <span className="trip-composer__meta-sep" aria-hidden="true">·</span>
          <span>{T({ hant: `${dayCount} 天`, hans: `${dayCount} 天`, en: `${dayCount} day${dayCount === 1 ? '' : 's'}` })}</span>
        </div>

        <p className="trip-composer__hint">
          {T({
            hant: '先排你的行程表，再瀏覽符合的體驗；空位與價格在詳情頁確認。',
            hans: '先排你的行程表，再浏览符合的体验；空位与价格在详情页确认。',
            en: 'Sketch your days first, then browse matching tours. Availability is confirmed on each page.',
          })}
        </p>

        <div
          className="trip-composer__timeline"
          role="list"
          aria-label={T({ hant: '行程天數', hans: '行程天数', en: 'Trip days' })}
        >
          {slots.map((intentId, i) => (
            <div key={i} className="trip-composer__day" role="listitem">
              <span className="trip-composer__day-label">
                {T({ hant: `D${i + 1}`, hans: `D${i + 1}`, en: `D${i + 1}` })}
              </span>
              {intentId ? (
                <button
                  type="button"
                  className="trip-composer__slot trip-composer__slot--filled"
                  onClick={() => clearSlot(i)}
                  title={T({ hant: '清除', hans: '清除', en: 'Clear' })}
                >
                  {slotLabel(intentId, lang)}
                </button>
              ) : (
                <button
                  type="button"
                  className="trip-composer__slot"
                  onClick={() => assignSlot(i)}
                  disabled={!intents.length}
                >
                  <Icon name="plus" size={14} />
                  {T({ hant: '加入', hans: '加入', en: 'Add' })}
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          className="trip-composer__intents"
          role="group"
          aria-label={T({ hant: '想體驗的類型', hans: '想体验的类型', en: 'Experience types' })}
        >
          <span className="trip-composer__intents-label">
            {T({ hant: '想體驗：', hans: '想体验：', en: 'I want:' })}
          </span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`trip-composer__intent${intents.includes(cat.id) ? ' is-active' : ''}`}
              aria-pressed={intents.includes(cat.id)}
              onClick={() => toggleIntent(cat.id)}
            >
              {pick(lang, cat.label)}
            </button>
          ))}
        </div>

        <div
          className="trip-composer__geo-routes"
          role="group"
          aria-label={T({ hant: '路線方向', hans: '路线方向', en: 'Route corridor' })}
        >
          <span className="trip-composer__geo-routes-label">
            {T({ hant: '路線：', hans: '路线：', en: 'Route:' })}
          </span>
          {TRIP_GEO_ROUTES.map((route) => (
            <button
              key={route.id}
              type="button"
              className={`trip-composer__geo-route${geoRoute === route.id ? ' is-active' : ''}`}
              aria-pressed={geoRoute === route.id}
              onClick={() => setGeoRoute(route.id)}
            >
              {pick(lang, route.label)}
            </button>
          ))}
        </div>

        <div className="trip-composer__templates">
          <span className="trip-composer__templates-label">
            {T({ hant: '熱門組合：', hans: '热门组合：', en: 'Quick combos:' })}
          </span>
          {TRIP_COMPOSER_TEMPLATES.map((tpl, i) => (
            <button
              key={tpl.id}
              type="button"
              className="trip-composer__template"
              onClick={() => applyTemplate(tpl)}
            >
              {templateLabels[i]}
            </button>
          ))}
        </div>

        <button type="button" className="trip-composer__browse" onClick={handleBrowse}>
          <Icon name="arrow-right" size={18} />
          {T({
            hant: slotIntents.length || intents.length
              ? '瀏覽符合的體驗'
              : '瀏覽全部體驗',
            hans: slotIntents.length || intents.length
              ? '浏览符合的体验'
              : '浏览全部体验',
            en: slotIntents.length || intents.length
              ? 'Browse matching tours'
              : 'Browse all tours',
          })}
        </button>
      </div>
    );
  }

  window.AuralisUI.TripComposer = TripComposer;
})();
