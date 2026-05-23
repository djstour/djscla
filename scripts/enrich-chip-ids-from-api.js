#!/usr/bin/env node
/**
 * Build chipIdsCache.json via deployed catalog + detail APIs (no Bókun keys needed).
 * Usage: node scripts/enrich-chip-ids-from-api.js [baseUrl]
 */

const fs = require('fs');
const path = require('path');
const { normalizeActivity } = require('../lib/normalizeActivity');
const { deriveChipIds, mergeChipIdSets } = require('../lib/chipIds');

const BASE = (process.argv[2] || 'https://djscla.vercel.app').replace(/\/$/, '');
const CACHE_PATH = path.join(__dirname, '..', 'data', 'chipIdsCache.json');
const CONCURRENCY = 5;
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function mapPool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function main() {
  console.log(`Catalog: ${BASE}/api/catalog/activities?lang=en&all=true`);
  const catalog = await fetchJson(`${BASE}/api/catalog/activities?lang=en&all=true`);
  const list = catalog.activities || [];
  console.log(`Activities: ${list.length}`);

  const byId = {};
  let done = 0;

  await mapPool(list, CONCURRENCY, async (row) => {
    const id = String(row.id);
    try {
      const detail = await fetchJson(`${BASE}/api/bokun/activity?id=${encodeURIComponent(id)}&lang=en`);
      const raw = detail.activity || detail;
      const activity = normalizeActivity(raw);
      const rules = deriveChipIds({
        title: row.title,
        summary: row.summary,
        durationMinutes: row.durationMinutes,
        keywords: [],
        categories: [],
        tags: row.tags || [],
      });
      const { chipIds, categoryLabels } = deriveChipIds(activity);
      byId[id] = {
        chipIds: mergeChipIdSets(rules.chipIds, chipIds),
        categoryLabels,
        enrichedAt: new Date().toISOString(),
      };
    } catch (err) {
      byId[id] = {
        chipIds: deriveChipIds({ title: row.title, summary: row.summary }).chipIds,
        categoryLabels: [],
        enrichedAt: new Date().toISOString(),
        error: err.message,
      };
    }
    done += 1;
    if (done % 10 === 0) console.log(`  ${done}/${list.length}`);
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  });

  const cache = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: BASE,
    byId,
  };
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');

  const dist = {};
  Object.values(byId).forEach((e) => {
    (e.chipIds || []).forEach((c) => { dist[c] = (dist[c] || 0) + 1; });
  });
  const withChips = Object.values(byId).filter((e) => e.chipIds?.length).length;
  console.log(`Wrote ${CACHE_PATH}`);
  console.log(`With chipIds: ${withChips}/${list.length}`);
  console.log('Distribution:', dist);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
