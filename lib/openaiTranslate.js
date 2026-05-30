const { formatGlossaryBlock } = require('./glossary');

const MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o';

const LANG_LABELS = {
  hant: 'Traditional Chinese (Taiwan standard)',
  hans: 'Simplified Chinese (Mainland China standard)',
};

function systemPrompt() {
  return `You are a localisation editor for DJS Tour, a premium Iceland OTA for Mandarin-speaking adventurers (primary market: Taiwan, secondary: Mainland China and Singapore).

Style: confident, curious, slightly poetic — never breathless, never corporate. Use sentence case.
Use 你 (informal) in product copy. Use full-width Chinese punctuation where appropriate.

When translating to Traditional Chinese: Taiwan vocabulary (健行 for hiking, 嚮導 for guide, 結帳 for checkout, 雷克雅維克 for Reykjavík).
When translating to Simplified Chinese: Mainland vocabulary (徒步 for hiking, 向导 for guide, 结账 for checkout, 雷克雅未克 for Reykjavík).

Never invent product features. Prefer fidelity over flourish. Return valid JSON only.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  const s = Number(status) || 0;
  return s === 408 || s === 409 || s === 425 || s === 429 || s >= 500;
}

function classifyError(err) {
  if (err && err.code === 'LENGTH_SANITY') return false;
  if (err && err.code === 'OPENAI_CONFIG') return false;
  if (err && err.code === 'OPENAI_EMPTY_TRANSLATION') return false;
  if (err && err.code === 'OPENAI_INVALID_JSON_PAYLOAD') return true;
  if (err && err.code === 'OPENAI_INVALID_JSON') return true;
  if (err && err.status && isTransientStatus(err.status)) return true;
  return false;
}

/**
 * Reject empty/garbled output. English→CJK is often much shorter than 1:1 by char count.
 * Short labels (mode, titles) routinely compress to a few characters — use looser bounds.
 */
function lengthOk(source, translation, lang, fieldPath = '') {
  const s = source.length;
  const t = translation.length;
  if (s === 0) return t > 0;
  if (t === 0) return false;

  const isCjk = lang === 'hant' || lang === 'hans';
  const ratio = t / s;
  const path = String(fieldPath || '');
  const shortLabel = path === 'mode' || path === 'title' || path === 'itinerary stop name' || s <= 24;

  // Category/mode labels: accept any non-empty CJK line (ratio rules are unreliable).
  if (path === 'mode' && isCjk) {
    return /[\u4e00-\u9fff]/.test(translation);
  }

  // Extremely short labels (title/stop names) can legitimately become 1-2 chars.
  // For these fields, non-empty CJK output is enough; ratio checks are too strict.
  if (shortLabel && isCjk) {
    return /[\u4e00-\u9fff]/.test(translation);
  }

  if (isCjk) {
    if (s <= 150) {
      return ratio >= 0.25 && ratio <= 3;
    }
    if (ratio >= 0.08 && ratio <= 2.5) return true;
    // Long Bókun HTML summaries: Chinese copy is routinely 10–30% of English char length.
    return t >= Math.min(60, Math.floor(s * 0.06));
  }

  return ratio >= 0.4 && ratio <= 1.6;
}

/**
 * @param {{ fieldType: string, source: string, lang: 'hant'|'hans' }} opts
 * @returns {Promise<{ translation: string, notes: string|null }>}
 */
async function translateField({ fieldType, source, lang }) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not set');
    err.code = 'OPENAI_CONFIG';
    throw err;
  }

  const glossary = formatGlossaryBlock(lang);
  const preserveParagraphs = fieldType === 'description'
    || /Html$/.test(fieldType)
    || /\n{2,}/.test(source);
  const listRule = /Html$/.test(fieldType)
    ? '\nThis field is a bullet list from HTML: keep each list item as its own paragraph separated by a blank line (\\n\\n). Never merge items into one paragraph.\n'
    : '';
  const paragraphRule = preserveParagraphs
    ? `\nPreserve paragraph breaks: when the source has a blank line, keep exactly two newline characters (\\n\\n) between paragraphs in the translation. Do not merge paragraphs into one block.\n${listRule}`
    : '';
  const linkRule = /\[[^\]]+\]\(https?:\/\//.test(source) || /\[[^\]]+\]\(mailto:/.test(source)
    ? '\nPreserve markdown links exactly as [visible text](url): translate only the visible text inside the brackets; keep each URL unchanged.\n'
    : '';
  const userContent = `Translate this ${fieldType} from English to ${LANG_LABELS[lang] || lang}.
${paragraphRule}${linkRule}
Glossary (honour exactly when these English terms or phrases appear):
${glossary}

Source:
"${source.replace(/"/g, '\\"')}"

Return JSON: { "translation": string, "notes": string|null }`;

  async function requestOnce() {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: userContent },
        ],
      }),
    });

    const bodyText = await res.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      const err = new Error(`OpenAI response was not valid JSON (${res.status})`);
      err.code = 'OPENAI_INVALID_JSON';
      err.status = res.status;
      throw err;
    }

    if (!res.ok) {
      const err = new Error(`OpenAI ${res.status}: ${JSON.stringify(body.error || body).slice(0, 300)}`);
      err.code = `OPENAI_HTTP_${res.status}`;
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const maxAttempts = Math.min(Math.max(Number(process.env.OPENAI_TRANSLATION_ATTEMPTS) || 3, 1), 5);
  const backoffMs = [0, 350, 1200, 3000, 6000];
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const body = await requestOnce();
      const raw = body.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const err = new Error('OpenAI returned invalid JSON payload');
        err.code = 'OPENAI_INVALID_JSON_PAYLOAD';
        throw err;
      }

      const translation = (parsed.translation || '').trim();
      if (!translation) {
        const err = new Error('OpenAI returned empty translation');
        err.code = 'OPENAI_EMPTY_TRANSLATION';
        throw err;
      }
      if (!lengthOk(source, translation, lang, fieldType)) {
        const err = new Error('Translation failed length sanity check');
        err.code = 'LENGTH_SANITY';
        err.meta = { fieldType, sourceLen: source.length, translationLen: translation.length };
        throw err;
      }

      return { translation, notes: parsed.notes || null, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const transient = classifyError(err);
      const canRetry = transient && attempt < maxAttempts;
      if (canRetry) {
        await sleep(backoffMs[Math.min(attempt, backoffMs.length - 1)]);
        continue;
      }
      err.meta = {
        ...(err.meta || {}),
        transient,
        attempts: attempt,
        maxAttempts,
      };
      throw err;
    }
  }

  throw lastErr || new Error('OpenAI translation failed');
}

function getTranslationModel() {
  return MODEL;
}

module.exports = { translateField, lengthOk, getTranslationModel };
