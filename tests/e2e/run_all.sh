#!/usr/bin/env bash
# End-to-end tests: real Chromium + SapuX loaded as an extension + a fake x.com over HTTPS.
# Needs: python3, playwright (pip install playwright && python -m playwright install chromium), openssl.
# Optional: CHROMIUM=/path/to/chrome to use a specific Chromium build.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$WORK"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=x.com" \
  -addext "subjectAltName=DNS:x.com,DNS:api.x.com,DNS:pbs.twimg.com" \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" >/dev/null 2>&1

SERVER_PID=""
serve() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null || true
  rm -f "$WORK/calls.jsonl"
  python3 -I "$HERE/$1" "$WORK" >"$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  sleep 1.5
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "fake server $1 failed to start (port in use?):"; cat "$WORK/server.log"; exit 1
  fi
}
run() {
  echo "=== $1"
  rm -rf "$WORK"/profile* "$WORK"/ext*
  set +e
  python3 -I "$HERE/$1" "$WORK" "$ROOT" 2>&1 | tee "$WORK/out.log"
  local rc=${PIPESTATUS[0]}
  set -e
  if [ "$rc" -ne 0 ]; then
    # GitHub Actions: tampilkan ringkasan kegagalan sebagai anotasi supaya terbaca tanpa membuka log.
    if [ -n "${GITHUB_ACTIONS:-}" ]; then
      echo "::error title=$1 failed::$(grep -v '^[[:space:]]*$' "$WORK/out.log" | tail -n 25 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')"
      echo "::error title=$1 server log::$(tail -n 10 "$WORK/server.log" | awk '{printf "%s%%0A", $0}')"
    fi
    exit 1
  fi
}

serve fake_x.py;    run run_e2e_v2.py; run follow_filter_e2e.py; run stale_e2e.py
serve fake_x2.py;   run run_e2e_v21.py
serve fake_geo.py;  run geo_e2e.py
serve fake_geo2.py; run geo2_e2e.py
serve fake_geo2.py; run health_e2e.py
echo "ALL E2E PASSED"
