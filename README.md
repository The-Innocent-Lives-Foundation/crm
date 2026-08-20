# ILF CRM

Deployment repository for the Innocent Lives Foundation CRM.

Everything in this repo deploys the full stack when pushed to `main`:

| Service | What it is |
|---|---|
| `packages/twenty-*` | Customized Twenty CRM v2.23.2 source (email builder + Send Email Template workflow node) |
| `resend-bridge/` | Resend delivery bridge (send / tracking webhooks / unsubscribe) |
| `docker-compose.yml` | Orchestrates db, redis, server, worker, bridge |
| `.github/workflows/deploy.yml` | CI/CD — self-hosted runner on the production server |

## Architecture

- **Twenty CRM** serves the app. Custom build adds:
  - Visual drag-and-drop **Email Designer** (`/email-builder`, sidebar → "Email Designer")
  - **Email Templates** object storing name, subject, html, css, json
  - **Send Email Template** workflow node — pick a saved template and send via Resend (no HTTP node)
- **resend-bridge** sends via Resend, receives webhooks, handles unsubscribes, syncs back to Twenty.

## Deploy (CI/CD)

A self-hosted GitHub Actions runner runs on the server. Push to `main`:

- installs deps
- builds `twenty-shared` → `twenty-server` → `twenty-front`
- starts the full compose stack (reusing existing DB/Redis/template volumes and secrets)

Manual deploy from the server:

```bash
./deploy.sh
```

## Required env (secrets live on the server, not in git)

- root `.env` — Twenty config (`PG_DATABASE_*`, `ENCRYPTION_KEY`, `SERVER_URL`, `APP_SECRET`, `EMAIL_TEMPLATE_BRIDGE_API_KEY`, …)
- `resend-bridge/.env` — `RESEND_API_KEY`, `BRIDGE_API_KEY`, `TWENTY_API_KEY`, `RESEND_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`

The deploy script reuses `/opt/twenty/.env` and `/home/stephen/resend-bridge/.env` on the server if present.

## Local stack

```bash
cp .env.example .env        # fill in secrets
cp resend-bridge/.env.example resend-bridge/.env
./deploy.sh
```