const { runAutoTranslationSync } = require('../../lib/translationSync');

/**
 * Vercel Cron entry — translates the next batch of activities that are missing/stale.
 * Auth: Authorization: Bearer <CRON_SECRET> (Vercel sets CRON_SECRET when crons are enabled)
 *       or TRANSLATION_SYNC_SECRET as fallback.
 */
function checkCronAuth(req) {
  const secret = (process.env.CRON_SECRET || process.env.TRANSLATION_SYNC_SECRET || '').trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkCronAuth(req)) {
    return res.status(401).json({
      error: 'Unauthorized',
      hint: 'Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Set CRON_SECRET or reuse TRANSLATION_SYNC_SECRET.',
    });
  }

  const maxActivities = Math.min(
    Number(process.env.TRANSLATION_CRON_MAX_ACTIVITIES) || 12,
    30,
  );

  try {
    const summary = await runAutoTranslationSync({
      maxActivities,
      langs: ['hant', 'hans'],
      uiLang: 'hant',
    });

    return res.status(200).json({
      ok: true,
      mode: 'auto',
      maxActivities,
      summary,
    });
  } catch (err) {
    return res.status(err.code === 'OPENAI_CONFIG' ? 503 : 500).json({
      error: err.message,
      code: err.code || 'CRON_SYNC_ERROR',
    });
  }
}

handler.config = { maxDuration: 300 };

module.exports = handler;
