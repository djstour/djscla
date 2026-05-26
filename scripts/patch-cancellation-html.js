#!/usr/bin/env node
// Recomputes cancellationPolicyHtml for all activities from their stored
// bokun_payload.cancellationPolicy — no Bókun API calls needed.

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
const { normalizeActivity } = require('../lib/normalizeActivity');

const ACTIVITY_TABLE = 'activities';
const CHUNK = 50;

async function fetchAllPayloads() {
  const all = [];
  let offset = 0;
  for (;;) {
    const rows = await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?select=bokun_activity_id,bokun_payload&order=bokun_activity_id.asc&limit=${CHUNK}&offset=${offset}`,
    );
    if (!Array.isArray(rows) || !rows.length) break;
    all.push(...rows);
    if (rows.length < CHUNK) break;
    offset += CHUNK;
  }
  return all;
}

(async () => {
  console.log('[patch-cancellation-html] Fetching activities…');
  const rows = await fetchAllPayloads();
  console.log(`[patch-cancellation-html] Found ${rows.length} activities`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const payload = row.bokun_payload;
    if (!payload) { skipped++; continue; }

    // Re-run normalizeActivity on the stored payload to get fresh HTML
    const fresh = normalizeActivity(payload);
    const newHtml = fresh.cancellationPolicyHtml || '';
    const oldHtml = payload.cancellationPolicyHtml || '';

    if (newHtml === oldHtml) { skipped++; continue; }

    const mergedPayload = { ...payload, cancellationPolicyHtml: newHtml };

    await supabaseRestFetch(
      `/rest/v1/${ACTIVITY_TABLE}?bokun_activity_id=eq.${row.bokun_activity_id}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { bokun_payload: mergedPayload },
      },
    );

    console.log(`  ✓ ${row.bokun_activity_id}  old=${oldHtml.slice(0, 60).replace(/\n/g, ' ')}…`);
    updated++;
  }

  console.log(`[patch-cancellation-html] Done — updated=${updated} skipped=${skipped}`);
})().catch((err) => { console.error(err.message); process.exit(1); });
