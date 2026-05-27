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

# Use www — bare djstour.com 307-redirects and curl without -L returns "Redirecting..." (not JSON).
BASE_URL="${BASE_URL:-https://www.djstour.com}"
MAX_ITEMS="${MAX_ITEMS:-2000}"
SLEEP_SEC="${SLEEP_SEC:-2}"
CHUNK="${CHUNK:-6}"
CURL_MAX_TIME="${CURL_MAX_TIME:-90}"
CURL_FLAGS=(-fsSL --max-time "${CURL_MAX_TIME}")

if [[ -z "${TRANSLATION_SYNC_SECRET:-}" ]]; then
  echo "Set TRANSLATION_SYNC_SECRET first." >&2
  exit 1
fi

echo "Fetching activity IDs from ${BASE_URL}/api/catalog/activities?all=true …"
CATALOG_JSON=$(curl "${CURL_FLAGS[@]}" "${BASE_URL}/api/catalog/activities?all=true&maxItems=${MAX_ITEMS}&lang=hant") || {
  echo "Failed to fetch catalog (check BASE_URL and network)." >&2
  exit 1
}

IDS=$(echo "$CATALOG_JSON" | python3 -c "
import sys, json
raw = sys.stdin.read().strip()
if not raw:
    sys.exit('empty response', 2)
try:
    d = json.loads(raw)
except json.JSONDecodeError as e:
    sys.exit(f'not JSON (often a redirect page): {raw[:120]!r} … ({e})', 2)
ids = [str(a['id']) for a in d.get('activities', []) if a.get('id') is not None]
print(' '.join(ids))
") || {
  echo "Could not parse catalog response." >&2
  exit 1
}

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
  local stale_rounds=0
  local curl_fail_rounds=0
  local prev_body=""
  local total_translated=0
  local total_skipped=0
  local total_errors=0

  while [[ $round -lt $max_rounds ]]; do
    round=$((round + 1))
    local body
    body=$(curl "${CURL_FLAGS[@]/-f/}" -X POST "${BASE_URL}/api/translations/sync" \
      -H "Authorization: Bearer ${TRANSLATION_SYNC_SECRET}" \
      -H "Content-Type: application/json" \
      -d "{\"activityIds\": [${id}], \"langs\": [\"hant\", \"hans\"], \"maxTranslations\": ${CHUNK}}" \
      -w "\n__HTTP_CODE__%{http_code}__REDIRECT__%{redirect_url}__" \
      2>&1) || {
      echo "  round ${round}: curl failed — retrying in 5s…"
      curl_fail_rounds=$((curl_fail_rounds + 1))
      if [[ $curl_fail_rounds -ge 6 ]]; then
        echo "  stopping early: 6 consecutive curl failures (network/timeout/5xx)."
        return 1
      fi
      sleep 5
      continue
    }
    curl_fail_rounds=0

    local parsed
    parsed=$(echo "$body" | python3 -c "
import sys, json
raw = sys.stdin.read()
marker = '\n__HTTP_CODE__'
http_code = '?'
redirect = ''
if marker in raw:
    payload, tail = raw.rsplit(marker, 1)
    # tail: <code>__REDIRECT__<url>__
    try:
        http_code, rest = tail.split('__REDIRECT__', 1)
        redirect = rest[:-2] if rest.endswith('__') else rest
    except Exception:
        pass
else:
    payload = raw

payload = payload.strip()
if not payload:
    print(f'false\t0\t0\t1\thttp={http_code} empty response')
    raise SystemExit(0)

try:
    d = json.loads(payload)
except Exception:
    snippet = payload[:120].replace('\\n', ' ')
    redir_note = f' redirect={redirect}' if redirect else ''
    print(f'false\t0\t0\t1\thttp={http_code}{redir_note} non-json: {snippet!r}')
    raise SystemExit(0)
s = d.get('summary', {})
complete = 'true' if s.get('complete') else 'false'
translated = int(s.get('translated', 0) or 0)
skipped = int(s.get('skipped', 0) or 0)
errors = s.get('errors', []) or []
err_count = len(errors)
err_types = []
for e in errors:
    msg = str(e.get('message', '')).strip() if isinstance(e, dict) else str(e).strip()
    if msg:
        err_types.append(msg)
uniq = sorted(set(err_types))
err_hint = '; '.join(uniq[:2]) if uniq else '-'
print(f'{complete}\t{translated}\t{skipped}\t{err_count}\t{err_hint}')
" 2>/dev/null || echo "false	0	0	1	<parse-error>")

    local complete translated skipped errors err_hint
    IFS=$'\t' read -r complete translated skipped errors err_hint <<< "$parsed"
    total_translated=$((total_translated + translated))
    total_skipped=$((total_skipped + skipped))
    total_errors=$((total_errors + errors))

    echo "  round ${round}: +${translated} translated, +${skipped} skipped, +${errors} errors | totals: t=${total_translated}, s=${total_skipped}, e=${total_errors}"
    if [[ "$errors" != "0" && -n "$err_hint" && "$err_hint" != "-" ]]; then
      echo "    error hint: ${err_hint}"
    fi

    if [[ "$complete" == "true" ]]; then
      echo "  done: complete=true after ${round} rounds (translated=${total_translated}, skipped=${total_skipped}, errors=${total_errors})"
      return 0
    fi
    if [[ "$translated" == "0" && "$errors" == "0" ]]; then
      echo "  done: no remaining work after ${round} rounds (translated=${total_translated}, skipped=${total_skipped})"
      return 0
    fi
    # Same failing response repeatedly (e.g. length sanity on mode/title) — do not burn 40 rounds.
    if [[ "$translated" == "0" && "$errors" != "0" && "$body" == "$prev_body" ]]; then
      stale_rounds=$((stale_rounds + 1))
      if [[ $stale_rounds -ge 2 ]]; then
        echo "  stopping early: repeated errors with no progress (translated=${total_translated}, skipped=${total_skipped}, errors=${total_errors})"
        return 1
      fi
    else
      stale_rounds=0
    fi
    prev_body="$body"
    sleep 1
  done

  echo "  warning: activity ${id} may be incomplete after ${max_rounds} rounds (translated=${total_translated}, skipped=${total_skipped}, errors=${total_errors})" >&2
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
