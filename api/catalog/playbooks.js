const { fetchTripPlaybooksForHero, fetchPlaybookBySlug } = require('../../lib/tripPlaybooks');
const { slimActivityForList } = require('../../lib/slimActivity');
const { loadTranslationsForActivities } = require('../../lib/attachTranslations');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const lang = req.query.lang || 'hant';
  const slug = req.query.slug;
  const tripNights = req.query.nights != null ? parseInt(req.query.nights, 10) : null;
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : null;
  const hubId = typeof req.query.hubId === 'string' ? req.query.hubId.trim() : null;

  try {
    if (slug) {
      const playbook = await fetchPlaybookBySlug(slug, { lang });
      if (!playbook) return res.status(404).json({ error: 'Playbook not found', code: 'PLAYBOOK_NOT_FOUND' });
      const slim = (playbook.activities || []).map(slimActivityForList);
      const translations = await loadTranslationsForActivities(slim);
      return res.status(200).json({
        playbook: {
          ...playbook,
          activities: slim,
        },
        translations,
      });
    }

    const { playbooks, meta } = await fetchTripPlaybooksForHero({
      lang,
      tripNights: Number.isFinite(tripNights) ? tripNights : null,
      startDate: startDate || null,
      hubId: hubId || null,
    });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ playbooks, meta });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
      code: err.code || 'PLAYBOOKS_ERROR',
    });
  }
};
