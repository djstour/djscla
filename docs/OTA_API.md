# OTA API status

This document tracks the first productization routes added on top of the design-system prototype.

## Status summary

| Route | Status | Notes |
|------|--------|-------|
| `POST /api/inquiries` | Live skeleton | Writes concierge leads into Supabase `inquiries` |
| `POST /api/availability/check` | Live skeleton | Calls Bókun availability API for a single date and returns price summary |
| `POST /api/checkout/questions` | Live (v2) | `BOOKING_QUESTIONS` from experience components + inferred fallback; checkout on **Hosted Shop** |

## Required env

| Variable | Needed for | Required |
|----------|------------|----------|
| `BOKUN_ACCESS_KEY` | availability route | Yes |
| `BOKUN_SECRET_KEY` | availability route | Yes |
| `BOKUN_API_HOST` | availability route | Yes |
| `SUPABASE_URL` | inquiry writes | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | inquiry writes | Yes |

`SUPABASE_ANON_KEY` remains useful for translation reads, but inquiry writes need the service role key on the server.

## `POST /api/inquiries`

Accepts:

```json
{
  "name": "Chris",
  "email": "test@example.com",
  "phone": "+886912345678",
  "lang": "hant",
  "travelStartDate": "2026-12-20",
  "travelEndDate": "2026-12-25",
  "pax": 2,
  "budgetRange": "USD_3000_5000",
  "notes": "Prefer aurora + private transfer",
  "selectedTrip": [],
  "sourcePage": "/bundles/winter-aurora"
}
```

Returns:

```json
{
  "ok": true,
  "inquiry": {
    "id": 123,
    "status": "new",
    "createdAt": "2026-05-24T10:00:00.000Z"
  }
}
```

## `POST /api/availability/check`

Accepts:

```json
{
  "activityId": "723460",
  "date": "2026-12-20",
  "startTimeId": "418",
  "lang": "hant",
  "pax": [
    { "pricingCategoryId": 5001, "quantity": 2 },
    { "pricingCategoryId": 5002, "quantity": 1 }
  ]
}
```

Returns a single-date availability decision plus line-item totals.

Current behavior:

- Uses Bókun **REST v2** `GET /restapi/v2.0/availability/{experienceId}?from=&to=`
- Matches one date and optional `startTimeId`
- Estimates totals from v2 slot / rate pricing
- Falls back to normalized product pricing if rate pricing is missing

Current limitations:

- No extras / pickup / dropoff pricing yet
- No multi-day range search yet
- No REST cart creation — booking uses **Hosted Checkout** (`BOKUN_SHOP_URL`)

## `POST /api/checkout/questions`

Accepts:

```json
{
  "lang": "hant",
  "items": [
    {
      "activityId": "723460",
      "date": "2026-12-20",
      "startTimeId": "418",
      "pax": [
        { "pricingCategoryId": 5001, "quantity": 2 }
      ]
    }
  ]
}
```

Returns:

- base contact questions
- booking-type-driven fields such as date / departure time
- inferred participant fields

Important:

- Questions: v2 `BOOKING_QUESTIONS` component when present; else inferred from normalized activity.
- **No v1 `checkout.json`** — guests complete payment on the Bókun reseller shop (`lib/bokunCheckoutUrl.js`).

Official references:

- [Bókun REST v2](https://api-docs.bokun.dev/rest-v2)
- [Hosted checkout (sales tools)](https://bokun.dev/)
