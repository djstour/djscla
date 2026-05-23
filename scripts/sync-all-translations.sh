#!/usr/bin/env bash
# Sync hant + hans translations for every activity in the Bókun channel catalog.
# Requires: curl, python3, TRANSLATION_SYNC_SECRET, deployed /api/catalog + /api/translations/sync
#
# Usage:
#   export TRANSLATION_SYNC_SECRET='…'
#   ./scripts/sync-all-translations.sh
# Optional: BASE_URL=https://djscla.vercel.app MAX_ITEMS=2000 SLEEP_SEC=2

set -euo pipefail

BASE_URL="${BASE_URL:-https://djscla.vercel.app}"
MAX_ITEMS="${MAX_ITEMS:-2000}"
SLEEP_SEC="${SLEEP_SEC:-2}"

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
echo "Syncing ${COUNT} activities (one request per id)…"

n=0
for id in $IDS; do
  n=$((n + 1))
  echo "=== [$n/${COUNT}] activity ${id} ==="
  curl -fsS --max-time 120 -X POST "${BASE_URL}/api/translations/sync" \
    -H "Authorization: Bearer ${TRANSLATION_SYNC_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"activityIds\": [${id}], \"langs\": [\"hant\", \"hans\"]}"
  echo
  sleep "$SLEEP_SEC"
done

echo "Done."
