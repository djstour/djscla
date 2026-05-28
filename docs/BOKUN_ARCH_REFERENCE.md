# Bókun Architecture Reference (for djscla)

This document distills the Bókun docs into an implementation guide for this project.

## Official docs to prioritize

- Config & Auth:
  - https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/configuring-the-platform-for-api-usage-and-authentication/sFiGRpo4detkmrZPcWtQPj
- Booking process overview:
  - https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/booking-process/7ce3yQRdURnCYQkhJsi2op
- Checkout:
  - https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/checkout/qfxwephtAWaRgPt22kpyLF
- Booking questions:
  - https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/booking-questions-and-answers/r69Hx5qrLtMXpYzBCC6NPp
- Product data model:
  - https://bokun.dev/booking-api-rest/vU6sCfxwYdJWd1QAcLt12i/introduction-to-the-data-model-of-products/mGtiogVmyzywvDaZFK29b5
- Webhooks:
  - https://bokun.dev/webhooks/g3YWZ24sADsceKK5vqrMzZ/creating-an-endpoint-for-webhooks/fhyXqzU4KXuLWc7Dc8ioNU
  - https://bokun.dev/webhooks/g3YWZ24sADsceKK5vqrMzZ/webhook-events/migR39DGTnTr3qaRryEr7k

## Environment and auth notes

- Production host: `https://api.bokun.io`
- Test host: `https://api.bokuntest.com`
- Required headers: `X-Bokun-Date`, `X-Bokun-AccessKey`, `X-Bokun-Signature`
- Signature uses secret key + request metadata (see Bókun auth doc above).

## Two valid checkout architectures

### A) Hosted checkout handoff (fastest to launch)

Flow:
1. Availability/pricing
2. Optional question prefetch
3. Redirect user to Bókun hosted checkout URL (`/experience/...` or `/cart?...`)

Pros:
- Fastest integration
- Lowest payment/compliance surface on our side
- Fewer server-side booking edge cases

Cons:
- Less control over final payment UX
- Checkout answers/payment completion happen on Bókun page

### B) Full API checkout (more control)

Flow:
1. Build cart (`POST /cart.json/{cartUUID}/activity`) or direct booking request
2. Fetch checkout options/questions
3. Submit checkout (`POST /checkout.json/submit`)
4. Handle payment/confirmation response (optionally reserve-then-confirm)

Pros:
- Full programmatic control
- Better custom payment/confirmation orchestration

Cons:
- More complexity and failure modes
- Higher implementation/testing effort

## Current project status (as of now)

This repo currently implements **Architecture A (Hosted checkout)**:

- Availability/pricing: `api/availability/check.js`
- Checkout questions: `api/checkout/questions.js`
  - Uses real Bókun checkout questions first, with inferred fallback
- Booking handoff: `api/checkout/booking.js`
  - Builds hosted URL via `lib/bokunCheckoutUrl.js`
  - Persists inquiry record, then browser redirects to hosted checkout

This is a valid and production-acceptable path for fastest go-live.

## Recommended go-live path for this project

1. Keep hosted-checkout architecture for launch.
2. Validate Preview (sandbox keys + `api.bokuntest.com`) end-to-end.
3. Validate Production (live keys + `api.bokun.io`) via smoke script:
   - `scripts/smoke-bokun.sh`
4. Add webhook endpoint post-launch for booking status sync and automation.

## Post-launch upgrades (if needed)

When business needs tighter checkout control, migrate gradually:

1. Add server-side cart API wrapper (`/api/checkout/cart/*`).
2. Introduce full `checkout options` + `submit` path behind feature flag.
3. Keep hosted checkout as fallback during rollout.
4. Add reserve/confirm flow for external payment orchestration if required.

## Practical test checklist

- API/auth:
  - No `401 Invalid API key`
  - Host-key match (test keys with test host, live keys with live host)
- Catalog/detail:
  - `/api/catalog/activities` and `/api/bokun/activity` return healthy payloads
- Availability:
  - `/api/availability/check` returns valid availability summary
- Checkout:
  - `/api/checkout/questions` returns questions (`source=bokun` ideally)
  - `/api/checkout/booking` returns `hostedCheckoutUrl`
  - Redirect lands on expected Bókun page with selected item context

