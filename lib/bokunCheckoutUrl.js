/**
 * lib/bokunCheckoutUrl — builds a Bókun reseller-shop hosted-checkout URL.
 *
 * Bókun's hosted checkout lives at a reseller-specific subdomain — e.g.
 * `https://djs-tour.bokun.io`. There are two flavours we care about:
 *
 *   • Single experience  → `/experience/{activityId}?date=…&start=…&adults=…`
 *     Bókun's widget consumes the query params and deep-links the visitor
 *     straight to "Step 1: Main contact" with selections pre-filled.
 *
 *   • Multi-item cart    → `/cart?items=base64({…})` — Bókun accepts the
 *     same shape as the embedded widget's cart token.
 *
 * The shop host comes from `BOKUN_SHOP_URL` (server) or — when called from
 * the browser via the booking endpoint — is echoed back by the API. We
 * never construct this URL client-side without the server's blessing,
 * because the slug can rotate and we don't want stale clients sending
 * users to a 404.
 */

function getShopHost() {
  const host = (process.env.BOKUN_SHOP_URL || process.env.BOKUN_CHECKOUT_HOST || '').trim();
  if (!host) return null;
  return host.replace(/\/+$/, '');
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function buildPricingCategoryParams(pricingCategoryBookings) {
  if (!Array.isArray(pricingCategoryBookings)) return [];
  return pricingCategoryBookings
    .filter((row) => row && Number(row.quantity) > 0)
    .map((row) => `${row.pricingCategoryId}:${Number(row.quantity)}`);
}

/**
 * Single-experience URL. Pre-fills date, start time, pax counts, pickup,
 * and extras when supplied so the visitor lands on Bókun's "Main contact"
 * page already on the right line item.
 */
function buildSingleExperienceUrl(item, { contactPrefill, lang } = {}) {
  const host = getShopHost();
  if (!host) {
    const err = new Error('BOKUN_SHOP_URL not configured');
    err.code = 'BOKUN_SHOP_NOT_CONFIGURED';
    throw err;
  }
  if (!item || !item.activityId) {
    const err = new Error('buildSingleExperienceUrl: activityId required');
    err.code = 'INVALID_ITEM';
    throw err;
  }

  const params = new URLSearchParams();
  if (item.date) params.set('date', String(item.date));
  if (item.startTimeId) params.set('startTimeId', String(item.startTimeId));

  // Bókun's widget supports either `pricingCategoryBookings=ID:QTY,ID:QTY`
  // or per-category counts via `adults=2&children=1`. We prefer the
  // explicit pricing category form so multi-tier products (resident /
  // student / senior) keep their selection on redirect.
  const pcb = buildPricingCategoryParams(item.pricingCategoryBookings);
  if (pcb.length) params.set('pricingCategoryBookings', pcb.join(','));

  if (item.pickupPlaceId) params.set('pickupPlaceId', String(item.pickupPlaceId));
  if (Array.isArray(item.extras) && item.extras.length) {
    const extras = item.extras
      .filter((ex) => ex && (ex.extraId || ex.id))
      .map((ex) => `${ex.extraId || ex.id}:${Number(ex.quantity) || 1}`);
    if (extras.length) params.set('extras', extras.join(','));
  }

  // Prefill contact (Bókun reads these via its widget bridge). The widget
  // ignores unknown keys, so adding new ones is forwards-compatible.
  if (contactPrefill) {
    if (contactPrefill.firstName) params.set('firstName', contactPrefill.firstName);
    if (contactPrefill.lastName) params.set('lastName', contactPrefill.lastName);
    if (contactPrefill.email) params.set('email', contactPrefill.email);
    if (contactPrefill.phone) params.set('phoneNumber', contactPrefill.phone);
    if (contactPrefill.countryCode) params.set('phoneCountryCode', contactPrefill.countryCode);
  }
  if (lang) params.set('lang', lang === 'hant' ? 'zh-TW' : lang === 'hans' ? 'zh-CN' : 'en');

  const qs = params.toString();
  return `${host}/experience/${encodeURIComponent(item.activityId)}${qs ? `?${qs}` : ''}`;
}

/**
 * Multi-item cart URL. Bókun's widget expects a base64-encoded JSON token
 * on the `cart` path. The token shape matches the widget's "addToCart"
 * payload — one entry per activity with its own selection metadata.
 */
function buildCartUrl(items, { contactPrefill, lang } = {}) {
  const host = getShopHost();
  if (!host) {
    const err = new Error('BOKUN_SHOP_URL not configured');
    err.code = 'BOKUN_SHOP_NOT_CONFIGURED';
    throw err;
  }
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('buildCartUrl: items[] required');
    err.code = 'INVALID_ITEMS';
    throw err;
  }
  if (items.length === 1) {
    return buildSingleExperienceUrl(items[0], { contactPrefill, lang });
  }

  const cart = items.map((it) => ({
    activityId: pickFirstNumber(it.activityId),
    date: it.date || null,
    startTimeId: pickFirstNumber(it.startTimeId),
    pricingCategoryBookings: Array.isArray(it.pricingCategoryBookings)
      ? it.pricingCategoryBookings.map((row) => ({
          pricingCategoryId: pickFirstNumber(row.pricingCategoryId, row.id),
          quantity: Number(row.quantity) || 0,
        }))
      : [],
    pickupPlaceId: pickFirstNumber(it.pickupPlaceId),
    extras: Array.isArray(it.extras)
      ? it.extras.map((ex) => ({ extraId: pickFirstNumber(ex.extraId, ex.id), quantity: Number(ex.quantity) || 1 }))
      : [],
  }));

  const token = Buffer.from(JSON.stringify({ items: cart, contactPrefill: contactPrefill || null }), 'utf8').toString('base64');
  const params = new URLSearchParams({ cart: token });
  if (lang) params.set('lang', lang === 'hant' ? 'zh-TW' : lang === 'hans' ? 'zh-CN' : 'en');
  return `${host}/cart?${params.toString()}`;
}

function buildHostedCheckoutUrl(items, opts = {}) {
  if (!Array.isArray(items)) {
    const err = new Error('buildHostedCheckoutUrl: items[] required');
    err.code = 'INVALID_ITEMS';
    throw err;
  }
  if (items.length === 1) return buildSingleExperienceUrl(items[0], opts);
  return buildCartUrl(items, opts);
}

module.exports = {
  buildHostedCheckoutUrl,
  buildSingleExperienceUrl,
  buildCartUrl,
  getShopHost,
};
