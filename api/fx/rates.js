const { getFxSnapshot, SUPPORTED, BASE } = require('../../lib/fx');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const snap = await getFxSnapshot({ forceRefresh: req.query.refresh === '1' });
    return res.status(200).json({
      base: snap.base || BASE,
      date: snap.date,
      provider: snap.provider,
      supported: SUPPORTED,
      rates: snap.rates,
      cached: snap.cached,
      stale: snap.stale || false,
      warning: snap.warning || null,
    });
  } catch (err) {
    return res.status(502).json({
      error: err.message,
      code: 'FX_ERROR',
      hint: 'Frankfurter ECB reference rates — check https://www.frankfurter.app',
    });
  }
};
