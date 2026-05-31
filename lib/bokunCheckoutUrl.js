/**
 * lib/bokunCheckoutUrl — builds a Bókun reseller-shop hosted-checkout URL.
 *
 * Bókun's hosted checkout lives at a reseller-specific subdomain — e.g.
 * `https://djs-tour.bokun.io`. There are two flavours we care about:
 *
 *   • Single experience  → `/online-sales/{bookingChannelUuid}/experience/{activityId}?date=…`
 *     The React booking engine parses the channel UUID from this path segment
 *     (see Bókun OnlineSalesContent). Without it the SPA mounts with an empty
 *     channel id and renders a blank page.
 *
 *   • Multi-item cart    → `/online-sales/{bookingChannelUuid}/checkout?cart=…`
 *
 * The shop host comes from `BOKUN_SHOP_URL` (server) or — when called from
 * the browser via the booking endpoint — is echoed back by the API. We
 * never construct this URL client-side without the server's blessing,
 * because the slug can rotate and we don't want stale clients sending
 * users to a 404.
 *
 * Required: `BOKUN_BOOKING_CHANNEL_UUID` — copy from Bókun back-office:
 * Settings → Sales settings → Booking channels → your website channel →
 * Online sales / widget embed URL (the UUID in `/online-sales/{uuid}/…`).
 */

/** Bókun Online Sales channel id (RFC-4122 variant nibble 0–5). */
const BOOKING_CHANNEL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getShopHost() {
  const host = (process.env.BOKUN_SHOP_URL || process.env.BOKUN_CHECKOUT_HOST || '').trim();
  if (!host) return null;
  return host.replace(/\/+$/, '');
}

/** Public booking engine path prefix (djs-tour: `/online-sales`, not `/experience`). */
function getShopBasePath() {
  const raw = (process.env.BOKUN_SHOP_BASE_PATH || '/online-sales').trim();
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw.replace(/\/+$/, '') : `/${raw.replace(/\/+$/, '')}`;
}

function getBookingChannelUuid() {
  const raw = (process.env.BOKUN_BOOKING_CHANNEL_UUID || process.env.BOKUN_BOOKING_CHANNEL_ID || '').trim();
  if (!raw) return null;
  if (!BOOKING_CHANNEL_UUID_RE.test(raw)) {
    const err = new Error(
      'BOKUN_BOOKING_CHANNEL_UUID must be a booking-channel UUID from Bókun → Settings → Booking channels',
    );
    err.code = 'BOKUN_BOOKING_CHANNEL_INVALID';
    throw err;
  }
  return raw.toLowerCase();
}

