/**
 * POST /api/checkout/booking
 *
 * Validates a finalised checkout draft (contact + items + answers) and
 * returns a Bókun hosted-checkout URL the browser can redirect to. The
 * actual money movement happens on Bókun's hosted page — we never see
 * card numbers.
 *
 * Why a server endpoint instead of redirecting from the browser?
 *   • We sign-and-store the inquiry in Supabase so we have a record even
 *     if the visitor abandons on Bókun's page.
 *   • We hide the BOKUN_SHOP_URL slug — if a vendor rotates subdomains
 *     we just update the env var instead of pushing client code.
 *   • We validate `items[]` server-side so a stale browser can't redirect
 *     people to a malformed URL.
 *
 * Request body shape:
 *   {
 *     lang: "hant" | "hans" | "en",
 *     contact: { firstName, lastName, email, phone, phoneCountryCode, marketingOptIn },
 *     items: [
 *       {
 *         activityId, date, startTimeId, pickupPlaceId,
 *         pricingCategoryBookings: [{ pricingCategoryId, quantity }],
 *         extras: [{ extraId, quantity }]
 *       }
 *     ],
 *     answers: { [scopeId]: value }  // optional — passed through but not
 *                                    // sent to Bókun (hosted page asks again)
 *   }
 *
 * Response shape:
 *   { ok: true, hostedCheckoutUrl: "https://djs-tour.bokun.io/…", inquiryId: "uuid" }
 */

const { buildHostedCheckoutUrl, getShopHost } = require('../../lib/bokunCheckoutUrl');
const { supabaseRestFetch } = require('../../lib/supabase');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function isNonEmpty(s) { return typeof s === 'string' && s.trim().length > 0; }

function validate(body) {
  const errors = [];
  const contact = body.contact || {};
  const items = Array.isArray(body.items) ? body.items : [];

  if (!isNonEmpty(contact.firstName)) errors.push('contact.firstName required');
  if (!isNonEmpty(contact.lastName)) errors.push('contact.lastName required');
  if (!isEmail(contact.email)) errors.push('contact.email invalid');
  if (!isNonEmpty(contact.phone)) errors.push('contact.phone required');
  if (!items.length) errors.push('items[] required');

  items.forEach((it, i) => {
    if (!it.activityId) errors.push(`items[${i}].activityId required`);
    if (!Array.isArray(it.pricingCategoryBookings) || !it.pricingCategoryBookings.length) {
      errors.push(`items[${i}].pricingCategoryBookings required`);
    }
  });

  return errors;
}

/**
 * Best-effort: persist the inquiry to Supabase so we have a record of
 * who started checkout, even if they bail on Bókun's page. Returns the
 * row id when successful, null otherwise. Failure here MUST NOT block
 * the redirect — the visitor has already entered their details and we
 * owe them a fast hand-off to Bókun.
 */
async function persistCheckoutInquiry({ contact, items, lang, hostedCheckoutUrl }) {
  try {
    const totalPax = items.reduce((sum, it) => {
      return sum + (Array.isArray(it.pricingCategoryBookings)
        ? it.pricingCategoryBookings.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
        : 0);
    }, 0);

    // Pick the earliest travel date for the headline column; full
    // per-item details live in the JSON `selected_trip` payload.
    const dates = items.map((it) => it.date).filter(Boolean).sort();
    const travelStartDate = dates[0] || null;

    const row = {
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
      phone: `${contact.phoneCountryCode || ''}${contact.phone}`.trim(),
      lang,
      travel_start_date: travelStartDate,
      pax: totalPax,
      notes: 'Auto-created by /api/checkout/booking (hosted Bókun checkout)',
      selected_trip: items,
      source_page: 'checkout/hosted',
      status: 'redirected_to_bokun',
      hosted_checkout_url: hostedCheckoutUrl,
    };

    const data = await supabaseRestFetch('inquiries', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: [row],
    });
    return Array.isArray(data) && data[0] ? data[0].id : null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[checkout/booking] persistCheckoutInquiry failed:', err.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const errors = validate(body);
  if (errors.length) {
    return res.status(400).json({ error: 'Invalid checkout', details: errors, code: 'INVALID_CHECKOUT' });
  }

  if (!getShopHost()) {
    return res.status(503).json({
      error: 'Bókun hosted checkout is not configured. Set BOKUN_SHOP_URL (e.g. https://djs-tour.bokun.io) on the server.',
      code: 'BOKUN_SHOP_NOT_CONFIGURED',
    });
  }

  const lang = body.lang || 'hant';
  const contact = body.contact;
  const items = body.items;

  try {
    const hostedCheckoutUrl = buildHostedCheckoutUrl(items, {
      lang,
      contactPrefill: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        countryCode: contact.phoneCountryCode,
      },
    });

    const inquiryId = await persistCheckoutInquiry({ contact, items, lang, hostedCheckoutUrl });

    return res.status(200).json({
      ok: true,
      hostedCheckoutUrl,
      inquiryId,
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message,
      code: err.code || 'CHECKOUT_BOOKING_ERROR',
    });
  }
};
