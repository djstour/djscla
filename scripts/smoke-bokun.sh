#!/usr/bin/env bash
set -euo pipefail

# Bókun preflight smoke test (Preview / Production).
# Usage:
#   BASE_URL=https://your-preview-url.vercel.app ./scripts/smoke-bokun.sh
#   BASE_URL=https://www.djstour.com ./scripts/smoke-bokun.sh
#
# Optional:
#   UI_LANG=hant          # catalog filter lang; falls back to en if empty
#   MAX_ITEMS=20
#   DATE=2026-06-10
#   ACTIVITY_ID=825419   # override auto-picked first activity id
#   CURL_MAX_TIME=45
#   SKIP_CHECKOUT=1      # skip POST /api/checkout/booking + hosted URL probe

BASE_URL="${BASE_URL:-https://www.djstour.com}"
UI_LANG="${UI_LANG:-hant}"
MAX_ITEMS="${MAX_ITEMS:-20}"
DATE="${DATE:-2026-06-10}"
CURL_MAX_TIME="${CURL_MAX_TIME:-45}"
ACTIVITY_ID="${ACTIVITY_ID:-}"
SKIP_CHECKOUT="${SKIP_CHECKOUT:-0}"
CATALOG_LANG="$UI_LANG"

PASS=0
FAIL=0

pass() {
  PASS=$((PASS + 1))
  printf "PASS  %s\n" "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  printf "FAIL  %s\n" "$1"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

catalog_json="$tmpdir/catalog.json"
detail_json="$tmpdir/detail.json"
availability_json="$tmpdir/availability.json"
payload_json="$tmpdir/availability-payload.json"
checkout_json="$tmpdir/checkout.json"
checkout_payload_json="$tmpdir/checkout-payload.json"

echo "== Bókun smoke test =="
echo "BASE_URL: $BASE_URL"
echo "UI_LANG: $UI_LANG"
echo

# 1) Catalog
catalog_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
  -o "$catalog_json" -w "%{http_code}" \
  "$BASE_URL/api/catalog/activities?lang=$UI_LANG&all=true&maxItems=$MAX_ITEMS" || true)"

if [[ "$catalog_code" != "200" ]]; then
  fail "catalog activities HTTP $catalog_code"
  echo "Body preview:"
  python3 - <<'PY' "$catalog_json"
import sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = p.read_text(errors='replace')[:300]
print(raw)
PY
  exit 1
fi

catalog_eval="$(python3 - <<'PY' "$catalog_json"
import json, sys
data = json.load(open(sys.argv[1]))
acts = data.get("activities") or []
first = acts[0].get("id") if acts else ""
source = data.get("source")
print(f"{len(acts)}|{first}|{source}")
PY
)"
catalog_count="${catalog_eval%%|*}"
rest="${catalog_eval#*|}"
first_id="${rest%%|*}"
catalog_source="${rest#*|}"

if [[ "$catalog_count" -gt 0 ]]; then
  pass "catalog activities count=$catalog_count source=$catalog_source first_id=$first_id"
elif [[ "$UI_LANG" != "en" ]]; then
  echo "WARN  catalog empty for lang=$UI_LANG — retrying catalog with lang=en for smoke pick"
  CATALOG_LANG="en"
  catalog_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
    -o "$catalog_json" -w "%{http_code}" \
    "$BASE_URL/api/catalog/activities?lang=$CATALOG_LANG&all=true&maxItems=$MAX_ITEMS" || true)"
  if [[ "$catalog_code" != "200" ]]; then
    fail "catalog fallback (lang=en) HTTP $catalog_code"
    exit 1
  fi
  catalog_eval="$(python3 - <<'PY' "$catalog_json"
import json, sys
data = json.load(open(sys.argv[1]))
acts = data.get("activities") or []
first = acts[0].get("id") if acts else ""
source = data.get("source")
print(f"{len(acts)}|{first}|{source}")
PY
)"
  catalog_count="${catalog_eval%%|*}"
  rest="${catalog_eval#*|}"
  first_id="${rest%%|*}"
  catalog_source="${rest#*|}"
  if [[ "$catalog_count" -gt 0 ]]; then
    pass "catalog fallback count=$catalog_count source=$catalog_source first_id=$first_id"
  else
    fail "catalog returned empty activities[] (lang=$UI_LANG and en fallback)"
    exit 1
  fi
else
  fail "catalog returned empty activities[]"
  exit 1
fi

if [[ -z "$ACTIVITY_ID" ]]; then
  ACTIVITY_ID="$first_id"
fi

# Detail / availability / checkout use en so smoke works before zh approval.
API_LANG="en"

# 2) Activity detail
detail_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
  -o "$detail_json" -w "%{http_code}" \
  "$BASE_URL/api/bokun/activity?id=$ACTIVITY_ID&lang=$API_LANG" || true)"

if [[ "$detail_code" != "200" ]]; then
  fail "activity detail HTTP $detail_code (id=$ACTIVITY_ID)"
  python3 - <<'PY' "$detail_json"
import sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = p.read_text(errors='replace')[:300]
print(raw)
PY
  exit 1
