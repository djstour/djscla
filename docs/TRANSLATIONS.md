# Translations (繁中 / 简中)

## Architecture

```
Bókun API (English)  →  normalizeActivity
                              ↓
                    POST /api/translations/sync  (cron / manual)
                              ↓
                    OpenAI gpt-4o + glossary
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
| `OPENAI_API_KEY` | Yes (sync) | `gpt-4o` by default |
| `OPENAI_TRANSLATION_MODEL` | No | Override model |
| `TRANSLATION_SYNC_SECRET` | Prod recommended | Bearer token for `POST /api/translations/sync` |
| `CRON_SECRET` | Auto cron | Vercel Cron `Authorization` bearer (can match `TRANSLATION_SYNC_SECRET`) |
| `TRANSLATION_CRON_MAX_ACTIVITIES` | No | Activities per cron run (default `12`, max `30`) |
| `TRANSLATION_CRON_MAX_TRANSLATIONS_PER_ACTIVITY` | No | Fields×langs per activity per run (default `10`, max `24`); remainder on next cron |

## Automatic translation (Vercel Cron)

**You do not need to run curl by hand for steady-state.** `vercel.json` schedules:

| Schedule | Endpoint | Behaviour |
|----------|----------|-------------|
| Every **15 minutes** | `GET /api/translations/cron` | Scan **Supabase** active catalog; up to `TRANSLATION_CRON_MAX_ACTIVITIES` pending activities, up to `TRANSLATION_CRON_MAX_TRANSLATIONS_PER_ACTIVITY` strings per activity per run (fits Pro `maxDuration: 300`) |

**12-hour SLA (~140 SKUs):** 48 runs × 12 activities ≈ 576 queue slots per 12h. Each activity may need several runs (title/summary first, then description/stops). Empty queue → fast no-op (no OpenAI). For a one-shot full backfill, still use `./scripts/sync-all-translations.sh`.

Setup after deploy:

1. Vercel → **djscla** → Settings → Environment Variables → add **`CRON_SECRET`** (random string; can equal `TRANSLATION_SYNC_SECRET`).
2. Redeploy production (crons register on deploy).
3. Optional: **Cron Jobs** tab in Vercel to confirm the schedule and logs.

Manual test:

```bash
curl -sSL "https://www.djstour.com/api/translations/cron" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Response includes `summary.catalogSize`, `summary.pendingActivities`, and `summary.activityIds` processed this run.

**Catch-up (123 activities once):** use `./scripts/sync-all-translations.sh` — it calls sync **multiple times per activity** with `"maxTranslations": 6` so each request finishes within the serverless time limit. If curl times out, lower `CHUNK` or raise `CURL_MAX_TIME` (Pro plan allows longer `maxDuration` on `/api/translations/sync`).

**Later (Phase B):** trigger translation from catalog sync when Bókun `sourceHash` changes; optional Bókun webhook.

## First sync

After env vars are set and redeployed:

```bash
curl -sSL -X POST "https://www.djstour.com/api/translations/sync" \
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
- `forceMarker` — optional string shared across chunked requests so force mode advances field-by-field instead of re-translating the same chunk repeatedly.
- Default batch: first `limit` activities from catalog (`fetchAllCatalogPages`, capped).
- Full channel: `./scripts/sync-all-translations.sh` (see [VENDOR_SCALE.md](./VENDOR_SCALE.md)).
- Full **force** re-translate (e.g. after switching to `gpt-4.1`): `FORCE=1 ./scripts/sync-all-translations.sh` (requires deploy with `forceMarker` support).

## API routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/translations/sync` | POST | Bearer `TRANSLATION_SYNC_SECRET` | Batch translate + upsert |
| `/api/catalog/activities` | GET | — | Includes `translations` map (`all=true` for full channel) |
| `/api/bokun/activity?id=` | GET | — | Includes `translations` for one id |

Local preview: `npm start` from repo root (not `npm run preview:static`).

## Local vs Production — one translation, zero duplicate OpenAI billing

OpenAI runs **only** when `/api/translations/sync` or `/api/translations/cron` **writes** to Supabase. Browsing the site (local or prod) **reads** `translations` — no per-page API cost.

### Architecture

```
                    ┌─────────────────────────────────────┐
                    │  Supabase `translations` (shared)  │
                    └─────────────────┬───────────────────┘
                                      │ read (anon key)
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
       Local vercel dev         djstour.com              Admin UI
              │                       │
              │ write (OpenAI)        │ write (OpenAI)
              └───────────┬───────────┘
                          ▼
              Run sync/cron in ONE place only (prod recommended)
```

### Checklist

| Step | Local (`vercel dev`) | Production (Vercel) |
|------|----------------------|---------------------|
| Same Supabase project | `SUPABASE_URL` + `SUPABASE_ANON_KEY` = prod values | Already set |
| Serve catalog from mirror | `CATALOG_SOURCE=db` | `CATALOG_SOURCE=db` |
| OpenAI for browsing | **Not required** | `OPENAI_API_KEY` (sync only) |
| OpenAI on laptop | **Omit** unless testing sync code | — |
| Run translation cron | **No** — `vercel dev` does not run Vercel Cron | `vercel.json` → `/api/translations/cron` |
| Bulk catch-up | **Do not** run `sync-all-translations.sh` locally | Once: `./scripts/sync-all-translations.sh` (default `BASE_URL=https://www.djstour.com`) |
| Steady-state gaps | — | Cron every 15m + optional Admin → Translations → Run batch |
| Avoid double spend | Never second Supabase project for “dev translations” | Single `translations` table |
| Re-translate | Avoid `force: true` unless English copy changed | Same |

### `.env.local` (read-only local preview)

```bash
# Same as production — shared translation overlay
SUPABASE_URL=https://pmdfdkhfkjyuvucsfsoe.supabase.co
SUPABASE_ANON_KEY=<prod anon key>
CATALOG_SOURCE=db

# Optional: same Bókun keys if local API must hit Bókun for booking
# BOKUN_ACCESS_KEY=…
# BOKUN_SECRET_KEY=…

# Omit on local unless developing the sync pipeline:
# OPENAI_API_KEY=
# TRANSLATION_SYNC_SECRET=
```

After prod sync/cron writes translations, refresh local Tours — 繁中/简中 should match prod without another OpenAI run.

### When you *would* pay twice

- Separate Supabase projects and running full sync on **both**.
- Running `sync-all-translations.sh` **and** a full manual sync on the **same** DB with `force: true`.
- Hitting OpenAI from a second custom script outside `translationSync.js`.

Same DB + `sourceHash` skip logic: a second sync run on already-translated fields **does not** call OpenAI again.

## Client merge

`data/bokunAdapter.js`:

1. API responses store `data.translations` in `A._runtimeTranslations`.
2. `getActivityOverlay(id)` merges `bokunTranslations.js` + runtime.
3. `toViewModel` uses `pickFromOverlay` — strict per locale (`hant` / `hans` / `en` only; no cross-script fallback).

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
