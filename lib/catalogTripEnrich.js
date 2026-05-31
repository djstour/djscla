/**
 * Attach Phase-2 trip-fit metadata to catalog activities at serve time.
 */

const { computeScheduleHint, formatScheduleHintLabel } = require('./tripScheduleHint');
const { activityGeoRouteScore, activityMatchesGeoRoute } = require('./tripGeoMatch');
const { activityHasAvailabilityInRange, countAvailabilityInRange } = require('./availabilityWindowSync');

function enrichActivityTripFit(activity, ctx = {}) {
  const {
    tripStart,
    tripEnd,
    geoRoute,
    slotPlan,
    availabilityWindow,
  } = ctx;

  const schedule = computeScheduleHint(activity, {
    startDate: tripStart,
    endDate: tripEnd,
    slotPlan,
  });

  const inRange = activityHasAvailabilityInRange(
    availabilityWindow || activity.availabilityWindow,
    tripStart,
    tripEnd,
  );
  const bookableDaysInTrip = countAvailabilityInRange(
    availabilityWindow || activity.availabilityWindow,
    tripStart,
    tripEnd,
  );

  const geoScore = geoRoute ? activityGeoRouteScore(activity, geoRoute) : 0;

  return {
    scheduleHint: schedule,
    scheduleLabel: formatScheduleHintLabel(schedule, ctx.lang || 'hant'),
    hasAvailabilityInRange: inRange,
    bookableDaysInTrip,
    geoRouteScore: geoScore,
    tripFitScore: schedule.fitScore + geoScore + (inRange === true ? 20 : 0),
  };
}

function enrichActivitiesTripFit(activities, ctx = {}) {
  return activities.map((activity) => {
    const tripFit = enrichActivityTripFit(activity, ctx);
    return { ...activity, tripFit };
  });
}

function sortActivitiesByTripFit(activities) {
  return [...activities].sort((a, b) => {
    const sa = a.tripFit?.tripFitScore || 0;
    const sb = b.tripFit?.tripFitScore || 0;
    return sb - sa;
  });
}

module.exports = {
  enrichActivityTripFit,
  enrichActivitiesTripFit,
  sortActivitiesByTripFit,
  activityMatchesGeoRoute,
};
