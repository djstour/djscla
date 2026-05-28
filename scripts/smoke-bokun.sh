#!/usr/bin/env bash
set -euo pipefail

# Bókun preflight smoke test (Preview / Production).
# Usage:
#   BASE_URL=https://your-preview-url.vercel.app ./scripts/smoke-bokun.sh
#   BASE_URL=https://www.djstour.com ./scripts/smoke-bokun.sh
#
# Optional:
#   UI_LANG=hant
#   MAX_ITEMS=20
#   DATE=2026-06-10
#   ACTIVITY_ID=825419   # override auto-picked first activity id
#   CURL_MAX_TIME=45

BASE_URL="${BASE_URL:-https://www.djstour.com}"
UI_LANG="${UI_LANG:-hant}"
MAX_ITEMS="${MAX_ITEMS:-20}"
DATE="${DATE:-2026-06-10}"
CURL_MAX_TIME="${CURL_MAX_TIME:-45}"
ACTIVITY_ID="${ACTIVITY_ID:-}"

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
else
  fail "catalog returned empty activities[]"
  exit 1
fi

if [[ -z "$ACTIVITY_ID" ]]; then
  ACTIVITY_ID="$first_id"
fi

# 2) Activity detail
detail_code="$(curl -sS -L --max-time "$CURL_MAX_TIME" \
  -o "$detail_json" -w "%{http_code}" \
  "$BASE_URL/api/bokun/activity?id=$ACTIVITY_ID&lang=$UI_LANG" || true)"

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
print(f"{aid}|{src}|{dlen}")
PY
)"
detail_id="${detail_eval%%|*}"
rest="${detail_eval#*|}"
detail_source="${rest%%|*}"
detail_desc_len="${rest#*|}"

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
  "pax": [{ "pricingCategoryId": 5001, "quantity": 1 }],
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

echo
echo "== Summary =="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
