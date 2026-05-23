# Foreign exchange (display only)

## Architecture

```
Browser  →  GET /api/fx/rates
              ↓ (Vercel serverless, 6h in-memory cache)
           Frankfurter API (ECB reference rates)
              ↓
           { base: USD, date, rates: { TWD, CNY, … } }
              ↓
           formatDisplayPrice(priceUsd, displayCurrency, rates)
```

- **Anchor currency:** USD (matches `BOKUN_CURRENCY=USD` and Bókun quote amounts).
- **Provider:** [Frankfurter](https://www.frankfurter.dev/) (`api.frankfurter.dev/v1`) — ECB daily reference rates, no API key.
- **Supplement:** `TWD` is not published by ECB; filled from [open.er-api.com](https://open.er-api.com) live USD cross-rates.
- **Purpose:** UI display only. Checkout in production would still charge in the merchant settlement currency.

## Supported display currencies

Nav picker and `/api/fx/rates`:

`USD`, `TWD`, `CNY`, `HKD`, `SGD`, `MYR`, `MOP`, `CAD`, `AUD`

Whole-number display after conversion: `TWD`, `CNY`, `HKD`, `MOP`. Two decimals: `USD`, `SGD`, `MYR`, `CAD`, `AUD`. Supplemental FX: `TWD`, `MOP` (not on ECB).

## UI behaviour

| Control | Behaviour |
|---------|-----------|
| Nav currency dropdown | Persists to `localStorage` key `auralis.currency` |
| Default on language change | `TWD` (hant), `CNY` (hans), `USD` (en) |
| Nav currency menu | ISO code list only; full name on `title` / `aria-label` |
| Prices on cards / trip / checkout | `tour.priceUsd` converted with live rates |

## Local preview

Same as Bókun: `python3 -m http.server` cannot serve `/api/fx/rates`. Use:

```bash
npx vercel dev
```

Test endpoint: http://localhost:3000/api/fx/rates

Production: https://djscla.vercel.app/api/fx/rates

## Failure modes

| Symptom | Cause | Mitigation |
|---------|-------|------------|
| All prices show as USD | FX fetch failed; rates stuck at `{ USD: 1 }` | Check Vercel function logs; Frankfurter outage uses stale cache if available |
| 502 on `/api/fx/rates` | Frankfurter unreachable and no cached snapshot | Retry; rates are not hardcoded by design |
| Wrong symbol but plausible number | User picked a currency Frankfurter did not return | Server logs `[fx] Frankfurter missing …` and falls back to 1:1 for that code |

## Files

| Path | Role |
|------|------|
| `lib/fx.js` | Fetch, cache, `convertFromUsd`, rounding |
| `api/fx/rates.js` | HTTP handler |
| `ui_kits/web/components/_shared.jsx` | `formatDisplayPrice`, `CURRENCIES`, `tripTotalUsd` |
| `data/bokunAdapter.js` | Sets `priceUsd` on each view-model |
