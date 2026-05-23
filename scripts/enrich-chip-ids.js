#!/usr/bin/env node
/**
 * Fetch full catalog + Bókun detail per activity → chipIds cache.
 * Requires BOKUN_* in .env.local or environment.
 *
 * Usage: node scripts/enrich-chip-ids.js [--lang=en] [--max=2000]
 */

const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    const abs = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(abs)) return;
    fs.readFileSync(abs, 'utf8').split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq < 1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
  } catch (_) { /* ignore */ }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const { fetchAllCatalogPages } = require('../lib/catalog');
const { enrichActivitiesChipIds } = require('../lib/enrichChipIds');
const { getCachePath } = require('../lib/chipCache');

async function main() {
  const uiLang = process.argv.includes('--lang=hans')
    ? 'hans'
    : process.argv.includes('--lang=en')
      ? 'en'
      : 'hant';

  const maxArg = process.argv.find((a) => a.startsWith('--max='));
  const maxItems = maxArg ? parseInt(maxArg.split('=')[1], 10) : 2000;

  console.log(`Fetching catalog (lang=${uiLang}, max=${maxItems})…`);
  const { activities, meta } = await fetchAllCatalogPages({ uiLang, maxItems });
  console.log(`Catalog: ${activities.length} activities (meta.total=${meta.total})`);

  const withRules = activities.filter((a) => a.chipIds?.length).length;
  console.log(`Rules-only chipIds: ${withRules}/${activities.length}`);

  console.log('Enriching from Bókun detail API (concurrency=4)…');
  const enriched = await enrichActivitiesChipIds(activities, {
    uiLang: 'en',
    fetchMissing: true,
    concurrency: 4,
    delayMs: 100,
  });

  const withChips = enriched.filter((a) => a.chipIds?.length).length;
  const dist = {};
  enriched.forEach((a) => {
    (a.chipIds || []).forEach((c) => { dist[c] = (dist[c] || 0) + 1; });
  });

  console.log(`After enrichment: ${withChips}/${enriched.length} with chipIds`);
  console.log('Distribution:', dist);
  console.log(`Cache written: ${getCachePath()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
