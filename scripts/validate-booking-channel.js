#!/usr/bin/env node
/**
 * Validate BOKUN_BOOKING_CHANNEL_UUID against the hosted shop widgets API.
 *
 * Usage:
 *   BOKUN_SHOP_URL=https://djs-tour.bokun.io BOKUN_BOOKING_CHANNEL_UUID=… node scripts/validate-booking-channel.js
 *   node scripts/validate-booking-channel.js <uuid>
 */

const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  });
}

loadEnv(path.join(process.cwd(), '.env.local'));
loadEnv(path.join(process.cwd(), '.env'));

const uuidArg = process.argv[2];
if (uuidArg) process.env.BOKUN_BOOKING_CHANNEL_UUID = uuidArg;

const { getShopHost, getBookingChannelUuid, probeBookingChannelOnShop } = require('../lib/bokunCheckoutUrl');

(async () => {
  const host = getShopHost();
  const uuid = getBookingChannelUuid();
  if (!host) {
    console.error('Set BOKUN_SHOP_URL (e.g. https://djs-tour.bokun.io)');
    process.exit(1);
  }
  if (!uuid) {
    console.error('Set BOKUN_BOOKING_CHANNEL_UUID or pass UUID as argv[2]');
    process.exit(1);
  }
  console.log('Shop:', host);
  console.log('Channel:', uuid);
  const result = await probeBookingChannelOnShop(uuid, { shopHost: host });
  if (result.ok) {
    console.log('OK — widgets mainConfig returned 200');
    console.log('Sample product URL:', `${host}/online-sales/${uuid}/experience/825419?isWebsite=true&lang=en`);
    process.exit(0);
  }
  console.error('FAIL —', result.status, result.message);
  process.exit(1);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
