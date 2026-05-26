#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { supabaseRestFetch } = require('../lib/supabase');
const { ingestActivityOwnedImages } = require('../lib/ownedImageSync');

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

async function fetchRows(offset, limit) {
  const params = new URLSearchParams({
    select: 'bokun_activity_id,bokun_payload,cover_image_owned_url,image_assets,is_active',
    is_active: 'eq.true',
    order: 'bokun_activity_id.asc',
    limit: String(limit),
    offset: String(offset),
  });
  const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
  return Array.isArray(rows) ? rows : [];
}

async function patchRow(id, payload) {
  await supabaseRestFetch(`/rest/v1/activities?bokun_activity_id=eq.${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: payload,
  });
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'));
  loadEnvFile(path.join(process.cwd(), '.env'));

  const limit = Number(process.env.OWNED_IMAGE_BACKFILL_LIMIT || 500);
  const onlyMissing = process.env.OWNED_IMAGE_ONLY_MISSING !== '0';
  const coverOnly = process.env.OWNED_IMAGE_COVER_ONLY !== '0';
  let offset = 0;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const rows = await fetchRows(offset, limit);
    if (!rows.length) break;

    for (const row of rows) {
      scanned += 1;
      const hasOwned = !!(row.cover_image_owned_url || (Array.isArray(row.image_assets) && row.image_assets.length));
      if (onlyMissing && hasOwned) continue;
      const activity = row.bokun_payload;
      if (!activity || activity.id == null || !activity.coverImageUrl) continue;

      const owned = await ingestActivityOwnedImages(activity, { coverOnly });
      await patchRow(row.bokun_activity_id, {
        cover_image_owned_url: owned.coverImageOwnedUrl || null,
        photo_urls_owned: owned.photoUrlsOwned || [],
        image_assets: owned.imageAssets || [],
        bokun_payload: {
          ...activity,
          coverImageOwnedUrl: owned.coverImageOwnedUrl || null,
          coverImageCardUrl: owned.coverImageCardUrl || null,
          coverImageHeroUrl: owned.coverImageHeroUrl || null,
          coverImageGalleryUrl: owned.coverImageGalleryUrl || null,
          photoUrlsOwned: owned.photoUrlsOwned || [],
          imageAssets: owned.imageAssets || [],
        },
      });
      updated += 1;
      console.log(`[owned-images] ${updated} updated (${row.bokun_activity_id})`);
    }

    if (rows.length < limit) break;
    offset += limit;
  }

  console.log(JSON.stringify({ ok: true, scanned, updated, coverOnly }, null, 2));
}

main().catch((err) => {
  console.error(err && (err.stack || err.message) || err);
  process.exit(1);
});
