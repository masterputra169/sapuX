#!/usr/bin/env bash
# Build the extension ZIP that users install: runtime files only (no tests, docs or CI files),
# plus a SHA-256 checksum so anyone can verify the download.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/manifest.json').version")"
OUT="${1:-$ROOT/dist}"
NAME="sapux-$VERSION"
rm -rf "$OUT/$NAME" "$OUT/$NAME.zip"
mkdir -p "$OUT/$NAME"
cd "$ROOT"
cp -r manifest.json background.js _locales lib ui icons fonts LICENSE "$OUT/$NAME/"
cp README.md PRIVACY.md "$OUT/$NAME/"
cd "$OUT"
# Fixed timestamps + sorted entries so the same source always gives the same ZIP.
find "$NAME" -exec touch -h -d "2026-01-01T00:00:00Z" {} +
find "$NAME" -type f | LC_ALL=C sort | zip -q -X -D "$NAME.zip" -@
sha256sum "$NAME.zip" > "$NAME.zip.sha256"
rm -rf "$NAME"
echo "$OUT/$NAME.zip"
cat "$NAME.zip.sha256"
