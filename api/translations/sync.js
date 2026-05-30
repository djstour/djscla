const { runTranslationSync } = require('../../lib/translationSync');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function checkAuth(req) {
  const secret = (process.env.TRANSLATION_SYNC_SECRET || '').trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkAuth(req)) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: 'Set Authorization: Bearer <TRANSLATION_SYNC_SECRET>',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const activityIds = body.activityIds || body.ids;
    const limit = Math.min(Number(body.limit) || 20, 50);
    const langs = Array.isArray(body.langs) ? body.langs : ['hant', 'hans'];
    const force = body.force === true;
    const forceMarker = body.forceMarker != null ? String(body.forceMarker).trim() : null;
    const maxTranslations = body.maxTranslations != null ? Number(body.maxTranslations) : null;

    const summary = await runTranslationSync({
      activityIds: activityIds ? activityIds.map(Number).filter(Number.isFinite) : undefined,
      limit,
      langs,
      force,
      forceMarker: forceMarker || null,
      uiLang: body.uiLang || 'hant',
      maxTranslations: Number.isFinite(maxTranslations) && maxTranslations > 0 ? maxTranslations : null,
    });

    return res.status(200).json({
      ok: true,
      summary,
    });
  } catch (err) {
    return res.status(err.code === 'OPENAI_CONFIG' ? 503 : 500).json({
      error: err.message,
      code: err.code || 'SYNC_ERROR',
    });
  }
};

/** Hobby ≈10s; Pro can raise in project settings. Use maxTranslations to chunk work. */
handler.config = { maxDuration: 300 };

module.exports = handler;
