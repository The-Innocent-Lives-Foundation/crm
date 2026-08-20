# Resend Bridge for Twenty CRM

A lightweight sidecar service that connects **Twenty CRM's native workflow engine**
to **Resend** for transactional and drip-nurture email — with tracking webhooks,
unsubscribe handling, and CRM sync. No n8n required.

## What This Does

Twenty CRM v2.23.2 already has a powerful built-in workflow system with these
native action types:

| Action | Purpose in Email Automation |
|---|---|
| `DATABASE_EVENT` trigger | Enroll contacts when a record is created/updated |
| `CRON` trigger | Run batch segment processing on a schedule |
| `FIND_RECORDS` | Query contacts matching segment criteria |
| `IF_ELSE` / `FILTER` | Branch based on tags, fields, engagement |
| `ITERATOR` | Loop over a list of contacts |
| `DELAY` | Wait days/hours/minutes between emails (drip nurture) |
| `HTTP_REQUEST` | Call the Resend Bridge `/api/send` endpoint |
| `CREATE_RECORD` / `UPDATE_RECORD` | Track campaign enrollment and status |

This bridge fills the gaps that Twenty's prebuilt image can't handle on its own:

1. **Centralised Resend API key** — Twenty's `HTTP_REQUEST` action sends the
   bridge's own API key, not the raw Resend key.
2. **Unsubscribe links** — every email gets RFC 2369 `List-Unsubscribe` headers
   and a branded unsubscribe landing page.
3. **Suppression sync** — bounces, complaints, and unsubscribes are added to
   Resend's suppression list automatically.
4. **Tracking sync** — Resend webhook events (delivered, opened, clicked,
   bounced) are synced back to Twenty CRM as timeline activities.
5. **Rate limiting** — protects your Resend account from runaway workflows.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Twenty CRM (prebuilt image, port 3000)              │
│                                                      │
│  Workflow:                                           │
│  DATABASE_EVENT → FIND_RECORDS → ITERATOR            │
│       → DELAY (2 days)                               │
│       → HTTP_REQUEST (POST resend-bridge:3100/api/send)│
│       → DELAY (3 days)                               │
│       → HTTP_REQUEST (POST resend-bridge:3100/api/send)│
│       → UPDATE_RECORD (mark campaign complete)       │
└──────────────────────┬───────────────────────────────┘
                       │ (Docker network: twenty_default)
                       ▼
┌──────────────────────────────────────────────────────┐
│  Resend Bridge (Docker, port 3100)                   │
│                                                      │
│  POST /api/send          → Resend API (sends email)  │
│  POST /webhooks/resend   ← Resend (tracking events)  │
│  GET  /unsubscribe       → branded landing page      │
│  POST /unsubscribe       → suppress + sync to Twenty │
└───────┬──────────────────────────┬───────────────────┘
        │                          │
        ▼                          ▼
   Resend API              Twenty GraphQL API
   (api.resend.com)        (server:3000/graphql)

  Public access via nginx reverse proxy:
  https://crm.innocentlivesfoundation.org/email/ → 127.0.0.1:3100
  (No tunnel needed — uses existing nginx + Cloudflare edge SSL)
```
## Quick Start

### 1. Configure environment

```bash
cd /home/stephen/resend-bridge
cp .env.example .env
```

Edit `.env` and set these critical values:

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Your Resend API key from https://resend.com/api-keys |
| `RESEND_FROM_EMAIL` | Sender address on verified domain: `notifications@go.innocentlivesfoundation.org` |
| `RESEND_FROM_NAME` | Display name: `Innocent Lives Foundation` |
| `BRIDGE_API_KEY` | Random string Twenty workflows use to authenticate (`openssl rand -hex 32`) |
| `PUBLIC_BASE_URL` | Public URL where the bridge is reachable (for unsubscribe links) |
| `TWENTY_API_URL` | `http://server:3000/graphql` (inside Docker network) |
| `TWENTY_API_KEY` | Twenty API key from Settings → Developer → API Keys |

### 2. Build and deploy with Docker

```bash
cd /home/stephen/resend-bridge
docker compose up -d --build
```

The bridge joins the `twenty_default` Docker network so it can reach the
Twenty server at `http://server:3000/graphql` and is reachable from the host
at `127.0.0.1:3100`.

### 3. Verify

```bash
curl http://127.0.0.1:3100/healthz
# Expected: {"status":"ok","resend":true,"twenty":true,...}
```

### 4. Expose the bridge publicly (via existing nginx — no tunnel needed)

An nginx location block has already been added to the existing
`crm.innocentlivesfoundation.org` server block. The bridge is accessible at:

