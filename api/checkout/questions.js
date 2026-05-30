/**
 * POST /api/checkout/questions
 *
 * v2: reads BOOKING_QUESTIONS from experience components; falls back to inferred
 * questions from normalized activity (hosted checkout collects answers on Bókun).
 */

const { getActivityById } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { inferQuestionsFromActivity } = require('../../lib/checkoutQuestions');
const { enrichPricingCategoriesFromV1 } = require('../../lib/bokunPricingCategoriesV1Fallback');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeV2Question(q, scope) {
  const rawType = String(q.dataType || q.type || q.fieldType || 'text').toUpperCase();
  const typeMap = {
    STRING: 'text', TEXT: 'text', TEXTAREA: 'textarea',
    EMAIL: 'email', PHONE: 'tel',
    INTEGER: 'number', NUMBER: 'number', DOUBLE: 'number',
    DATE: 'date', DATETIME: 'datetime',
    BOOLEAN: 'boolean', CHECKBOX: 'boolean',
    OPTIONS: 'options', SELECT: 'options', DROPDOWN: 'options', RADIO: 'options',
    COUNTRY: 'country', NATIONALITY: 'country', LANGUAGE: 'language',
  };
  return {
    id: String(q.id ?? q.questionId ?? q.code ?? q.label ?? 'q'),
    scope: scope || 'supplier',
    type: typeMap[rawType] || 'text',
    label: q.label || q.question || q.title || q.text || 'Question',
    helpText: q.helpText || q.description || null,
    required: q.required !== false && q.optional !== true,
    placeholder: q.placeholder || null,
    options: Array.isArray(q.options || q.values)
      ? (q.options || q.values).map((opt) => ({
          value: String(opt.value ?? opt.id ?? opt.code ?? opt.title ?? opt.label),
          label: opt.label || opt.title || String(opt.value ?? opt.id ?? opt.code),
        }))
      : undefined,
    activityId: q.activityId ?? null,
    perPassenger: q.perPassenger === true || q.askPerPassenger === true,
  };
}

function questionsFromV2Raw(raw) {
  const rows = Array.isArray(raw?.bookingQuestions) ? raw.bookingQuestions : [];
  return rows.map((q) => normalizeV2Question(q, 'supplier'));
}

async function buildInferredQuestions(items, lang) {
  const perItem = await Promise.all(items.map(async (item) => {
    const activityId = item.activityId != null ? String(item.activityId) : '';
    if (!activityId) return [];
    try {
      const payload = await getActivityById(activityId, { uiLang: lang });
      let activity = normalizeActivity(payload?.activity || payload);
      activity = await enrichPricingCategoriesFromV1(activity);
      return inferQuestionsFromActivity(activity, item, lang, { skipContactQuestions: true });
    } catch {
      return [];
    }
  }));

  const merged = [];
  const seen = new Set();
  perItem.flat().forEach((q) => {
    const key = `${q.scope}:${q.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(q);
  });
  return merged;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    const perItem = await Promise.all(items.map(async (item) => {
      const activityId = item.activityId != null ? String(item.activityId) : '';
      if (!activityId) return [];
      const raw = await getActivityById(activityId, { uiLang: lang });
      return questionsFromV2Raw(raw);
    }));

    const merged = [];
    const seen = new Set();
    perItem.flat().forEach((q) => {
      const key = `${q.scope}:${q.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(q);
    });

    if (merged.length) {
      return res.status(200).json({ source: 'bokun-v2', questions: merged });
    }

    const inferred = await buildInferredQuestions(items, lang);
    return res.status(200).json({
      source: 'inferred',
      questions: inferred,
      note: 'No v2 BOOKING_QUESTIONS on product — using inferred questions.',
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CHECKOUT_QUESTIONS_ERROR',
    });
  }
};
