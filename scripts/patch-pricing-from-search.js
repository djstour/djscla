#!/usr/bin/env node
// Repair script: re-fetch /activity-search.json per vendor and graft
// pricing[] / nextDefaultPrice / defaultCurrency / fromPrice back into each
// activity's bokun_payload. Used after a buggy detail-sync run wrote
// $0 prices into the DB. Safe to run repeatedly — preserves all detail
// fields (description, pickup, extras, …) and only rewrites pricing keys
// when the search-derived values are usable (positive amount).
//
// Usage:  node scripts/patch-pricing-from-search.js

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\n/).forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) return;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  });
}

const root = path.resolve(__dirname, '..');
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const { supabaseRestFetch } = require('../lib/supabase');
const { fetchAllCatalogPages, getContractVendorList } = require('../lib/catalog');

const ACTIVITY_TABLE = 'activities';

function pricingArrayHasUsableAmount(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.some((row) => {
    const n = Number(row && row.amount);
    return Number.isFinite(n) && n > 0;
  });
}

function moneyHasUsableAmount(money) {
  if (!money) return false;
  const n = Number(money.amount);
  return Number.isFinite(n) && n > 0;
}

(async () => {
  console.log('[patch-pricing] Fetching live channel catalog from Bókun…');
  const vendors = getContractVendorList();
  const searchById = new Map();

  for (const vendor of vendors) {
    const { activities } = await fetchAllCatalogPages({
      uiLang: 'hant',
      vendorId: vendor.id,
    });
    activities.forEach((a) => {
      if (a && a.id != null && !searchById.has(String(a.id))) {
        searchById.set(String(a.id), a);
      }
    });
    console.log(`  vendor ${vendor.id} ${vendor.title}: ${activities.length} activities`);
  }
  console.log(`[patch-pricing] ${searchById.size} unique activities from search`);

  console.log('[patch-pricing] Reading current DB payloads…');
  const allRows = [];
  let offset = 0;
  const CHUNK = 200;
  for (;;) {
    const rows = await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?select=bokun_activity_id,bokun_payload,price_from&order=bokun_activity_id.asc&limit=${CHUNK}&offset=${offset}`,
    );
    if (!Array.isArray(rows) || !rows.length) break;
    allRows.push(...rows);
    if (rows.length < CHUNK) break;
    offset += CHUNK;
  }
  console.log(`[patch-pricing] DB has ${allRows.length} rows`);

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of allRows) {
    const id = String(row.bokun_activity_id);
    const search = searchById.get(id);
    if (!search) { missing++; continue; }

    const dbPayload = row.bokun_payload || {};

    const dbPricingUsable = pricingArrayHasUsableAmount(dbPayload.pricing);
    const dbNextUsable = moneyHasUsableAmount(dbPayload.nextDefaultPrice);
    if (dbPricingUsable && dbNextUsable) { skipped++; continue; }

    const searchPricingUsable = pricingArrayHasUsableAmount(search.pricing);
    const searchNextUsable = moneyHasUsableAmount(search.nextDefaultPrice);
    if (!searchPricingUsable && !searchNextUsable) { skipped++; continue; }

    const merged = {
      ...dbPayload,
      pricing: searchPricingUsable
        ? search.pricing
        : (Array.isArray(dbPayload.pricing) && dbPayload.pricing.length ? dbPayload.pricing : (search.pricing || [])),
      nextDefaultPrice: searchNextUsable
        ? search.nextDefaultPrice
        : (dbPayload.nextDefaultPrice || search.nextDefaultPrice || null),
      defaultCurrency: search.defaultCurrency || dbPayload.defaultCurrency || null,
      fromPrice: search.fromPrice || dbPayload.fromPrice || null,
    };

    const newPriceFrom = (() => {
      const rows = Array.isArray(merged.pricing) ? merged.pricing : [];
      let lowest = null;
      rows.forEach((r) => {
        const a = Number(r && r.amount);
        if (!Number.isFinite(a) || a <= 0) return;
        if (lowest == null || a < lowest) lowest = a;
      });
      if (lowest != null) return lowest;
      if (merged.nextDefaultPrice && Number.isFinite(Number(merged.nextDefaultPrice.amount))) {
        return Number(merged.nextDefaultPrice.amount);
      }
      return null;
    })();

    await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: {
          bokun_payload: merged,
          price_from: newPriceFrom,
        },
      },
    );

    const lowest = newPriceFrom != null ? `${newPriceFrom} ${merged.defaultCurrency || ''}` : 'null';
    console.log(`  ✓ ${id}  pricing→${(merged.pricing || []).length} rows · from=${lowest}`);
    updated += 1;
  }

  console.log(`[patch-pricing] Done — updated=${updated} skipped=${skipped} missing=${missing}`);
})().catch((err) => {
  console.error('[patch-pricing] error:', err && err.message ? err.message : err);
  process.exit(1);
});
