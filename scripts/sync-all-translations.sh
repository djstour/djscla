#!/usr/bin/env bash
# Sync hant + hans for every activity in the Bókun channel catalog.
# Each HTTP call translates at most CHUNK translations (title/summary before long description).
#
# Usage:
#   export TRANSLATION_SYNC_SECRET='…'
#   ./scripts/sync-all-translations.sh
#
# Optional: BASE_URL, MAX_ITEMS, SLEEP_SEC, CHUNK (default 6), CURL_MAX_TIME (default 90)

set -uo pipefail

BASE_URL="${BASE_URL:-https://djstour.com}"
MAX_ITEMS="${MAX_ITEMS:-2000}"
SLEEP_SEC="${SLEEP_SEC:-2}"
CHUNK="${CHUNK:-6}"
CURL_MAX_TIME="${CURL_MAX_TIME:-90}"

if [[ -z "${TRANSLATION_SYNC_SECRET:-}" ]]; then
  echo "Set TRANSLATION_SYNC_SECRET first." >&2
  exit 1
fi

echo "Fetching activity IDs from ${BASE_URL}/api/catalog/activities?all=true …"
IDS=$(curl -fsS "${BASE_URL}/api/catalog/activities?all=true&maxItems=${MAX_ITEMS}&lang=hant" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(str(a['id']) for a in d.get('activities',[])))")

if [[ -z "$IDS" ]]; then
  echo "No activities returned." >&2
  exit 1
fi

COUNT=$(echo "$IDS" | wc -w | tr -d ' ')
echo "Syncing ${COUNT} activities (chunk=${CHUNK} translations per request, max ${CURL_MAX_TIME}s each)…"

sync_one_activity() {
  local id="$1"
  local round=0
  local max_rounds=40

  while [[ $round -lt $max_rounds ]]; do
    round=$((round + 1))
    local body
    body=$(curl -sS --max-time "$CURL_MAX_TIME" -X POST "${BASE_URL}/api/translations/sync" \
      -H "Authorization: Bearer ${TRANSLATION_SYNC_SECRET}" \
      -H "Content-Type: application/json" \
      -d "{\"activityIds\": [${id}], \"langs\": [\"hant\", \"hans\"], \"maxTranslations\": ${CHUNK}}" \
      2>&1) || {
      echo "  round ${round}: curl failed — retrying in 5s…"
      sleep 5
      continue
    }

    echo "  round ${round}: ${body}"

    local complete translated errors
    complete=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('summary',{}).get('complete') else 'false')" 2>/dev/null || echo "false")
    translated=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('summary',{}).get('translated',0))" 2>/dev/null || echo "0")
    errors=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('summary',{}).get('errors',[])))" 2>/dev/null || echo "1")

    if [[ "$complete" == "true" ]]; then
      return 0
    fi
    if [[ "$translated" == "0" && "$errors" == "0" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "  warning: activity ${id} may be incomplete after ${max_rounds} rounds" >&2
  return 1
}

n=0
fail=0
for id in $IDS; do
  n=$((n + 1))
  echo "=== [$n/${COUNT}] activity ${id} ==="
  if ! sync_one_activity "$id"; then
    fail=$((fail + 1))
  fi
  sleep "$SLEEP_SEC"
done

echo "Done. incomplete_or_failed=${fail}"
