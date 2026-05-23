# Translations (繁中 / 简中)

## Architecture

```
Bókun API (English)  →  normalizeActivity
                              ↓
                    POST /api/translations/sync  (cron / manual)
                              ↓
                    OpenAI gpt-4o-mini + glossary
                              ↓
                    Supabase `translations` table
                              ↓
                    GET /api/bokun/activities|activity
                              ↓
                    `translations` map on JSON response
                              ↓
                    bokunAdapter: merge static + runtime overlay
                              ↓
                    toViewModel(lang) → UI copy
```

- **Source of truth for English:** Bókun (`BOKUN_LANG=EN`).
- **繁中 / 简中:** stored per field in Supabase; optional manual overrides in `data/bokunTranslations.js` (static wins for same keys only where runtime does not overwrite).
- **No browser-side OpenAI** — sync runs on Vercel with server secrets only.

## Database

Migration: `supabase/migrations/20260523064800_translations.sql`

| Column | Purpose |
|--------|---------|
| `entity_type` | `activity` (others reserved) |
| `entity_id` | Bókun activity id (string) |
| `field_path` | `title`, `summary`, `description`, `mode`, `stop.{id}` |
| `lang` | `hant` or `hans` |
| `text` | Translated string |
| `meta.sourceHash` | SHA-1 of English source; re-translate when Bókun copy changes |

RLS: public `SELECT`; writes require **service role** (`SUPABASE_SERVICE_ROLE_KEY`).

Apply migration in Supabase SQL editor or `supabase db push` if using CLI.

## Environment variables (Vercel)

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | Yes | Project URL |
| `SUPABASE_ANON_KEY` | Yes | Read overlays in API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (sync) | Upsert during sync |
| `OPENAI_API_KEY` | Yes (sync) | `gpt-4o-mini` by default |
| `OPENAI_TRANSLATION_MODEL` | No | Override model |
| `TRANSLATION_SYNC_SECRET` | Prod recommended | Bearer token for `POST /api/translations/sync` |

## First sync

After env vars are set and redeployed:

```bash
curl -X POST "https://djscla.vercel.app/api/translations/sync" \
  -H "Authorization: Bearer $TRANSLATION_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 20, "langs": ["hant", "hans"]}'
```

Response shape:

```json
{
  "ok": true,
  "summary": {
    "activities": 20,
    "translated": 120,
    "skipped": 40,
    "errors": []
  }
}
```

### Sync specific activities

```json
{
  "activityIds": [123456, 789012],
  "langs": ["hant", "hans"],
  "force": false
}
```

- `force: true` — re-translate even when `sourceHash` unchanged.
- Default batch: first `limit` activities from catalog (`fetchAllCatalogPages`, capped).
- Full channel: `./scripts/sync-all-translations.sh` (see [VENDOR_SCALE.md](./VENDOR_SCALE.md)).

## API routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/translations/sync` | POST | Bearer `TRANSLATION_SYNC_SECRET` | Batch translate + upsert |
| `/api/catalog/activities` | GET | — | Includes `translations` map (`all=true` for full channel) |
| `/api/bokun/activity?id=` | GET | — | Includes `translations` for one id |

Local preview: `npx vercel dev` (not static `http.server`).

## Client merge

`data/bokunAdapter.js`:

1. API responses store `data.translations` in `A._runtimeTranslations`.
2. `getActivityOverlay(id)` merges `bokunTranslations.js` + runtime.
3. `toViewModel` uses `pickFromOverlay` (hant ↔ hans cross-fallback, then English).

Changing UI language remaps cached raw activities without refetching Bókun.

## Operational notes

- **Rate limits:** ~120 ms delay between OpenAI calls per field/lang; tune `limit` for Vercel function timeout (10s hobby / 60s pro).
- **Stale copy:** When Bókun title/description changes, `sourceHash` mismatch triggers re-translation on next sync (unless skipped).
- **Do not use OpenCC-only** for product copy — see `data/README.md` §3.
- **Review:** Optional `meta.notes` from OpenAI; add a future admin UI or export from Supabase for human QA.

## Related files

- `lib/translationSync.js` — orchestration
- `lib/openaiTranslate.js` — prompts + glossary
- `lib/glossary.js` — Taiwan vs Mainland terms
- `lib/attachTranslations.js` — attach overlays to Bókun responses
