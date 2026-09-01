#!/usr/bin/env python3
"""
Funraise CSV → Twenty CRM backfill script.

Usage:
  # Import a CSV exported from Funraise (Reports):
  python3 scripts/funraise-import.py import.csv

  # Import from stdin:
  cat export.csv | python3 scripts/funraise-import.py -

  # Import a JSON file (array of FunraiseTransactionData shape):
  python3 scripts/funraise-import.py donations.json

The script auto-detects CSV vs JSON and maps Funraise report columns
to the shape expected by /webhooks/funraise/import (raw CSV)
and /webhooks/funraise/csv-import (JSON array).
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error

TWENTY_URL = os.environ.get(
    "TWENTY_URL", "http://twenty-server:3000"
)

CSV_IMPORT_PATH = "/webhooks/funraise/import"
JSON_IMPORT_PATH = "/webhooks/funraise/csv-import"


def detect_format(filepath: str) -> str:
    """Return 'csv', 'json', or 'unknown'."""
    with open(filepath, "r") as f:
        peek = f.read(512).strip()
    if peek.startswith("[") or peek.startswith("{"):
        return "json"
    if "," in peek or "\t" in peek or ";" in peek:
        return "csv"
    return "unknown"


def import_csv(filepath: str, base_url: str) -> dict:
    with open(filepath, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        f"{base_url}{CSV_IMPORT_PATH}",
        data=data,
        headers={"Content-Type": "text/plain"},
        method="POST",
    )
    return _do_request(req)


def import_json(filepath: str, base_url: str) -> dict:
    with open(filepath, "r") as f:
        payload = json.load(f)

    # Ensure transactions list format
    if isinstance(payload, list):
        body = json.dumps(payload).encode()
    elif isinstance(payload, dict) and "transactions" in payload:
        body = json.dumps(payload).encode()
    else:
        body = json.dumps({"transactions": [payload]}).encode()

    req = urllib.request.Request(
        f"{base_url}{JSON_IMPORT_PATH}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return _do_request(req)


def _do_request(req: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {"error": e.code, "message": body[:500]}
    except urllib.error.URLError as e:
        return {"error": 0, "message": str(e.reason)}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    filepath = sys.argv[1]
    base_url = TWENTY_URL.rstrip("/")

    fmt = detect_format(filepath)

    if fmt == "csv":
        result = import_csv(filepath, base_url)
    elif fmt == "json":
        result = import_json(filepath, base_url)
    else:
        print(f"Error: cannot determine format of {filepath}", file=sys.stderr)
        sys.exit(1)

    if "error" in result:
        print(f"Import failed: {result}", file=sys.stderr)
        sys.exit(1)

    print(
        f"Import complete: {result.get('success', 0)} success, "
        f"{result.get('failed', 0)} failed, "
        f"{result.get('total', 0)} total"
    )


if __name__ == "__main__":
    main()