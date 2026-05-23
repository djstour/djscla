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
| `BOKUN_API_HOST` | No | `https://api.bokun.io` (prod) or `https://api.bokuntest.com` (sandbox) |
| `BOKUN_LANG` | No | `EN` — product copy from Bókun; TC/SC from `bokunTranslations.js` |
| `BOKUN_CURRENCY` | No | `ISK` — must match booking channel checkout currency |

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

## Fallback

If the proxy fails (missing keys, bad signature, rate limit), the UI falls back to `mockBokunData.js` and logs a console warning.

## Files

| File | Role |
|------|------|
| `api/lib/bokun.js` | HMAC signing + search |
| `api/lib/normalizeActivity.js` | Bókun → catalog shape |
| `api/bokun/activities.js` | Vercel handler |
| `data/bokunAdapter.js` | `fetch('/api/bokun/activities')` + view models |
