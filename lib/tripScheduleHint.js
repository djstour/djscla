/**
 * L2 schedule hints — suggest trip day + time-of-day from duration & startTimes.
 */

function parseDurationMinutes(activity) {
  const mins = Number(activity?.durationMinutes ?? activity?.raw?.durationMinutes);
  if (Number.isFinite(mins) && mins > 0) return mins;
  return null;
}

function earliestStartHour(activity) {
  const times = activity?.startTimes || activity?.raw?.startTimes || [];
  let minHour = null;
  times.forEach((t) => {
    const h = Number(t.hour);
    if (!Number.isFinite(h)) return;
    if (minHour == null || h < minHour) minHour = h;
  });
  return minHour;
}

function isEveningActivity(activity) {
  const hour = earliestStartHour(activity);
  if (hour != null && hour >= 17) return true;
  const chips = activity?.chipIds || activity?.raw?.chipIds || [];
  return chips.includes('aurora');
}

function tripNightCount(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

/**
 * @param {object} activity normalized or view-model shape
 * @param {{ startDate?: string, endDate?: string, slotPlan?: (string|null)[] }} trip
 * @returns {{ dayIndex: number, dayNumber: number, timeKey: string, durationMinutes: number|null, fitScore: number }}
 */
function computeScheduleHint(activity, trip = {}) {
  const nights = tripNightCount(trip.startDate, trip.endDate);
  const dayCount = Math.min(Math.max(nights, 1), 10);
  const durationMin = parseDurationMinutes(activity);
  const evening = isEveningActivity(activity);

  let dayIndex = 0;
  const slotPlan = Array.isArray(trip.slotPlan) ? trip.slotPlan : [];
  const chips = activity?.chipIds || activity?.raw?.chipIds || [];

  if (slotPlan.length) {
    const matchIdx = slotPlan.findIndex((slot) => slot && chips.includes(slot));
    if (matchIdx >= 0 && matchIdx < dayCount) dayIndex = matchIdx;
    else if (evening) {
      dayIndex = Math.min(dayCount - 1, Math.max(1, Math.floor(dayCount / 2)));
    }
  } else if (evening) {
    dayIndex = Math.min(dayCount - 1, Math.max(0, 1));
  } else if (durationMin != null && durationMin >= 8 * 60) {
    dayIndex = Math.min(dayCount - 1, 1);
  }

  const timeKey = evening ? 'evening' : (durationMin != null && durationMin <= 4 * 60 ? 'morning' : 'daytime');

  let fitScore = 50;
  if (slotPlan.length && slotPlan[dayIndex] && chips.includes(slotPlan[dayIndex])) fitScore += 40;
  if (evening && timeKey === 'evening') fitScore += 10;
  if (durationMin != null && durationMin <= 12 * 60) fitScore += 5;

  return {
    dayIndex,
    dayNumber: dayIndex + 1,
    timeKey,
    durationMinutes: durationMin,
    fitScore: Math.min(100, fitScore),
  };
}

function formatScheduleHintLabel(hint, lang = 'hant') {
  if (!hint) return '';
  const day = hint.dayNumber;
  const timeLabels = {
    hant: { morning: '上午', daytime: '日間', evening: '晚間' },
    hans: { morning: '上午', daytime: '日间', evening: '晚间' },
    en: { morning: 'morning', daytime: 'daytime', evening: 'evening' },
  };
  const t = (timeLabels[lang] || timeLabels.en)[hint.timeKey] || hint.timeKey;
  if (lang === 'en') return `Suggested D${day} · ${t}`;
  return `建議 D${day} · ${t}`;
}

module.exports = {
  computeScheduleHint,
  formatScheduleHintLabel,
  parseDurationMinutes,
  tripNightCount,
};