/** Strip dial code so Bókun gets local digits in phoneNumber + separate phoneCountryCode. */
function normalizePhoneForPrefill(phone, countryCode) {
  let local = String(phone || '').trim().replace(/\s+/g, '');
  if (!local) return '';
  const cc = String(countryCode || '').trim();
  if (cc) {
    const ccDigits = cc.replace(/^\+/, '');
    if (local.startsWith(cc)) local = local.slice(cc.length);
    else if (local.startsWith(`+${ccDigits}`)) local = local.slice(ccDigits.length + 1);
    else if (local.startsWith(ccDigits) && local.length > ccDigits.length + 6) {
      local = local.slice(ccDigits.length);
    }
  }
  return local.replace(/^\+/, '');
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

function appendHostedQueryParams(params, { contactPrefill, lang } = {}) {
  if (contactPrefill) {
    if (contactPrefill.firstName) params.set('firstName', contactPrefill.firstName);
    if (contactPrefill.lastName) params.set('lastName', contactPrefill.lastName);
    if (contactPrefill.email) params.set('email', contactPrefill.email);
    const phoneLocal = normalizePhoneForPrefill(contactPrefill.phone, contactPrefill.countryCode);
    if (phoneLocal) params.set('phoneNumber', phoneLocal);
    if (contactPrefill.countryCode) params.set('phoneCountryCode', contactPrefill.countryCode);
  }
  if (lang) params.set('lang', lang === 'hant' ? 'zh-TW' : lang === 'hans' ? 'zh-CN' : 'en');
  // Standalone hosted page (not iframe embed) — OnlineSalesContent reads this flag.
  params.set('isWebsite', 'true');
}

function requireHostedShopConfig() {
  const host = getShopHost();
  if (!host) {
    const err = new Error('BOKUN_SHOP_URL not configured');
    err.code = 'BOKUN_SHOP_NOT_CONFIGURED';
    throw err;
  }
  const channelUuid = getBookingChannelUuid();
  if (!channelUuid) {
    const err = new Error(
      'BOKUN_BOOKING_CHANNEL_UUID not configured. Copy the UUID from Bókun → Settings → Booking channels → Online sales URL (/online-sales/{uuid}/…).',
    );
    err.code = 'BOKUN_BOOKING_CHANNEL_NOT_CONFIGURED';
    throw err;
  }
  return { host, channelUuid, base: getShopBasePath() };
}

/**
 * Probe whether a channel UUID is valid on the shop host (widgets mainConfig).
 * Used by admin health / smoke scripts — not required at runtime.
 */
async function probeBookingChannelOnShop(channelUuid, { shopHost } = {}) {
  const host = (shopHost || getShopHost() || '').replace(/\/+$/, '');
  const uuid = String(channelUuid || '').trim().toLowerCase();
  if (!host || !BOOKING_CHANNEL_UUID_RE.test(uuid)) {
    return { ok: false, status: 0, message: 'invalid host or channel UUID' };
  }
  try {
    const res = await fetch(`${host}/widgets/${encodeURIComponent(uuid)}/mainConfig/true`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 200) {
      return { ok: true, status: 200, message: 'widgets mainConfig OK' };
    }
    const body = (await res.text()).slice(0, 120);
    return { ok: false, status: res.status, message: body || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, message: err.message || 'fetch failed' };
  }
}

/**
 * Single-experience URL. Pre-fills date, start time, pax counts, pickup,
 * and extras when supplied so the visitor lands on Bókun's product/checkout
 * flow with selections applied.
 */
function buildSingleExperienceUrl(item, opts = {}) {
  const { host, channelUuid, base } = requireHostedShopConfig();
  if (!item || !item.activityId) {
    const err = new Error('buildSingleExperienceUrl: activityId required');
    err.code = 'INVALID_ITEM';
    throw err;
  }

  const params = new URLSearchParams();
  if (item.date) params.set('date', String(item.date));
  if (item.startTimeId) params.set('startTimeId', String(item.startTimeId));

  const pcb = buildPricingCategoryParams(item.pricingCategoryBookings);
  if (pcb.length) params.set('pricingCategoryBookings', pcb.join(','));

  if (item.pickupPlaceId) params.set('pickupPlaceId', String(item.pickupPlaceId));
  if (Array.isArray(item.extras) && item.extras.length) {
    const extras = item.extras
      .filter((ex) => ex && (ex.extraId || ex.id))
      .map((ex) => `${ex.extraId || ex.id}:${Number(ex.quantity) || 1}`);
    if (extras.length) params.set('extras', extras.join(','));
  }

  appendHostedQueryParams(params, opts);

  const qs = params.toString();
  return `${host}${base}/${encodeURIComponent(channelUuid)}/experience/${encodeURIComponent(item.activityId)}${qs ? `?${qs}` : ''}`;
}

/**
 * Multi-item cart URL. Bókun's widget expects a base64-encoded JSON token
 * on checkout. The token shape matches the widget's "addToCart" payload.
 */
function buildCartUrl(items, opts = {}) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('buildCartUrl: items[] required');
    err.code = 'INVALID_ITEMS';
    throw err;
  }
  if (items.length === 1) {
    return buildSingleExperienceUrl(items[0], opts);
  }

  const { host, channelUuid, base } = requireHostedShopConfig();

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

  const token = Buffer.from(JSON.stringify({ items: cart, contactPrefill: opts.contactPrefill || null }), 'utf8').toString('base64');
  const params = new URLSearchParams({ cart: token });
  appendHostedQueryParams(params, opts);
  return `${host}${base}/${encodeURIComponent(channelUuid)}/checkout?${params.toString()}`;
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
  getShopBasePath,
  getBookingChannelUuid,
  normalizePhoneForPrefill,
  probeBookingChannelOnShop,
  BOOKING_CHANNEL_UUID_RE,
};
