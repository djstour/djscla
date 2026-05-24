# OTA API status

This document tracks the first productization routes added on top of the design-system prototype.

## Status summary

| Route | Status | Notes |
|------|--------|-------|
| `POST /api/inquiries` | Live skeleton | Writes concierge leads into Supabase `inquiries` |
| `POST /api/availability/check` | Live skeleton | Calls Bókun availability API for a single date and returns price summary |
| `POST /api/checkout/questions` | Preview skeleton | Infers question fields from activity shape; **not** the final Bókun checkout-options integration |

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

- Uses `GET /activity.json/{id}/availabilities`
- Matches one date and optional `startTimeId`
- Estimates totals from `pricesByRate`
- Falls back to normalized product pricing if rate pricing is missing

Current limitations:

- No extras / pickup / dropoff pricing yet
- No multi-day range search yet
- No reservation / cart creation yet

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

This route is a **preview contract** so frontend work can continue now. Before launch, replace the inference layer with Bókun checkout options:

- `POST /checkout.json/options/booking-request`
- then `POST /checkout.json/submit`

Official references:

- [Checking availability and pricing](https://bokun.dev/booking-api-restful/vU6sCfxwYdJWd1QAcLt12i/checking-availability-and-pricing/9x4PcziToX5g8WG4j5KMxt)
- [Checkout](https://bokun.dev/booking-api-restful/vU6sCfxwYdJWd1QAcLt12i/checkout/qfxwephtAWaRgPt22kpyLF)
- [Booking questions and answers](https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/booking-questions-and-answers/r69Hx5qrLtMXpYzBCC6NPp)
