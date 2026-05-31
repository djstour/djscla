/**
 * Geo route corridors for Iceland — match activities by stops / meeting points.
 */

const EARTH_RADIUS_KM = 6371;

const GEO_ROUTES = {
  'golden-circle': {
    label: 'Golden Circle',
    bbox: { latMin: 63.8, latMax: 64.5, lngMin: -21.5, lngMax: -20.0 },
    waypoints: [
      [64.1466, -21.9426],
      [64.3104, -20.3024],
      [64.3271, -20.1218],
      [64.0493, -21.1774],
    ],
    maxKm: 40,
  },
  'south-coast': {
    label: 'South Coast',
    bbox: { latMin: 63.3, latMax: 64.0, lngMin: -20.0, lngMax: -16.5 },
    waypoints: [
      [63.4191, -19.0186],
      [63.5321, -19.5112],
      [63.6156, -19.9886],
      [63.8804, -16.6493],
      [64.0479, -16.1794],
    ],
    maxKm: 45,
  },
  'ring-road': {
    label: 'Ring Road',
    bbox: { latMin: 63.3, latMax: 66.6, lngMin: -24.0, lngMax: -13.5 },
    waypoints: [
      [64.1466, -21.9426],
      [64.2559, -15.2083],
      [65.6885, -18.0878],
      [66.0758, -23.1240],
      [63.4191, -19.0186],
      [64.1466, -21.9426],
    ],
    maxKm: 55,
  },
};

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function normalizeGeoPoint(geo) {
  if (!geo || typeof geo !== 'object') return null;
  const lat = Number(geo.latitude ?? geo.lat);
  const lng = Number(geo.longitude ?? geo.lng ?? geo.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function extractActivityGeoPoints(activity) {
  const pts = [];
  const add = (geo) => {
    const p = normalizeGeoPoint(geo);
    if (p) pts.push(p);
  };
  (activity.stops || []).forEach((s) => add(s.geoPoint || s.geo || s.location));
  add(activity.meetingPoint?.geoPoint || activity.meetingPoint);
  add(activity.location);
  return pts;
}

function pointInBbox(lat, lng, bbox) {
  return lat >= bbox.latMin && lat <= bbox.latMax
    && lng >= bbox.lngMin && lng <= bbox.lngMax;
}

function minDistanceToWaypointsKm(lat, lng, waypoints) {
  let min = Infinity;
  waypoints.forEach(([wLat, wLng]) => {
    const d = haversineKm(lat, lng, wLat, wLng);
    if (d < min) min = d;
  });
  return min;
}

function activityMatchesGeoRoute(activity, routeId) {
  if (!routeId || routeId === 'all') return true;
  const route = GEO_ROUTES[routeId];
  if (!route) return true;
  const pts = extractActivityGeoPoints(activity);
  if (!pts.length) return false;
  return pts.some((p) => {
    if (!pointInBbox(p.lat, p.lng, route.bbox)) return false;
    return minDistanceToWaypointsKm(p.lat, p.lng, route.waypoints) <= route.maxKm;
  });
}

function activityGeoRouteScore(activity, routeId) {
  if (!routeId || !GEO_ROUTES[routeId]) return 0;
  const pts = extractActivityGeoPoints(activity);
  if (!pts.length) return 0;
  const route = GEO_ROUTES[routeId];
  let best = Infinity;
  pts.forEach((p) => {
    if (!pointInBbox(p.lat, p.lng, route.bbox)) return;
    const d = minDistanceToWaypointsKm(p.lat, p.lng, route.waypoints);
    if (d < best) best = d;
  });
  if (!Number.isFinite(best)) return 0;
  return Math.max(0, Math.round((route.maxKm - best) / route.maxKm * 100));
}

module.exports = {
  GEO_ROUTES,
  extractActivityGeoPoints,
  activityMatchesGeoRoute,
  activityGeoRouteScore,
};
