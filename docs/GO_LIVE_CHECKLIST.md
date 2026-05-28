# Go-Live Final Checklist (Today)

Use this as the final execution sheet before pushing the site fully live.

## Release Info

- Date:
- Operator:
- Release commit:
- Environment under test: `preview` / `production`
- Decision: `GO` / `NO-GO`

---

## 1) Environment Lock Check

- [ ] `BOKUN_API_HOST` is correct for environment  
      - Preview: `https://api.bokuntest.com`  
      - Production: `https://api.bokun.io`
- [ ] `BOKUN_ACCESS_KEY` and `BOKUN_SECRET_KEY` match the selected host
- [ ] `BOKUN_SHOP_URL` points to the expected reseller domain
- [ ] `SUPABASE_*` keys present and correct
- [ ] Translation cron vars set (`CRON_SECRET`, `TRANSLATION_CRON_*`)

Notes:

---

## 2) API Smoke (must pass)

Run:

```bash
./scripts/smoke-bokun.sh
```

Or Preview:

```bash
BASE_URL=https://<preview-url>.vercel.app ./scripts/smoke-bokun.sh
```

- [ ] Catalog endpoint PASS
- [ ] Activity detail endpoint PASS
- [ ] Availability endpoint PASS

Result snippet:

---

## 3) Core User Journey (manual)

- [ ] Home page loads correctly (logo/nav/theme/lang switchers)
- [ ] Tours list loads and filters work
- [ ] Activity detail opens with correct language content
- [ ] Date/time/pax selection works and availability updates
- [ ] Pick-up helper renders clean text/HTML (no raw `<p ...>` output)
- [ ] `Book now` redirects to correct Bókun hosted checkout
- [ ] `Add to trip` still works without regressions

Notes:

---

## 4) Localization Quality Gate

- [ ] `行程說明 / 行程安排 / 接送地點` tabs localized as expected
- [ ] Included/Excluded/Requirements/Attention/Cancellation localized
- [ ] Quick facts not mixed-language (duration / know-before-you-go / guide language)
- [ ] No obvious untranslated English blocks in hant/hans routes

Sampling activity IDs checked:

---

## 5) Admin + Translation Pipeline Health

- [ ] Admin Translations page loads without errors
- [ ] Run batch works (no 500/504)
- [ ] Error panel shows actionable `transient/permanent` counts
- [ ] DLQ candidates are manageable (or zero)
- [ ] Queue depth trend is flat/down after runs
- [ ] Coverage trend is stable/up

Current metrics:
- Coverage:
- Queue depth:
- Fully translated:
- Last batch result:

---

## 6) Runtime Stability (Vercel)

- [ ] No repeated 5xx spikes in `/api/translations/cron`
- [ ] No repeated timeouts (`FUNCTION_INVOCATION_TIMEOUT`)
- [ ] No repeated auth errors (`401 Invalid API key`)
- [ ] `/api/checkout/*` logs clean for manual run

Log window checked:

---

## 7) Rollback Readiness

- [ ] Previous known-good commit identified
- [ ] Rollback command path confirmed
- [ ] Team contact/owner online during release window

Rollback target commit:

---

## 8) Go / No-Go Rules

### Hard blockers (must be 0)
- P0 checkout blockers
- Persistent API 5xx on core routes
- Incorrect environment key/host pairing

### Soft thresholds
- Translation error rate < 2% per batch
- Cron succeeds at least 4 consecutive runs
- No critical UX regressions in top 5 journeys

Final decision:
- [ ] GO
- [ ] NO-GO

Decision notes:

