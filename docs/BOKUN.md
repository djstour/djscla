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

The catalog calls `GET /api/catalog/activities`. That route is a **Vercel serverless function** — it does not exist on a plain static file server.

| Command | Bókun catalog | Use for |
|---------|---------------|---------|
| `npm start` (`vercel dev`) | ✅ | UI + API + env from `.env.local` |
| `npm run preview:static` | ❌ (404 on `/api/*`) | CSS/layout only — no catalog |

Do **not** put `"dev": "vercel dev"` in `package.json`: Vercel CLI runs `npm run dev` as the development command and will recurse forever.

```bash
cd "/path/to/auralis-design-system"
cp .env.example .env.local
# Paste from Bókun → Settings → API keys (same pair as Vercel Production):
#   BOKUN_ACCESS_KEY=…
#   BOKUN_SECRET_KEY=…
#   BOKUN_API_HOST=https://api.bokun.io
npm start
# open http://localhost:3000/
```

### `BOKUN_CONFIG` locally but production works

| Cause | Fix |
|-------|-----|
| No `.env.local` | Create it with `BOKUN_ACCESS_KEY` + `BOKUN_SECRET_KEY` (see above). |
| Ran `vercel env pull` | **Sensitive** vars on Vercel cannot be read back — pull writes `BOKUN_ACCESS_KEY=""`. Delete those empty lines and paste real keys from Bókun. |
| Keys only on Preview/Production | `vercel dev` does not inject Preview secrets into `.env.local`; you must paste keys locally (or add the same keys under Vercel → **Development**). |
| Changed `.env.local` | Run `npm run stop:dev` then `npm start` (use the port printed in the terminal, not an old tab). |
| Keys in file but still `BOKUN_CONFIG` | `vercel dev` may not load `.env.local` — use `npm start` (runs `scripts/dev.mjs` which injects env). |

Quick check: http://localhost:3000/api/catalog/activities?lang=hant&all=true should return `"source":"bokun"` and an `activities` array.

Production: https://djstour.com/

## Troubleshooting `401 Invalid API key`

There is **no mock catalog fallback**. If `/api/bokun/activities` fails, the UI shows an error banner and empty catalog state.

| Check | Action |
|-------|--------|
| Both keys set | Vercel → **djscla** → Settings → Environment Variables: `BOKUN_ACCESS_KEY` **and** `BOKUN_SECRET_KEY` (same row in Bókun API key UI) |
| No typos | Re-paste keys; no spaces or quotes; redeploy **Production** |
| Host matches keys | **Sandbox** key → `BOKUN_API_HOST=https://api.bokuntest.com` · **Live** key → `https://api.bokun.io` |
| Booking channel | API key must belong to a booking channel with products to sell |
| Permissions | Key needs access to activity search / booking API |

Verify: open `https://djstour.com/api/catalog/activities?lang=hant&all=true` — should return `"source":"db"` (cache) or `"bokun"` (first run), `meta.total` (e.g. 132+), and an `activities` array.

**Multi-vendor scale:** see [VENDOR_SCALE.md](./VENDOR_SCALE.md).

### Supplier counts (Marketplace contract)

Pill counts come from **`meta.vendorContractCounts`**: one full channel search, grouped by `activity.vendor.id` (search-row counts per supplier; may differ from Marketplace contract totals).

Add a new marketplace vendor:

1. Accept the contract in Bókun Marketplace (Contracts tab).
2. Add that supplier’s products to your **booking channel** (Sales tools → channel / website — enable *auto-include new contract products* if available).
3. Run **Admin → Overview → Run catalog sync** (or wait for cron every ~2 hours). Sync **auto-discovers** every supplier present on the channel — no `data/bokunVendors.json` edit required.

**Contract accepted ≠ automatic on djstour.com.** Bókun does not notify our site; products must appear in the booking channel search API. `data/bokunVendors.json` is only a fallback label list when the DB is empty before the first sync.

## Files

| File | Role |
|------|------|
| `lib/bokun.js` | HMAC signing + search |
| `lib/normalizeActivity.js` | Bókun → catalog shape |
| `api/catalog/activities.js` | Catalog handler (paginated / `all=true`) |
| `vercel.json` | Rewrites `/api/bokun/activities` → catalog |
| `lib/catalog.js` | Bókun pagination helper |
| `data/bokunAdapter.js` | `fetch('/api/bokun/activities')` + view models |
