#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8')
    .split(/\n/)
    .forEach((line) => {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) return;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = value;
    });
}

const root = path.resolve(__dirname, '..');
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const { syncCatalog } = require('../lib/catalogSync');

(async () => {
  console.log('[sync-catalog-details] Starting catalog + detail sync…');
  try {
    const result = await syncCatalog({
      syncImages: false,
      syncDetails: true,
      maxDetailPerRun: Infinity, // no cap when running manually
    });
    const c = result.counts;
    console.log(`[sync-catalog-details] Done in ${result.timings.totalMs}ms`);
    console.log(`  Channel list : upserted=${c.upserted} unchanged=${c.unchanged} deactivated=${c.deactivated}`);
    console.log(`  Detail sync  : synced=${c.detailSynced} errors=${c.detailErrors} pending=${c.detailPending}`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[sync-catalog-details] FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
