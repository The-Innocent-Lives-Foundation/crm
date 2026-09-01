#!/usr/bin/env python3
"""
Funraise → Twenty CRM full backfill.

Authenticates to platform.funraise.io (session), pages through the internal
/api/v1/transaction/filter endpoint, maps each transaction to the Funraise
webhook payload shape, and imports into Twenty via /webhooks/funraise/csv-import.

Usage:
  python3 funraise-backfill.py [--batch 200] [--limit N] [--dry-run]

Env vars:
  FUNRAISE_USERNAME  (required)
  FUNRAISE_PASSWORD  (required)
  TWENTY_URL         (default http://127.0.0.1:3000)
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
import http.cookiejar

PLATFORM = "https://platform.funraise.io"
TWENTY_URL = os.environ.get("TWENTY_URL", "http://127.0.0.1:3000")


def login(username, password):
    """Authenticate and return authToken cookie value."""
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(),
    )

    # Get CSRF token
    resp = opener.open(f"{PLATFORM}/login", timeout=15)
    html = resp.read().decode()
    csrf = None
    for line in html.split("\n"):
        if 'value="' in line and "csrf" in line.lower():
            csrf = line.split('value="')[1].split('"')[0]
            break
    if not csrf:
        # Fallback: any value= attribute
        import re
        m = re.search(r'value="([^"]+)"', html)
        if m:
            csrf = m.group(1)

    body = urllib.parse.urlencode({
        "username": username,
        "password": password,
        "csrfToken": csrf or "",
    }).encode()

    req = urllib.request.Request(
        f"{PLATFORM}/login",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        opener.open(req, timeout=15)
    except urllib.error.HTTPError as e:
        if e.code not in (302, 303):
            raise RuntimeError(f"Login failed: HTTP {e.code}")

    # Extract authToken
    for cookie in cj:
        if cookie.name == "authToken":
            return cookie.value

    raise RuntimeError("No authToken cookie received after login")


def api_request(auth_token, method, path, body=None):
    headers = {"Cookie": f"authToken={auth_token}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()

    req = urllib.request.Request(
        f"{PLATFORM}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"API error {e.code} on {path}: {body[:300]}")


def split_name(full_name):
    if not full_name:
        return "", ""
    parts = full_name.strip().split(" ", 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else ""
    return first, last


def map_transaction(tx, supporter=None):
    """Map platform transaction to FunraiseTransactionData (webhook) shape."""
    donor_id = tx.get("donorId") or 0
    full_name = tx.get("donorFullName") or ""
    email = tx.get("donorEmail") or None
    first, last = split_name(full_name)

    sup_data = supporter or {}
    institution = sup_data.get("institution") or {}
    institution_category = institution.get("category", "Individual")
    institution_name = institution.get("name")
    tags = sup_data.get("tags", "")

    recurring = tx.get("recurring") or False
    sequence = tx.get("recurringSequence")

    dedication_name = tx.get("dedicationName")
    dedication_email = tx.get("dedicationEmail")

    return {
        "id": tx.get("id"),
        "description": full_name or email or None,
        "anonymous": bool(tx.get("anonymous")),
        "imported": bool(tx.get("imported")),
        "offline": bool(tx.get("offline")),
        "donationDate": tx.get("donationDate"),
        "comment": None,
        "tags": tags,
        "transaction": {
            "amount": tx.get("amount"),
            "currency": "USD",
            "status": tx.get("status") or "Complete",
            "cardType": None,
            "lastFour": str(tx.get("lastFour")) if tx.get("lastFour") else None,
            "paymentMethod": tx.get("paymentMethod"),
            "gatewayType": None,
            "transactionId": None,
            "errors": None,
        },
        "dedication": (
            {
                "message": None,
                "name": dedication_name,
                "email": dedication_email,
                "type": None,
            }
            if (dedication_name or dedication_email)
            else None
        ),
        "companyMatch": None,
        "subscription": (
            {"id": donor_id, "sequence": sequence or 1} if recurring else None
        ),
        "allocation": None,
        "form": (
            {"id": None, "name": tx.get("formName")}
            if tx.get("formName")
            else None
        ),
        "campaignPage": None,
        "softCreditSupporter": None,
        "supporter": {
            "id": donor_id,
            "firstName": first or None,
            "lastName": last or None,
            "name": full_name or email or None,
            "email": email,
        },
        "household": None,
        "pledge": None,
        "tip": None,
        "utm": None,
    }


def import_to_twenty(transactions, twenty_url):
    body = json.dumps(transactions).encode()
    req = urllib.request.Request(
        f"{twenty_url}/webhooks/funraise/csv-import",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Twenty import error {e.code}: {body[:300]}")


def get_supporter_cached(auth_token, donor_id, cache):
    if donor_id in cache:
        return cache[donor_id]
    try:
        req = urllib.request.Request(
            f"https://platform.funraise.io/api/v1/crm/supporter/{donor_id}",
            headers={"Cookie": f"authToken={auth_token}"},
        )
        resp = urllib.request.urlopen(req, timeout=10)
        sup = json.loads(resp.read().decode())
        cache[donor_id] = sup
        if len(cache) % 500 == 0:
            print(f"  cached {len(cache)} supporters...")
        return sup
    except Exception:
        cache[donor_id] = {}
        return {}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=200)
    parser.add_argument("--limit", type=int, default=0, help="0 = all")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--page-size", type=int, default=10,
                        help="Funraise caps at 10 per page")
    args = parser.parse_args()

    username = os.environ.get("FUNRAISE_USERNAME")
    password = os.environ.get("FUNRAISE_PASSWORD")

    if not username or not password:
        print("ERROR: set FUNRAISE_USERNAME and FUNRAISE_PASSWORD", file=sys.stderr)
        sys.exit(1)

    print("Logging in...")
    auth_token = login(username, password)
    print("Authenticated.")

    page = 1
    imported_total = 0
    failed_total = 0
    total_seen = 0
    total_available = None
    pending_batch = []
    supporter_cache = {}

    while True:
        resp = api_request(
            auth_token, "POST", "/api/v1/transaction/filter",
            {"filters": {}, "page": page, "pageSize": args.page_size},
        )
        results = resp.get("results", [])
        total_available = resp.get("totalSize", total_available)

        if not results:
            break

        mapped = []
        for tx in results:
            donor_id = tx.get("donorId")
            sup = get_supporter_cached(auth_token, donor_id, supporter_cache) if donor_id else None
            mapped.append(map_transaction(tx, sup))

        total_seen += len(results)
        pending_batch.extend(mapped)

        # Flush batch to Twenty once we accumulate enough
        if len(pending_batch) >= args.batch:
            if args.dry_run:
                print(
                    f"[dry-run] page {page}: {len(results)} txns "
                    f"(total seen {total_seen}/{total_available})"
                )
            else:
                result = import_to_twenty(pending_batch, TWENTY_URL)
                imported_total += result.get("success", 0)
                failed_total += result.get("failed", 0)
                print(
                    f"page {page}: {len(results)} txns "
                    f"(imported {imported_total}, failed {failed_total}, "
                    f"total seen {total_seen}/{total_available})"
                )
            pending_batch = []

        if args.limit and total_seen >= args.limit:
            break

        page += 1
        time.sleep(0.2)

    # Flush remaining
    if pending_batch:
        if args.dry_run:
            print(f"[dry-run] final flush: {len(pending_batch)} txns")
        else:
            result = import_to_twenty(pending_batch, TWENTY_URL)
            imported_total += result.get("success", 0)
            failed_total += result.get("failed", 0)
            print(
                f"final flush: {len(pending_batch)} txns "
                f"(imported {imported_total}, failed {failed_total})"
            )

    print(
        f"\nDONE: total seen {total_seen}, "
        f"imported {imported_total}, failed {failed_total}"
    )


if __name__ == "__main__":
    main()
