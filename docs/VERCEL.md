# Vercel — project `djscla`

Static hosting for the Auralis design system and UI kit. No build step.

## URLs

| | |
|---|---|
| **Production** | https://djscla.vercel.app |
| **Dashboard** | https://vercel.com/djstours-projects/djscla |

| Path | Content |
|------|---------|
| `/` | → UI kit (`/ui_kits/web/index.html`) |
| `/ui_kits/web/index.html` | 4-screen prototype |
| `/preview/*.html` | Design system cards |

## Import from GitHub

1. https://vercel.com/new → Import **`djstour/djscla`**
2. **Project Name:** `djscla`
3. **Framework Preset:** Other
4. **Build Command:** (empty)
5. **Output Directory:** (empty)
6. Deploy

## Environment variables (later)

| Name | Value |
|------|--------|
| `SUPABASE_URL` | `https://pmdfdkhfkjyuvucsfsoe.supabase.co` |
| `SUPABASE_ANON_KEY` | Dashboard → API |

Catalog data comes from production Bókun via `/api/bokun/activities` (no mock fallback). Set `BOKUN_API_HOST=https://api.bokun.io` and live API keys on Vercel.

## Supabase ↔ Vercel

[Supabase Integrations](https://supabase.com/dashboard/project/pmdfdkhfkjyuvucsfsoe/settings/integrations) → **Vercel** → link project **`djscla`**.

## CLI

```bash
npx vercel login
npx vercel link --project djscla
npx vercel --prod
```
