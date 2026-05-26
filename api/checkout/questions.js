/**
 * POST /api/checkout/questions
 *
 * Returns the dynamic per-product questions Bókun expects in "Step 2:
 * Booking questions" of its hosted checkout. The priority order is:
 *
 *   1. Real Bókun `/checkout.json/questions` — authoritative; surfaces
 *      vendor-defined custom questions verbatim (gender / nationality /
 *      passport / pickup pref / allergies, etc.).
 *   2. Inferred fallback — when Bókun is misconfigured or our items list
 *      doesn't yet have a confirmed startTime, we synthesise a minimal
 *      question set from the normalized activity payload so the UI can
 *      still render Step 2.
 *
 * Request body shape:
 *   {
 *     lang: "hant" | "hans" | "en",
 *     items: [
 *       {
 *         activityId, date, startTimeId,
 *         pricingCategoryBookings: [{ pricingCategoryId, quantity }],
 *         extras?: [{ extraId, quantity }],
 *         pickupPlaceId?: number
 *       }
 *     ]
 *   }
 */

const { getActivityById, getCheckoutQuestions } = require('../../lib/bokun');
const { normalizeActivity } = require('../../lib/normalizeActivity');
const { inferQuestionsFromActivity } = require('../../lib/checkoutQuestions');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeBokunQuestion(q, scope) {
  // Bókun returns a mixed bag of `dataType`/`type`/`fieldType` and option
  // arrays under varying keys depending on the question source (system vs
  // custom). We collapse them into a single shape the UI can render.
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
    scope: scope || q.scope || 'supplier',
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

async function callBokunRealApi(items, lang) {
  // Bókun's batched checkout endpoint is the canonical source. Failures
  // (auth, network, schema mismatch) bubble up so the handler can fall
  // back to inferred questions instead of breaking the checkout flow.
  const data = await getCheckoutQuestions({ items, uiLang: lang });

  // Bókun groups questions under varying keys (`questions` at top level
  // OR `mainContactQuestions` + `activityBookings[].questions` + etc.).
  // Normalise everything into a flat list with deduped IDs.
  const out = [];

  const pushAll = (arr, scope) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((q) => out.push(normalizeBokunQuestion(q, scope)));
  };

  if (Array.isArray(data?.questions)) pushAll(data.questions, 'mixed');
  pushAll(data?.mainContactQuestions, 'contact');
  pushAll(data?.passengerQuestions, 'participants');

  if (Array.isArray(data?.activityBookings)) {
    data.activityBookings.forEach((ab) => {
      pushAll(ab.questions, 'supplier');
      pushAll(ab.passengerQuestions, 'participants');
    });
  }

  // De-dupe by scope:id, preserving the first occurrence (contact > activity > supplier).
  const seen = new Set();
  return out.filter((q) => {
    const key = `${q.scope}:${q.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildInferredQuestions(items, lang) {
  // Fallback: build per-activity inferred questions and merge.
  const perItem = await Promise.all(items.map(async (item) => {
    const activityId = item.activityId != null ? String(item.activityId) : '';
    if (!activityId) return [];
    try {
      const payload = await getActivityById(activityId, { uiLang: lang });
      const activity = normalizeActivity(payload?.activity || payload);
      return inferQuestionsFromActivity(activity, item, lang);
    } catch (err) {
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

  // 1) Try real Bókun API first.
  try {
    const questions = await callBokunRealApi(items, lang);
    if (questions.length) {
      return res.status(200).json({
        source: 'bokun',
        questions,
      });
    }
    // Empty result is unusual — fall through to inferred so the UI still
    // has the basic contact questions to render.
  } catch (err) {
    // Network/auth failures are logged but we keep going — the inferred
    // path is good enough to ship the UX while we debug the integration.
    // eslint-disable-next-line no-console
    console.warn('[checkout/questions] Bókun real-API failed, falling back to inferred:', err.message);
  }

  // 2) Inferred fallback.
  try {
    const questions = await buildInferredQuestions(items, lang);
    return res.status(200).json({
      source: 'inferred',
      questions,
      note: 'Real Bókun /checkout.json/questions unavailable — returning inferred questions.',
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'CHECKOUT_QUESTIONS_ERROR',
    });
  }
};
