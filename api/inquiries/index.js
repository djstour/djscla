const { insertSupabaseRows } = require('../../lib/supabase');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isValidDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = body.phone ? String(body.phone).trim() : null;
  const lang = ['hant', 'hans', 'en'].includes(body.lang) ? body.lang : 'hant';
  const pax = body.pax == null ? null : Number(body.pax);
  const selectedTrip = Array.isArray(body.selectedTrip) ? body.selectedTrip : [];

  if (!name || !email) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: 'INVALID_INQUIRY',
      fields: ['name', 'email'],
    });
  }

  if (body.travelStartDate && !isValidDate(body.travelStartDate)) {
    return res.status(400).json({ error: 'travelStartDate must be YYYY-MM-DD', code: 'INVALID_DATE' });
  }
  if (body.travelEndDate && !isValidDate(body.travelEndDate)) {
    return res.status(400).json({ error: 'travelEndDate must be YYYY-MM-DD', code: 'INVALID_DATE' });
  }
  if (pax != null && (!Number.isFinite(pax) || pax <= 0)) {
    return res.status(400).json({ error: 'pax must be a positive integer', code: 'INVALID_PAX' });
  }

  try {
    const rows = await insertSupabaseRows('inquiries', [{
      status: 'new',
      name,
      email,
      phone,
      lang,
      travel_start_date: body.travelStartDate || null,
      travel_end_date: body.travelEndDate || null,
      pax: pax == null ? null : Math.round(pax),
      budget_range: body.budgetRange ? String(body.budgetRange).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      selected_trip: selectedTrip,
      source_page: body.sourcePage ? String(body.sourcePage).trim() : null,
    }]);

    const created = Array.isArray(rows) ? rows[0] : null;
    return res.status(201).json({
      ok: true,
      inquiry: created ? {
        id: created.id,
        status: created.status,
        createdAt: created.created_at,
      } : null,
    });
  } catch (err) {
    const status = err.code === 'SUPABASE_WRITE_DISABLED' || err.code === 'SUPABASE_CONFIG' ? 503 : 502;
    return res.status(status).json({
      error: err.message,
      code: err.code || 'INQUIRY_CREATE_ERROR',
    });
  }
};
