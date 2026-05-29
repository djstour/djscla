#!/usr/bin/env node
/**
 * Translate specific activity fields and upsert to Supabase.
 *
 * Usage:
 *   node scripts/translate-fields.js 1101833 cancellationPolicyHtml
 *   node scripts/translate-fields.js 1101833 cancellationPolicyHtml cancellationPolicyTitle --force
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
loadEnvFile(path.join(root, '.env.local'));
loadEnvFile(path.join(root, '.env'));

const { getActivityById } = require('../lib/bokun');
const { normalizeActivity } = require('../lib/normalizeActivity');
const { extractTranslatableFields } = require('../lib/translationFields');
const { translateField } = require('../lib/openaiTranslate');
const { upsertTranslations } = require('../lib/supabaseTranslations');

const LANGS = ['hant', 'hans'];

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const activityId = args[0];
  const fieldPaths = args.slice(1);

  if (!activityId || !fieldPaths.length) {
    console.error('Usage: node scripts/translate-fields.js <bokunActivityId> <fieldPath> [fieldPath...] [--force]');
    process.exit(1);
  }

  const rawPayload = await getActivityById(activityId, { uiLang: 'en' });
  const item = rawPayload && rawPayload.activity ? rawPayload.activity : rawPayload;
  const activity = normalizeActivity(item);
  const allFields = extractTranslatableFields(activity);
  const wanted = new Set(fieldPaths);
  const fields = allFields.filter((f) => wanted.has(f.fieldPath));

  if (!fields.length) {
    console.error('No matching translatable fields. Available:', allFields.map((f) => f.fieldPath).join(', '));
    process.exit(1);
  }

  const rows = [];
  for (const field of fields) {
    for (const lang of LANGS) {
      console.log(`Translating ${activityId} ${field.fieldPath} → ${lang}…`);
      const fieldType = field.fieldPath.startsWith('stop.') ? 'itinerary stop name' : field.fieldPath;
      const { translation, notes } = await translateField({
        fieldType,
        source: field.source,
        lang,
      });
      rows.push({
        entity_id: String(activityId),
        field_path: field.fieldPath,
        lang,
        text: translation,
        meta: {
          provider: 'openai',
          sourceHash: field.sourceHash,
          reviewedAt: new Date().toISOString(),
          notes,
        },
      });
      console.log(`  ✓ ${lang}: ${translation.slice(0, 80)}${translation.length > 80 ? '…' : ''}`);
    }
  }

  const result = await upsertTranslations(rows);
  console.log(`Upserted ${result.count || rows.length} row(s) for activity ${activityId}${force ? ' (force)' : ''}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
