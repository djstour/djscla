/**
 * Rank-first trip context — boost scores, never hard-filter.
 */

const { activityMatchesTripHub } = require('./tripHubMatch');

function parseIdList(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function computeTripRankScore(activity, ctx = {}) {
  const id = activity?.id != null ? String(activity.id) : '';
  const playbookIds = parseIdList(ctx.playbookActivityIds);
  const prefChips = parseIdList(ctx.preferenceChips);
  const prefRoutes = parseIdList(ctx.preferenceRoutes);
  const live = ctx.liveAvailability || {};

  let score = 0;
  const reasons = [];

  if (live[id] === true) {
    score += 40;
    reasons.push('liveAvailable');
  }
  if (playbookIds.includes(id)) {
    score += 30;
    reasons.push('playbook');
  }
  prefChips.forEach((chip) => {
    if ((activity.chipIds || []).includes(chip)) {
      score += 25;
      reasons.push(`chip:${chip}`);
    }
  });
  prefRoutes.forEach((route) => {
    if ((activity.routeIds || []).includes(route)) {
      score += 15;
      reasons.push(`route:${route}`);
    }
  });
  if (ctx.hub && ctx.hub !== 'reykjavik' && activityMatchesTripHub(activity, ctx.hub)) {
    score += 10;
    reasons.push('hub');
  }
  const rating = Number(activity.averageRating);
  if (Number.isFinite(rating) && rating >= 4.5) score += 5;
  const reviews = Number(activity.reviewCount);
  if (Number.isFinite(reviews) && reviews >= 30) score += 3;

  return {
    score,
    liveAvailable: live[id] === true,
    reasons,
  };
}

function attachTripRank(activity, ctx = {}) {
  const tripRank = computeTripRankScore(activity, ctx);
  return { ...activity, tripRank };
}

function sortActivitiesByTripContext(activities, ctx = {}) {
  return [...activities]
    .map((a) => attachTripRank(a, ctx))
    .sort((a, b) => {
      const sa = a.tripRank?.score || 0;
      const sb = b.tripRank?.score || 0;
      if (sb !== sa) return sb - sa;
      const ra = Number(a.averageRating) || 0;
      const rb = Number(b.averageRating) || 0;
      if (rb !== ra) return rb - ra;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

module.exports = {
  computeTripRankScore,
  attachTripRank,
  sortActivitiesByTripContext,
  parseIdList,
};
