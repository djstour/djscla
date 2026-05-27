#!/usr/bin/env node
/**
 * One-off diagnostic: compares what Bókun's search endpoint currently
 * returns against what we have stored as `is_active=true` in Supabase.
 *
 * Lets us pin down whether a "count drift" (e.g. 141 in Bókun back-office
 * vs 140 in our cache) is caused by:
 *
 *   • A vendor toggling a product to draft / unpublished (Bókun search
 *     drops the row → our cache deactivates on next sync — expected).
 *   • Sync pagination ending early (Bókun returns < pageSize but more
 *     pages exist — would manifest as DB rows existing for IDs Bókun
 *     no longer surfaces).
 *   • Vendor / channel filters in our normalize step silently dropping
 *     a product (would show up here as "in Bókun, not in DB").
 *
 * Run from the repo root:
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const { searchActivities } = requireFromRoot('./lib/bokun');
const { supabaseRestFetch } = requireFromRoot('./lib/supabase');

(async () => {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await searchActivities({ uiLang: 'hant', page, pageSize: 100, query: {} });
    const items = res.items || [];
    out.push(...items);
    console.log('page', page, 'returned', items.length, 'totalHits', res.totalHits);
    if (items.length < 100) break;
    page++;
    if (page > 5) break;
  }

  const byVendor = {};
  out.forEach(a => {
    const v = (a.vendor && a.vendor.id) || 'unknown';
    byVendor[v] = (byVendor[v] || 0) + 1;
  });
  console.log('---');
  console.log('Total contracts from Bókun search:', out.length);
  console.log('By vendor:', byVendor);
  const ids = new Set(out.map(a => a.id));
  console.log('Unique product IDs in Bókun:', ids.size);

  const dbRows = await supabaseRestFetch('/rest/v1/activities?is_active=eq.true&select=bokun_activity_id,vendor_id,title_en,is_active,detail_synced_at,vendors(bokun_vendor_id)');
  // Normalise nested vendor join into a flat per-row vendor id.
  dbRows.forEach((r) => { r._vendor = r.vendors && r.vendors.bokun_vendor_id; });
  console.log('---');
  console.log('Active rows in DB:', dbRows.length);
  const dbByVendor = {};
  dbRows.forEach(r => { dbByVendor[r._vendor] = (dbByVendor[r._vendor]||0)+1; });
  console.log('DB by vendor:', dbByVendor);

  const dbIds = new Set(dbRows.map(r => Number(r.bokun_activity_id)));
  const missingFromDb = [...ids].filter(id => !dbIds.has(Number(id)));
  const extraInDb = [...dbIds].filter(id => !ids.has(id) && !ids.has(String(id)));

  console.log('---');
  console.log('In Bókun search but NOT in DB:', missingFromDb.length);
  missingFromDb.forEach(id => {
    const a = out.find(x => x.id === id);
    if (a) console.log('  MISSING from DB:', id, '·', a.title, '· vendor', a.vendor && a.vendor.id);
  });
  console.log('In DB (active) but NOT in Bókun search:', extraInDb.length);
  extraInDb.slice(0, 10).forEach(id => {
    const r = dbRows.find(x => Number(x.bokun_activity_id) === id);
    if (r) console.log('  Stale active in DB:', id, '·', r.title_en, '· vendor', r._vendor);
  });

  const allRows = await supabaseRestFetch('/rest/v1/activities?select=bokun_activity_id,vendor_id,title_en,is_active,vendors(bokun_vendor_id)&limit=400');
  const inactive = allRows.filter(r => r.is_active === false);
  console.log('---');
  console.log('Inactive rows in DB (recently deactivated by sync):', inactive.length);
  inactive.slice(0, 10).forEach(r => {
    console.log('  INACTIVE:', r.bokun_activity_id, '·', r.title_en, '· vendor', r.vendors && r.vendors.bokun_vendor_id);
  });
})().catch(e => { console.error('ERR', e.message, e.stack); process.exit(1); });
