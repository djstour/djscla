# Bókun API integration

## Architecture

```
Browser  →  GET /api/catalog/activities?lang=hant&all=true
              ↓ (Vercel serverless — paginates Bókun search when all=true)
           Bókun POST /activity.json/search
              ↓
           normalizeActivity → bokunAdapter.toViewModel → TourCard

Browser  →  GET /api/bokun/activity?id=…&lang=hant  (prefetched on card hover; CDN cache 5m)
              ↓
           Bókun GET /activity.json/{id}
              ↓
           ActivityDetail (full description, photos, stops, pricing)

List catalog responses include a truncated `summary` on each activity so English copy can render before the detail fetch completes. Chinese body copy comes from Supabase overlays (`translations` on catalog + detail); run `/api/translations/sync` or cron until `description` rows exist.
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

Production: https://djscla.vercel.app/

## Troubleshooting `401 Invalid API key`

There is **no mock catalog fallback**. If `/api/bokun/activities` fails, the UI shows an error banner and empty catalog state.

| Check | Action |
|-------|--------|
| Both keys set | Vercel → **djscla** → Settings → Environment Variables: `BOKUN_ACCESS_KEY` **and** `BOKUN_SECRET_KEY` (same row in Bókun API key UI) |
| No typos | Re-paste keys; no spaces or quotes; redeploy **Production** |
| Host matches keys | **Sandbox** key → `BOKUN_API_HOST=https://api.bokuntest.com` · **Live** key → `https://api.bokun.io` |
| Booking channel | API key must belong to a booking channel with products to sell |
| Permissions | Key needs access to activity search / booking API |

Verify: open `https://djscla.vercel.app/api/catalog/activities?lang=hant&all=true` — should return `"source":"bokun"`, `meta.total` (e.g. 123), and an `activities` array.

**Multi-vendor scale:** see [VENDOR_SCALE.md](./VENDOR_SCALE.md).

## Files

| File | Role |
|------|------|
| `lib/bokun.js` | HMAC signing + search |
| `lib/normalizeActivity.js` | Bókun → catalog shape |
| `api/catalog/activities.js` | Catalog handler (paginated / `all=true`) |
| `vercel.json` | Rewrites `/api/bokun/activities` → catalog |
| `lib/catalog.js` | Bókun pagination helper |
| `data/bokunAdapter.js` | `fetch('/api/bokun/activities')` + view models |
