#!/usr/bin/env node
/**
 * Report all missing / stale / broken translation fields across active catalog.
 *
 * Usage:
 *   node scripts/report-translation-gaps.js
 *   node scripts/report-translation-gaps.js --json
 *   node scripts/report-translation-gaps.js --activities   # one line per activity id
 *   node scripts/report-translation-gaps.js --max-scan 500
 */

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
loadEnvFile(path.join(root, '.env'));
loadEnvFile(path.join(root, '.env.local'));

const { scanTranslationGaps } = require('../lib/translationQueue');

function parseArgs(argv) {
  const opts = { json: false, activities: false, maxScan: 500 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--activities') opts.activities = true;
    else if (arg === '--max-scan' && argv[i + 1]) {
      opts.maxScan = Math.min(Number(argv[i + 1]) || 500, 500);
      i += 1;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const report = await scanTranslationGaps({ maxScan: opts.maxScan });

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (opts.activities) {
    report.activityIdsWithGaps.forEach((id) => console.log(id));
    return;
  }

  const { summary } = report;
  console.log(`Translation gaps — ${report.activeActivities} active activities scanned`);
  console.log(
    `Missing: ${summary.missing} · Stale: ${summary.stale} · Broken: ${summary.broken} · `
    + `${summary.activitiesWithGaps} activities with gaps`,
  );

  if (report.byField.length) {
    console.log('\nBy field (top):');
    report.byField.slice(0, 12).forEach(({ fieldPath, count }) => {
      console.log(`  ${fieldPath.padEnd(24)} ${count}`);
    });
  }

  if (!report.gaps.length) {
    console.log('\nNo gaps — all required fields translated and structurally OK.');
    return;
  }

  console.log('\nGaps:');
  report.gaps.forEach((g) => {
    console.log(`  ${String(g.bokunActivityId).padEnd(8)} ${g.type.padEnd(7)} ${g.field}`);
  });

  console.log('\nRe-sync one activity:');
  console.log('  node scripts/translate-fields.js <id> <fieldPath> [fieldPath...]');
  console.log('Bulk force (production): FORCE=1 ./scripts/sync-all-translations.sh');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
