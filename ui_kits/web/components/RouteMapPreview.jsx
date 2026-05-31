/* RouteMapPreview — Iceland corridor + activity pins (Phase 2). */

(function () {
  const { useMemo } = React;
  const { pick, TRIP_GEO_ROUTES, TRIP_GEO_ROUTE_WAYPOINTS } = window.AuralisUI;

  const MAP_BOUNDS = { latMin: 63.2, latMax: 66.7, lngMin: -24.5, lngMax: -13.2 };

  function project(lat, lng) {
    const x = ((lng - MAP_BOUNDS.lngMin) / (MAP_BOUNDS.lngMax - MAP_BOUNDS.lngMin)) * 100;
    const y = ((MAP_BOUNDS.latMax - lat) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * 100;
    return { x, y };
  }

  function normalizePoint(geo) {
    if (!geo || typeof geo !== 'object') return null;
    const lat = Number(geo.latitude ?? geo.lat);
    const lng = Number(geo.longitude ?? geo.lng ?? geo.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function extractPins(activity) {
    const pts = [];
    const add = (geo) => {
      const p = normalizePoint(geo);
      if (p) pts.push(p);
    };
    (activity.stops || []).forEach((s) => add(s.geo || s.geoPoint));
    add(activity.meetingPoint && (activity.meetingPoint.geoPoint || activity.meetingPoint));
    add(activity.location);
    return pts;
  }

  function RouteMapPreview({ activities = [], geoRoute = 'all', lang = 'hant', compact = false }) {
    const T = (opts) => pick(lang, opts);
    const routeMeta = TRIP_GEO_ROUTES.find((r) => r.id === geoRoute);
    const waypoints = TRIP_GEO_ROUTE_WAYPOINTS[geoRoute] || [];

    const corridorPath = useMemo(() => {
      if (!waypoints.length) return '';
      return waypoints
        .map(([lat, lng], i) => {
          const { x, y } = project(lat, lng);
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(' ');
    }, [geoRoute, waypoints]);

    const pins = useMemo(() => {
      const seen = new Set();
      const out = [];
      activities.forEach((vm) => {
        extractPins(vm).forEach((p) => {
          const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ ...project(p.lat, p.lng), title: vm.title });
        });
      });
      return out.slice(0, 24);
    }, [activities]);

    if (!geoRoute || geoRoute === 'all') return null;

    return (
      <div className={`route-map-preview${compact ? ' route-map-preview--compact' : ''}`}>
        <div className="route-map-preview__header">
          <span className="route-map-preview__title">
            {routeMeta ? pick(lang, routeMeta.label) : geoRoute}
          </span>
          <span className="route-map-preview__count">
            {T({
              hant: `${pins.length} 個停靠點`,
              hans: `${pins.length} 个停靠点`,
              en: `${pins.length} stop${pins.length === 1 ? '' : 's'}`,
            })}
          </span>
        </div>
        <svg
          className="route-map-preview__svg"
          viewBox="0 0 100 100"
          role="img"
          aria-label={T({
            hant: '路線地圖預覽',
            hans: '路线地图预览',
            en: 'Route map preview',
          })}
        >
          <rect x="0" y="0" width="100" height="100" rx="8" className="route-map-preview__bg" />
          {corridorPath && (
            <path
              d={corridorPath}
              className="route-map-preview__corridor"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {pins.map((pin, i) => (
            <g key={i} className="route-map-preview__pin">
              <circle cx={pin.x} cy={pin.y} r="2.2" />
              <title>{pin.title}</title>
            </g>
          ))}
        </svg>
      </div>
    );
  }

  window.AuralisUI.RouteMapPreview = RouteMapPreview;
})();
