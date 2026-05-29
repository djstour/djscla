#!/usr/bin/env node
/**
 * Re-sync the detail payload for one or more Bókun activities.
 *
 *   node scripts/resync-activity-detail.js 1101833
 *   node scripts/resync-activity-detail.js 1101833 18571 …
 *
 * Useful after extending lib/normalizeActivity.js: pulls fresh data from
 * Bókun REST v2 experience components (getActivityById), re-runs the normalizer, and PATCHes
 * Supabase's bokun_payload — without rebuilding the entire 141-row table.
 */
const path = require('path');
const fs = require('fs');

function loadEnvFile(file) {
  const p = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile('.env');
loadEnvFile('.env.local');

const { syncActivityDetails } = require('../lib/catalogSync');

async function main() {
  const ids = process.argv.slice(2).map(String).filter(Boolean);
  if (ids.length === 0) {
    console.error('Usage: node scripts/resync-activity-detail.js <bokunActivityId> [more ids…]');
    process.exit(1);
  }
  console.log(`[resync] re-fetching ${ids.length} activit${ids.length === 1 ? 'y' : 'ies'}: ${ids.join(', ')}`);
  const t0 = Date.now();
  const result = await syncActivityDetails(new Set(ids));
  console.log(`[resync] done in ${Date.now() - t0}ms`, result);
}

main().catch((err) => {
  console.error('[resync] failed:', err.message);
  process.exit(1);
});
