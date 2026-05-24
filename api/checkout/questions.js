const { getActivityById } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { inferQuestionsFromActivity } = require('../../lib/checkoutQuestions');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const items = Array.isArray(body.items) ? body.items : [];
  const lang = body.lang || 'hant';

  if (!items.length) {
    return res.status(400).json({
      error: 'items[] is required',
      code: 'INVALID_CHECKOUT_ITEMS',
    });
  }

  try {
    const results = await Promise.all(items.map(async (item) => {
      const activityId = item.activityId != null ? String(item.activityId) : '';
      if (!activityId) {
        return {
          activityId: null,
          questions: [],
          error: 'Missing activityId',
        };
      }

      const payload = await getActivityById(activityId, { uiLang: lang });
      const activity = normalizeActivity(payload?.activity || payload);

      return {
        activityId,
        bookingType: activity.bookingType,
        questions: inferQuestionsFromActivity(activity, item, lang),
      };
    }));

    const merged = [];
    const seen = new Set();
    results.forEach((entry) => {
      (entry.questions || []).forEach((q) => {
        const key = `${q.scope}:${q.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(q);
      });
    });

    return res.status(200).json({
      source: 'auralis-preview',
      questions: merged,
      items: results,
      note: 'Questions are inferred from product shape for now. Replace with Bokun checkout options before production launch.',
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CHECKOUT_QUESTIONS_ERROR',
    });
  }
};
