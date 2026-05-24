# Vercel — project `djscla`

Static hosting for the Auralis design system and UI kit. No build step.

**Recommended deployment (environments, workflow, checklist):** [DEPLOYMENT.md](./DEPLOYMENT.md)

## URLs

| | |
|---|---|
| **Production** | https://djscla.vercel.app |
| **Dashboard** | https://vercel.com/djstours-projects/djscla |

| Path | Content |
|------|---------|
| `/` or `/index.html` | UI kit (rewritten to `ui_kits/web/index.html`, URL stays at root) |
| `/ui_kits/web/index.html` | 301 → `/` |
| `/preview/*.html` | Design system cards |

## Import from GitHub

1. https://vercel.com/new → Import **`djstour/djscla`**
2. **Project Name:** `djscla`
3. **Framework Preset:** Other
4. **Build Command:** (empty)
5. **Output Directory:** (empty)
6. Deploy

## Environment variables

| Name | Required | Notes |
|------|----------|--------|
| `BOKUN_ACCESS_KEY` / `BOKUN_SECRET_KEY` | Yes | Production Bókun |
| `BOKUN_API_HOST` | Yes | `https://api.bokun.io` |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Yes | UI reads translations |
| `SUPABASE_SERVICE_ROLE_KEY` | Sync | Writes `translations` table |
| `OPENAI_API_KEY` | Sync | Translation worker |
| `TRANSLATION_SYNC_SECRET` | Sync | Manual `POST /api/translations/sync` |
| `CRON_SECRET` | Cron | Auto `/api/translations/cron` (can match sync secret) |
| `TRANSLATION_CRON_MAX_ACTIVITIES` | No | Default `12` on Pro (see below) |

Catalog: `/api/catalog/activities?all=true`. See [BOKUN.md](./BOKUN.md), [TRANSLATIONS.md](./TRANSLATIONS.md).

## Pro plan — recommended settings

After upgrading, configure once in the [project dashboard](https://vercel.com/djstours-projects/djscla/settings):

| Area | Recommendation |
|------|----------------|
| **Git** | Reconnect `djstour/djscla` if deploys failed on Hobby; Production branch `main` |
| **Function duration** | `/api/translations/*` use `maxDuration: 300` in code (Pro max) |
| **Cron** | Keep `0 */6 * * *`; set `TRANSLATION_CRON_MAX_ACTIVITIES=12` in env |
| **Catch-up script** | `CHUNK=12 CURL_MAX_TIME=180 ./scripts/sync-all-translations.sh` (fewer rounds per activity) |
| **Observability** | Enable Log Drains only if you use Datadog etc.; otherwise **Logs** tab is enough |
| **Domains** | Keep `djscla.vercel.app`; add custom domain when ready |

**Do not** rely on a single 300s request to translate all 123 activities — still use chunked sync or the shell script.

Optional later: [Fluid Compute](https://vercel.com/docs/fluid-compute) for catalog fetch; Supabase catalog mirror ([VENDOR_SCALE.md](./VENDOR_SCALE.md) Phase B) before ~1000 suppliers.

## Supabase ↔ Vercel

[Supabase Integrations](https://supabase.com/dashboard/project/pmdfdkhfkjyuvucsfsoe/settings/integrations) → **Vercel** → link project **`djscla`**.

## CLI

```bash
npx vercel login
npx vercel link --project djscla
npx vercel --prod
```
