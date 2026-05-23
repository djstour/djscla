# Bókun API integration

## Architecture

```
Browser  →  GET /api/bokun/activities?lang=hant
              ↓ (Vercel serverless)
           Bókun POST /activity.json/search
              ↓
           normalizeActivity → bokunAdapter.toViewModel → TourCard
```

Access key + secret never reach the browser.

## Environment variables (Vercel + local `vercel dev`)

| Variable | Required | Example |
|----------|----------|---------|
| `BOKUN_ACCESS_KEY` | Yes | From Bókun → Settings → API keys |
| `BOKUN_SECRET_KEY` | Yes | Same key pair |
| `BOKUN_API_HOST` | No | `https://api.bokun.io` (production). Use `https://api.bokuntest.com` only with sandbox keys. |
| `BOKUN_LANG` | No | `EN` — product copy from Bókun; TC/SC from `bokunTranslations.js` |
| `BOKUN_CURRENCY` | No | `USD` (default) — passed to `activity.json/search?currency=`. The proxy rewrites display currency to match this env. |

Set these in https://vercel.com/djstours-projects/djscla/settings/environment-variables then redeploy.

## Local preview with live data

`python3 -m http.server` does **not** run `/api/*`. Use:

```bash
cd "/Users/chrisshan/Documents/Auralis Design System"
cp .env.example .env.local   # fill BOKUN_* keys
npx vercel dev
# open http://localhost:3000/ui_kits/web/index.html
```

Production: https://djscla.vercel.app/ui_kits/web/index.html

## Troubleshooting `401 Invalid API key`

There is **no mock catalog fallback**. If `/api/bokun/activities` fails, the UI shows an error banner and empty catalog state.

| Check | Action |
|-------|--------|
| Both keys set | Vercel → **djscla** → Settings → Environment Variables: `BOKUN_ACCESS_KEY` **and** `BOKUN_SECRET_KEY` (same row in Bókun API key UI) |
| No typos | Re-paste keys; no spaces or quotes; redeploy **Production** |
| Host matches keys | **Sandbox** key → `BOKUN_API_HOST=https://api.bokuntest.com` · **Live** key → `https://api.bokun.io` |
| Booking channel | API key must belong to a booking channel with products to sell |
| Permissions | Key needs access to activity search / booking API |

Verify: open `https://djscla.vercel.app/api/bokun/activities?lang=hant` — should return `"source":"bokun"` and an `activities` array (not `Invalid API key`).

## Files

| File | Role |
|------|------|
| `api/lib/bokun.js` | HMAC signing + search |
| `api/lib/normalizeActivity.js` | Bókun → catalog shape |
| `api/bokun/activities.js` | Vercel handler |
| `data/bokunAdapter.js` | `fetch('/api/bokun/activities')` + view models |
