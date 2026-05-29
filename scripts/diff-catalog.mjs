#!/usr/bin/env node
/**
 * Diagnostic: compares Bókun REST v2 marketplace contract products
 * against Supabase `activities` (active + inactive).
 *
 * Channel discovery: GET /restapi/v2.0/marketplace/contracts/supplier
 * + contract products (experience IDs). No v1 activity.json/search.
 *
 * Run from repo root:
 *   node scripts/diff-catalog.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const requireFromRoot = createRequire(resolve(root, 'package.json'));

function loadEnvFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const { discoverContractProducts } = requireFromRoot('./lib/bokunV2Catalog');
const { supabaseRestFetch } = requireFromRoot('./lib/supabase');

(async () => {
  console.log('Discovering channel products (Bókun REST v2 contracts)…');
  const entries = await discoverContractProducts({ forceRefresh: true });

  const byVendor = {};
  entries.forEach((e) => {
    const v = (e.vendor && e.vendor.id) != null ? String(e.vendor.id) : 'unknown';
    byVendor[v] = (byVendor[v] || 0) + 1;
  });

  const ids = new Set(entries.map((e) => String(e.experienceId)));

  console.log('---');
  console.log('Contract product rows (channel):', entries.length);
  console.log('Unique experience IDs (channel):', ids.size);
  console.log('By vendor:', byVendor);

  const dbRows = await supabaseRestFetch(
    '/rest/v1/activities?is_active=eq.true&select=bokun_activity_id,vendor_id,title_en,is_active,detail_synced_at,vendors(bokun_vendor_id)',
  );
  dbRows.forEach((r) => {
    r._vendor = r.vendors && r.vendors.bokun_vendor_id;
  });

  console.log('---');
  console.log('Active rows in DB:', dbRows.length);
  const dbByVendor = {};
  dbRows.forEach((r) => {
    dbByVendor[r._vendor] = (dbByVendor[r._vendor] || 0) + 1;
  });
  console.log('DB by vendor:', dbByVendor);

  const dbIds = new Set(dbRows.map((r) => Number(r.bokun_activity_id)));
  const missingFromDb = [...ids].filter((id) => !dbIds.has(Number(id)));
  const extraInDb = [...dbIds].filter((id) => !ids.has(id) && !ids.has(String(id)));

  console.log('---');
  console.log('In v2 channel but NOT active in DB:', missingFromDb.length);
  missingFromDb.slice(0, 20).forEach((id) => {
    const e = entries.find((x) => String(x.experienceId) === id);
    const vendor = e && e.vendor ? e.vendor.id : '?';
    console.log('  MISSING from DB:', id, '· vendor', vendor);
  });
  if (missingFromDb.length > 20) console.log(`  … and ${missingFromDb.length - 20} more`);

  console.log('Active in DB but NOT in v2 channel:', extraInDb.length);
  extraInDb.slice(0, 10).forEach((id) => {
    const r = dbRows.find((x) => Number(x.bokun_activity_id) === id);
    if (r) console.log('  Stale active in DB:', id, '·', r.title_en, '· vendor', r._vendor);
  });

  const allRows = await supabaseRestFetch(
    '/rest/v1/activities?select=bokun_activity_id,vendor_id,title_en,is_active,vendors(bokun_vendor_id)&limit=400',
  );
  const inactive = allRows.filter((r) => r.is_active === false);
  console.log('---');
  console.log('Inactive rows in DB (deactivated by sync):', inactive.length);
  inactive.slice(0, 10).forEach((r) => {
    console.log(
      '  INACTIVE:',
      r.bokun_activity_id,
      '·',
      r.title_en,
      '· vendor',
      r.vendors && r.vendors.bokun_vendor_id,
    );
  });
})().catch((e) => {
  console.error('ERR', e.message, e.stack);
  process.exit(1);
});