fi

detail_eval="$(python3 - <<'PY' "$detail_json"
import json, sys
data = json.load(open(sys.argv[1]))
a = data.get("activity") or {}
aid = a.get("id")
src = data.get("source")
dlen = len((a.get("description") or ""))
cats = a.get("pricingCategories") or []
default_id = ""
for c in cats:
    if c.get("defaultCategory"):
        default_id = c.get("id")
        break
if not default_id and cats:
    default_id = cats[0].get("id")
print(f"{aid}|{src}|{dlen}|{default_id or '5001'}")
PY
)"
detail_id="${detail_eval%%|*}"
rest="${detail_eval#*|}"
detail_source="${rest%%|*}"
rest2="${rest#*|}"
detail_desc_len="${rest2%%|*}"
pricing_category_id="${rest2#*|}"

if [[ "$detail_id" != "None" && "$detail_id" != "" ]]; then
  pass "activity detail id=$detail_id source=$detail_source description_len=$detail_desc_len"
else
  fail "activity detail missing activity.id"
fi

# 3) Availability check
cat <<EOF > "$payload_json"
{
  "activityId": $ACTIVITY_ID,
  "date": "$DATE",
  "lang": "$API_LANG",
  "pax": [{ "pricingCategoryId": $pricing_category_id, "quantity": 1 }],
  "pickupPlaceId": null,
  "extras": []
}
EOF

availability_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
  -H "Content-Type: application/json" \
  -d @"$payload_json" \
  -o "$availability_json" -w "%{http_code}" \
  "$BASE_URL/api/availability/check" || true)"

if [[ "$availability_code" == "200" ]]; then
  availability_eval="$(python3 - <<'PY' "$availability_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(f"available={data.get('available')} total={data.get('total')}")
PY
)"
  pass "availability check HTTP 200 ($availability_eval)"
elif [[ "$availability_code" == "409" || "$availability_code" == "422" ]]; then
  availability_eval="$(python3 - <<'PY' "$availability_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(f"code={data.get('code')} error={data.get('error')}")
PY
)"
  pass "availability business response HTTP $availability_code ($availability_eval)"
else
  fail "availability check HTTP $availability_code"
  python3 - <<'PY' "$availability_json"
import sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = p.read_text(errors='replace')[:300]
  print(raw)
PY
fi

# 4) Checkout handoff + hosted URL probe
if [[ "$SKIP_CHECKOUT" == "1" ]]; then
  pass "checkout skipped (SKIP_CHECKOUT=1)"
else
  cat <<EOF > "$checkout_payload_json"
{
  "lang": "$API_LANG",
  "contact": {
    "firstName": "Smoke",
    "lastName": "Test",
    "email": "smoke-test@example.com",
    "phone": "912345678",
    "phoneCountryCode": "+886"
  },
  "items": [{
    "activityId": "$ACTIVITY_ID",
    "date": "$DATE",
    "pricingCategoryBookings": [{ "pricingCategoryId": $pricing_category_id, "quantity": 1 }],
    "extras": []
  }]
}
EOF

  checkout_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
    -H "Content-Type: application/json" \
    -d @"$checkout_payload_json" \
    -o "$checkout_json" -w "%{http_code}" \
    "$BASE_URL/api/checkout/booking" || true)"

  if [[ "$checkout_code" != "200" ]]; then
    fail "checkout booking HTTP $checkout_code"
    python3 - <<'PY' "$checkout_json"
import sys, pathlib
p = pathlib.Path(sys.argv[1])
raw = p.read_text(errors='replace')[:400]
print(raw)
PY
  else
    checkout_eval="$(python3 - <<'PY' "$checkout_json"
import json, sys
data = json.load(open(sys.argv[1]))
url = data.get("hostedCheckoutUrl") or ""
ok = bool(data.get("ok")) and url.startswith("http")
print(f"{ok}|{url}")
PY
)"
    checkout_ok="${checkout_eval%%|*}"
    hosted_url="${checkout_eval#*|}"
    if [[ "$checkout_ok" != "True" && "$checkout_ok" != "true" ]]; then
      fail "checkout booking missing hostedCheckoutUrl"
    else
      pass "checkout booking returned hostedCheckoutUrl"
      if [[ "$hosted_url" != *"/online-sales/"* ]]; then
        fail "hosted URL missing /online-sales/ path ($hosted_url)"
      else
        pass "hosted URL uses /online-sales/ prefix"
      fi
      hosted_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
        -o /dev/null -w "%{http_code}" \
        "$hosted_url" || true)"
      if [[ "$hosted_code" == "200" ]]; then
        pass "hosted checkout page HTTP 200"
      elif [[ "$hosted_code" == "303" || "$hosted_code" == "302" ]]; then
        fail "hosted checkout redirected HTTP $hosted_code (likely extranet login — check BOKUN_SHOP_URL / BOKUN_SHOP_BASE_PATH)"
      else
        fail "hosted checkout page HTTP $hosted_code ($hosted_url)"
      fi
    fi
  fi
fi

echo
echo "== Summary =="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