```
https://crm.innocentlivesfoundation.org/email/
```

This uses the existing nginx reverse proxy + Cloudflare edge SSL.
No new tunnel, DNS record, or SSL certificate is required.

If you need to re-add the nginx config, the location block is:
```nginx
location /email/ {
    proxy_pass http://127.0.0.1:3100/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 10m;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
}
```

Set `PUBLIC_BASE_URL=https://crm.innocentlivesfoundation.org/email` in `.env`.

### 5. Configure Resend webhooks

In the Resend dashboard → Webhooks → create a webhook pointing to:
```
https://crm.innocentlivesfoundation.org/email/webhooks/resend
```
Select events: `email.delivered`, `email.opened`, `email.clicked`,
`email.bounced`, `email.complained`, `email.failed`.

Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET` in `.env`.

## Configuring Drip Nurture Workflows in Twenty CRM

### A. Create custom objects (optional, recommended)

**Campaign object** (Twenty → Settings → Objects):
- Plural name: `emailCampaigns` — Fields: `name` (text), `status` (select: draft/active/paused/completed)

**Suppression object:**
- Plural name: `emailSuppressions`, singular: `emailSuppression`
- Fields: `email` (text), `reason` (text), `campaignId` (text)

### B. Build the drip nurture workflow

In Twenty → Workflows → New Workflow:

**Trigger:** `DATABASE_EVENT` — fires when a Person is created or a tag/field is set.

**Steps:**
```
Step 1: FIND_RECORDS
        Object: Person
        Filter: nurtureStatus equals "enrolled"

Step 2: ITERATOR (loop over found records)
  ├── Step 2a: IF_ELSE — person.email is not empty AND not in suppression list
  ├── Step 2b: HTTP_REQUEST — Email 1 (Welcome)
  │     Method: POST
  │     URL: http://resend-bridge:3100/api/send
  │     Headers: { Authorization: "Bearer <BRIDGE_API_KEY>", Content-Type: "application/json" }
  │     Body: { "to": "{{person.email}}", "subject": "Welcome!", "html": "...", "campaignId": "welcome" }
  ├── Step 2c: DELAY — DURATION: 2 days
  ├── Step 2d: HTTP_REQUEST — Email 2 (Tips & Resources)
  ├── Step 2e: DELAY — DURATION: 3 days
  ├── Step 2f: HTTP_REQUEST — Email 3 (CTA / Offer)
  └── Step 2g: UPDATE_RECORD — set person.nurtureStatus = "completed"
```

### C. Segmentation with IF_ELSE and FILTER

- **Industry segment:** `IF person.company.industry == "SaaS"` → send variant A
- **Engagement segment:** `IF person.lastEmailOpened > 7 days ago` → re-engagement email
- **Tag-based segment:** `IF person.tags CONTAINS "newsletter"` → newsletter flow

### D. Batch scheduling with CRON trigger

For scheduled batch sends (e.g., weekly newsletter):
- **Trigger:** `CRON` — `0 9 * * 1` (every Monday at 9 AM)
- Then: `FIND_RECORDS` → `ITERATOR` → `HTTP_REQUEST`

## API Reference

### `POST /api/send` — Send email via Resend

**Headers:** `Authorization: Bearer <BRIDGE_API_KEY>`, `Content-Type: application/json`

**Body:**
```json
{ "to": "recipient@example.com", "subject": "Subject", "html": "<p>Body</p>", "campaignId": "welcome" }
```

**Response:** `{ "success": true, "messageId": "re_abc123…" }`

### `POST /webhooks/resend` — Resend tracking webhook

Receives Resend events (`email.delivered`, `email.opened`, etc.).
Maps to simplified types and syncs to Twenty CRM. Bounce/complaint events
are auto-suppressed in Resend.

### `GET /unsubscribe?email=…&campaign=…` — Unsubscribe page

### `POST /unsubscribe` — Process unsubscribe (suppress + sync to Twenty)

### `GET /healthz` — Health check

---

## File Structure

```
resend-bridge/
├── docker-compose.yml   # Joins twenty_default network
├── Dockerfile           # Node 22 Alpine
├── .env.example         # Environment template
├── package.json
└── src/
    ├── index.js         # Express: health, send, webhook, unsubscribe
    ├── config.js        # Env-based config + validation
    ├── resend-client.js # Resend API (send + suppress)
    └── twenty-client.js # Twenty GraphQL (find person, log event, suppress)
```

## Notes

- The bridge is **stateless** — all config from environment variables.
- Twenty GraphQL mutations are defensive — errors are logged but never
  block email sending.
- Rate limiting is in-memory (resets on restart).
- Check logs: `docker logs resend-bridge`


