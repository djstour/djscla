/**
 * Map REST v2 ExperienceAvailabilityDto → legacy availability row shape
 * used by api/availability/* and pricing helpers.
 */

function mapV2AvailabilitySlot(slot, startTimesById = new Map()) {
  if (!slot || !slot.date) return null;
  const startTimeId = slot.startTimeId != null ? Number(slot.startTimeId) : null;
  const st = startTimeId != null ? startTimesById.get(startTimeId) : null;
  const remaining = Number(slot.remainingPax);
  const soldOut = Number.isFinite(remaining) && remaining <= 0;

  return {
    id: slot.id || `${startTimeId || 'slot'}_${String(slot.date).replace(/-/g, '')}`,
    localDate: slot.date,
    dateString: slot.date,
    startTimeId,
    startTime: slot.time || st?.time || st?.label || null,
    startTimeLabel: st?.title || st?.label || slot.time || null,
    soldOut,
    unavailable: soldOut,
    availabilityCount: Number.isFinite(remaining) ? remaining : null,
    unlimitedAvailability: false,
    minParticipants: Number(slot.minPax) || 1,
    minParticipantsToBookNow: Number(slot.minPax) || 1,
    remainingPax: remaining,
    guidedLanguages: slot.guidedLanguages || [],
    pricesByRate: [],
  };
}

function indexStartTimes(startTimes) {
  const map = new Map();
  (startTimes || []).forEach((st) => {
    if (st && st.id != null) map.set(Number(st.id), st);
  });
  return map;
}

function mapV2AvailabilityList(v2Slots, { startTimes } = {}) {
  const bySt = indexStartTimes(startTimes);
  return (Array.isArray(v2Slots) ? v2Slots : [])
    .map((row) => mapV2AvailabilitySlot(row, bySt))
    .filter(Boolean);
}

module.exports = {
  mapV2AvailabilitySlot,
  mapV2AvailabilityList,
  indexStartTimes,
};
