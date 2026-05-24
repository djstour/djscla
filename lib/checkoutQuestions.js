function normalizeQuestionId(label) {
  return String(label || 'field')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
}

function baseContactQuestions(lang) {
  const copy = {
    full_name: {
      hant: '聯絡人姓名',
      hans: '联系人姓名',
      en: 'Contact name',
    },
    email: {
      hant: '電子郵件',
      hans: '电子邮箱',
      en: 'Email',
    },
    phone: {
      hant: '手機號碼',
      hans: '手机号',
      en: 'Phone number',
    },
  };

  return [
    { id: 'contact_name', scope: 'contact', type: 'text', label: copy.full_name[lang] || copy.full_name.en, required: true },
    { id: 'contact_email', scope: 'contact', type: 'email', label: copy.email[lang] || copy.email.en, required: true },
    { id: 'contact_phone', scope: 'contact', type: 'tel', label: copy.phone[lang] || copy.phone.en, required: true },
  ];
}

function inferQuestionsFromActivity(activity, item, lang = 'hant') {
  const questions = [...baseContactQuestions(lang)];

  if (activity.bookingType === 'DATE' || activity.bookingType === 'DATE_AND_TIME') {
    questions.push({
      id: 'travel_date',
      scope: 'activity',
      type: 'date',
      label: lang === 'en' ? 'Travel date' : lang === 'hans' ? '出发日期' : '出發日期',
      required: true,
    });
  }

  if (activity.bookingType === 'DATE_AND_TIME') {
    questions.push({
      id: 'start_time_id',
      scope: 'activity',
      type: 'options',
      label: lang === 'en' ? 'Departure time' : lang === 'hans' ? '出发时段' : '出發時段',
      required: true,
      options: (activity.startTimes || []).map((st, index) => ({
        value: String(st.id ?? st.startTimeId ?? st.label ?? index),
        label: st.label || st.startTime || `${String(st.hour || '').padStart(2, '0')}:${String(st.minute || '').padStart(2, '0')}`,
      })),
    });
  }

  const passengerCount = Array.isArray(item?.pax)
    ? item.pax.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
    : 0;

  if (passengerCount > 1) {
    questions.push({
      id: 'lead_traveler_name',
      scope: 'participants',
      type: 'text',
      label: lang === 'en' ? 'Lead traveler name' : lang === 'hans' ? '主要旅客姓名' : '主要旅客姓名',
      required: true,
    });
  }

  const productQuestions = Array.isArray(activity.bookingQuestions) ? activity.bookingQuestions : [];
  productQuestions.forEach((q, index) => {
    questions.push({
      id: q.id != null ? String(q.id) : `${normalizeQuestionId(q.label || q.question || `product_${index + 1}`)}`,
      scope: 'supplier',
      type: String(q.dataType || q.type || 'text').toLowerCase(),
      label: q.label || q.question || q.title || `Question ${index + 1}`,
      required: q.required !== false,
      options: Array.isArray(q.options)
        ? q.options.map((opt) => ({
            value: String(opt.value ?? opt.id ?? opt.code ?? opt.title ?? opt.label),
            label: opt.label || opt.title || String(opt.value ?? opt.id ?? opt.code),
          }))
        : undefined,
    });
  });

  return questions;
}

module.exports = {
  inferQuestionsFromActivity,
};
