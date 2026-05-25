const { readVendorSummaries, summarizeVendors } = require('../../lib/catalogDb');
const { getContractVendorList } = require('../../lib/catalog');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * GET /api/catalog/vendors
 *
 * Returns the contract supplier directory backed by Supabase. Falls back to
 * the static contract list (data/bokunVendors.json) when the DB is empty,
 * keeping the supplier rail working before the first sync runs.
 */
module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const summaries = await readVendorSummaries();
    if (summaries.length) {
      const vendors = summarizeVendors(summaries);
      const contractTotal = vendors.reduce((sum, v) => sum + (v.contractProductCount || 0), 0);
      const lastSyncedAt = summaries.reduce((latest, row) => {
        if (!row.last_synced_at) return latest;
        return !latest || row.last_synced_at > latest ? row.last_synced_at : latest;
      }, null);

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
      return res.status(200).json({
        source: 'db',
        vendors,
        meta: {
          total: vendors.length,
          contractTotal,
          lastSyncedAt,
        },
      });
    }
  } catch (err) {
    console.warn('[Auralis] vendor directory DB read failed, falling back:', err.message);
  }

  const fallback = getContractVendorList().map((v) => ({
    id: v.id != null ? Number(v.id) : null,
    bokunVendorId: v.id != null ? String(v.id) : null,
    title: v.title || `Vendor ${v.id}`,
    slug: null,
    heroImageUrl: null,
    summary: null,
    tags: [],
    contractProductCount: 0,
    uniqueProductCount: 0,
    lastSyncedAt: null,
  }));

  return res.status(200).json({
    source: 'fallback',
    vendors: fallback,
    meta: {
      total: fallback.length,
      contractTotal: 0,
      lastSyncedAt: null,
      hint: 'Run /api/catalog/sync to populate vendor counts.',
    },
  });
};
