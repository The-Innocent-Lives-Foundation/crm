#!/usr/bin/env bash
# Drop-folder auto-import for Funraise exports.
#
# Watch /home/stephen/funraise-import for new *.csv / *.json files and
# import them into Twenty CRM automatically. Put your Funraise transaction
# report export here and it will be ingested.
#
# Usage: ./scripts/funraise-watch.sh

set -euo pipefail

WATCH_DIR="/home/stephen/funraise-import"
DONE_DIR="${WATCH_DIR}/imported"
TWENTY_URL="http://127.0.0.1:3000"

mkdir -p "$WATCH_DIR" "$DONE_DIR"

echo "Watching $WATCH_DIR for Funraise exports..."

while true; do
  for file in "$WATCH_DIR"/*.csv "$WATCH_DIR"/*.json; do
    [ -e "$file" ] || continue
    [ -f "$file" ] || continue

    base="$(basename "$file")"
    echo "=== Importing $base ==="

    if [[ "$file" == *.json ]]; then
      curl -s -X POST \
        "${TWENTY_URL}/webhooks/funraise/csv-import" \
        -H "Content-Type: application/json" \
        --data-binary "@$file" || true
    else
      curl -s -X POST \
        "${TWENTY_URL}/webhooks/funraise/import" \
        -H "Content-Type: text/plain" \
        --data-binary "@$file" || true
    fi

    echo ""
    mv "$file" "$DONE_DIR/${base}.imported"
    echo "Moved $base -> imported/"
  done

  sleep 10
done