#!/usr/bin/env bash
# Copy marketing-site static assets into apps/web/public for co-deployment with the operator SPA.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/marketing-site"
DST="$ROOT/apps/web/public"

mkdir -p "$DST/assets"
rsync -a \
  --exclude 'index.html' \
  "$SRC/" "$DST/"

# Static marketing landing (React SPA still owns / and /app)
cp "$SRC/index.html" "$DST/home.html"
cp "$SRC/open-console.html" "$DST/open-console.html"

# React shell references root-level brand assets
cp "$SRC/assets/blamr_favicon.svg" "$DST/blamr_favicon.svg"
cp "$SRC/assets/blamr_logo.svg" "$DST/blamr_logo.svg"
if [[ ! -f "$DST/site.webmanifest" ]] && git -C "$ROOT" cat-file -e "HEAD:apps/web/public/site.webmanifest" 2>/dev/null; then
  git -C "$ROOT" show "HEAD:apps/web/public/site.webmanifest" > "$DST/site.webmanifest"
fi

echo "Synced marketing-site → apps/web/public (landing at /home.html)"
