/* bokunSectionLabels.js — Bókun back-office / widget section titles (source of truth for EN). */
(function (root) {
  const BOKUN_SECTION_LABELS = {
    tabs: {
      description: { hant: '行程說明', hans: '行程说明', en: 'Description' },
      itinerary: { hant: '行程安排', hans: '行程安排', en: 'Itinerary' },
      pickup: { hant: '接送地點', hans: '接送地点', en: 'Pick-up' },
    },
    detail: {
      included: { hant: '費用包含', hans: '费用包含', en: "What's included" },
      excluded: { hant: '費用不含', hans: '费用不含', en: 'Exclusions' },
      pleaseNote: { hant: '請注意', hans: '请注意', en: 'Please note' },
      whatToBring: { hant: '需要攜帶什麼？', hans: '需要携带什么？', en: 'What do I need to bring?' },
      cancellationPolicy: { hant: '取消政策', hans: '取消政策', en: 'Cancellation policy' },
      quickFacts: { hant: '快速資訊', hans: '快速资讯', en: 'Quick facts' },
      meetingPoint: { hant: '集合地點', hans: '集合地点', en: 'Meeting point' },
      optionalExtras: { hant: '加購項目', hans: '加购项目', en: 'Extras' },
    },
    quickFacts: {
      experienceType: { hant: '行程類型', hans: '行程类型', en: 'Experience type' },
      duration: { hant: '時長', hans: '时长', en: 'Duration' },
      bookingInAdvance: { hant: '預訂提前期', hans: '预订提前期', en: 'Booking in advance' },
      physicalDifficulty: { hant: '體能難度', hans: '体能难度', en: 'Physical difficulty level' },
      knowBeforeYouGo: { hant: '出發前須知', hans: '出发前须知', en: 'Know before you go' },
      categories: { hant: '分類', hans: '分类', en: 'Categories' },
      liveTourGuide: { hant: '隨團導遊語言', hans: '随团导游语言', en: 'Live tour guide' },
      freeCancellation: { hant: '免費取消', hans: '免费取消', en: 'Free cancellation' },
      startTimes: { hant: '出發時間', hans: '出发时间', en: 'Starting times' },
    },
  };

  const target = typeof root !== 'undefined' ? root : globalThis;
  target.AuralisData = target.AuralisData || {};
  target.AuralisData.BOKUN_SECTION_LABELS = BOKUN_SECTION_LABELS;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BOKUN_SECTION_LABELS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
