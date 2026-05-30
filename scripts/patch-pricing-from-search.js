#!/usr/bin/env node
/**
 * Repair implausible catalog prices in Supabase bokun_payload.
 *
 * v2 components often store commission-like USD amounts ($1.11) while Bókun
 * booking UI shows real From prices ($130). This script:
 *   1. Optionally fetches v1 channel search pricing (when higher than cache)
 *   2. Applies --override amounts (verified against Bókun booking UI)
 *   3. Re-runs automated priceDisplay audit and updates price_from
 *
 * Usage:
 *   node scripts/patch-pricing-from-search.js --dry-run
 *   node scripts/patch-pricing-from-search.js --ids 629086,758652
 *   node scripts/patch-pricing-from-search.js --ids 629086,758652 --override 629086=130.18,758652=203.45
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
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
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const { supabaseRestFetch } = require('../lib/supabase');
const { fetchAllCatalogPages, getContractVendorList } = require('../lib/catalog');
const {
  MIN_PLAUSIBLE_DISPLAY_PRICE,
  collectDisplayAmounts,
  hasPlausiblePrice,
} = require('../lib/catalogQuality');
const { verifyActivityPriceDisplay } = require('../lib/catalogPriceVerification');
const {
  fetchChannelSearchPricingActivity,
  catalogMaxUsd,
} = require('../lib/bokunChannelSearchPricing');

const ACTIVITY_TABLE = 'activities';

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    ids: null,
    override: new Map(),
    minUsd: MIN_PLAUSIBLE_DISPLAY_PRICE,
    skipChannelFetch: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-channel-fetch') opts.skipChannelFetch = true;
    else if (arg === '--ids' && argv[i + 1]) {
      opts.ids = new Set(argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean));
      i += 1;
    } else if (arg === '--override' && argv[i + 1]) {
      argv[i + 1].split(',').forEach((pair) => {
        const [id, amount] = pair.split('=').map((s) => s.trim());
        const n = Number(amount);
        if (id && Number.isFinite(n) && n > 0) opts.override.set(String(id), n);
      });
      i += 1;
    } else if (arg === '--min-usd' && argv[i + 1]) {
      opts.minUsd = Number(argv[i + 1]) || MIN_PLAUSIBLE_DISPLAY_PRICE;
      i += 1;
    }
  }
  return opts;
}

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

function lowestPriceFrom(activity) {
  const amounts = collectDisplayAmounts(activity);
  return amounts.length ? Math.min(...amounts) : null;
}

function defaultCategoryId(existingPricing) {
  const rows = Array.isArray(existingPricing) ? existingPricing : [];
  const adult = rows.find((r) => String(r.pricingCategoryId) === '28');
  if (adult && adult.pricingCategoryId != null) return adult.pricingCategoryId;
  if (rows[0] && rows[0].pricingCategoryId != null) return rows[0].pricingCategoryId;
  return 5001;
}

function buildPricingFromAmount(amountUsd, existingPricing, currency = 'USD') {
  const catId = defaultCategoryId(existingPricing);
  const rateId = (existingPricing || []).find((r) => r.activityRateId != null)?.activityRateId ?? null;
  return [{
    pricingCategoryId: catId,
    amount: amountUsd,
    currency,
    ...(rateId != null ? { activityRateId: rateId } : {}),
  }];
}

function shouldReplace(dbPayload, { minUsd, overrideAmount, channelMax }) {
  const dbMax = catalogMaxUsd(dbPayload);
  if (overrideAmount != null && Number.isFinite(overrideAmount)) {
    if (!Number.isFinite(dbMax) || dbMax < minUsd || overrideAmount > dbMax + 0.01) return true;
    return false;
  }
  if (!Number.isFinite(channelMax) || channelMax <= 0) return false;
  if (!Number.isFinite(dbMax) || dbMax < minUsd) return channelMax >= minUsd;
  return channelMax > dbMax + 0.01;
}

function mergePricing(dbPayload, sourceActivity, overrideAmount) {
  const currency = (sourceActivity && sourceActivity.defaultCurrency)
    || dbPayload.defaultCurrency
    || 'USD';
  let pricing = sourceActivity && pricingArrayHasUsableAmount(sourceActivity.pricing)
    ? sourceActivity.pricing
    : dbPayload.pricing;
  let nextDefaultPrice = sourceActivity && moneyHasUsableAmount(sourceActivity.nextDefaultPrice)
    ? sourceActivity.nextDefaultPrice
    : dbPayload.nextDefaultPrice;
  let fromPrice = (sourceActivity && sourceActivity.fromPrice) || dbPayload.fromPrice || null;

  if (overrideAmount != null) {
    pricing = buildPricingFromAmount(overrideAmount, dbPayload.pricing, currency);
    nextDefaultPrice = { amount: overrideAmount, currency };
    fromPrice = { amount: overrideAmount, currency };
  }

  return {
    ...dbPayload,
    pricing,
    nextDefaultPrice,
    fromPrice,
    defaultCurrency: currency,
  };
}

(async () => {
  const opts = parseArgs(process.argv);
  const searchById = new Map();

  if (!opts.skipChannelFetch) {
    console.log('[patch-pricing] Fetching live channel catalog from Bókun (v2)…');
    const vendors = getContractVendorList();
    for (const vendor of vendors) {
      // eslint-disable-next-line no-await-in-loop
      const { activities } = await fetchAllCatalogPages({
        uiLang: 'en',
        vendorId: vendor.id,
      });
      activities.forEach((a) => {
        if (a && a.id != null && !searchById.has(String(a.id))) {
          searchById.set(String(a.id), a);
        }
      });
      console.log(`  vendor ${vendor.id} ${vendor.title}: ${activities.length} activities`);
    }
    console.log(`[patch-pricing] ${searchById.size} unique activities from v2 catalog`);
  }

  console.log('[patch-pricing] Reading DB payloads…');
  const allRows = [];
  let offset = 0;
  const CHUNK = 200;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?select=bokun_activity_id,bokun_payload,price_from&order=bokun_activity_id.asc&limit=${CHUNK}&offset=${offset}`,
    );
    if (!Array.isArray(rows) || !rows.length) break;
    allRows.push(...rows);
    if (rows.length < CHUNK) break;
    offset += CHUNK;
  }
  console.log(`[patch-pricing] DB has ${allRows.length} rows`);

  const targets = opts.ids
    ? allRows.filter((row) => opts.ids.has(String(row.bokun_activity_id)))
    : allRows;

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of targets) {
    const id = String(row.bokun_activity_id);
    const dbPayload = row.bokun_payload || {};
    const dbMax = catalogMaxUsd(dbPayload);
    const overrideAmount = opts.override.has(id) ? opts.override.get(id) : null;

    let channel = searchById.get(id) || null;
    let channelMax = channel ? catalogMaxUsd(channel) : 0;

    if (!overrideAmount && shouldReplace(dbPayload, { minUsd: opts.minUsd, overrideAmount: null, channelMax: 0 })) {
      // eslint-disable-next-line no-await-in-loop
      const v1 = await fetchChannelSearchPricingActivity(id, { currency: 'USD', lang: 'EN' });
      if (v1 && catalogMaxUsd(v1) > channelMax) {
        channel = v1;
        channelMax = catalogMaxUsd(v1);
      }
    }

    if (!shouldReplace(dbPayload, { minUsd: opts.minUsd, overrideAmount, channelMax })) {
      skipped += 1;
      console.log(`  · ${id} skip (db max $${dbMax || 0}${overrideAmount != null ? `, override $${overrideAmount}` : ''})`);
      continue;
    }

    if (!channel && !overrideAmount) {
      missing += 1;
      console.log(`  · ${id} missing channel pricing (db max $${dbMax || 0})`);
      continue;
    }

    const merged = mergePricing(dbPayload, channel, overrideAmount);
    // eslint-disable-next-line no-await-in-loop
    const verified = await verifyActivityPriceDisplay(id, merged);
    const newMax = catalogMaxUsd(verified);
    const newPriceFrom = hasPlausiblePrice(verified) ? lowestPriceFrom(verified) : null;
    const trusted = verified.priceDisplay && verified.priceDisplay.trusted;

    const label = overrideAmount != null
      ? `override $${overrideAmount}`
      : `channel max $${channelMax}`;

    if (opts.dryRun) {
      console.log(`  ✓ [dry-run] ${id} ${label} → max $${newMax} trusted=${trusted} price_from=${newPriceFrom}`);
      updated += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${id}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: {
          bokun_payload: verified,
          price_from: newPriceFrom,
        },
      },
    );

    console.log(`  ✓ ${id} ${label} → max $${newMax} trusted=${trusted} price_from=${newPriceFrom}`);
    updated += 1;
  }

  console.log(`[patch-pricing] Done — updated=${updated} skipped=${skipped} missing=${missing}${opts.dryRun ? ' (dry-run)' : ''}`);
})().catch((err) => {
  console.error('[patch-pricing] error:', err && err.message ? err.message : err);
  process.exit(1);
});
