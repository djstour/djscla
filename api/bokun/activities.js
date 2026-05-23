const { searchActivities } = require('../lib/bokun');
const { normalizeSearchResponse } = require('../lib/normalizeActivity');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uiLang = req.query.lang || 'hant';
  const page = parseInt(req.query.page || '1', 10);
  const pageSize = parseInt(req.query.pageSize || '50', 10);

  try {
    const raw = await searchActivities({ uiLang, page, pageSize });
    const { activities, meta } = normalizeSearchResponse(raw);

    return res.status(200).json({
      source: 'bokun',
      activities,
      meta,
    });
  } catch (err) {
    const status = err.code === 'BOKUN_CONFIG' ? 503 : err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'BOKUN_ERROR',
    });
  }
};
