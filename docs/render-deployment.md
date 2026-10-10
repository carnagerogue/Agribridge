# Full application on Render

The existing deployment in **My Workspace** serves the full React application
and Express API at https://agribridge-d435.onrender.com from GitHub's `main`
branch. Its PostgreSQL 17 database is `agribridge-db`, in Frankfurt. Both the web
service and database use the **free** plan. Reuse these resources rather than
creating duplicates. GitHub Pages is not needed for this same-origin deployment.

## Free trial limits

The existing database expires on **October 29, 2026 at 9:33 p.m. Pacific**
(`2026-10-30T04:33:33.79438Z`). Export needed data before expiry. Render's free
PostgreSQL trial lasts 30 days from database creation, not from app redeployment.
It has 1 GB storage and no managed backups. The web service sleeps after 15
minutes of inactivity and can take about a minute to wake up. It has no shell
access or one-off jobs.

Keep all resources on free plans. No paid upgrade is authorized. Free compute
still counts toward workspace bandwidth and build-minute limits; review the
workspace's billing/spend settings before sustained traffic or repeated builds.
Do not promise an unconditional zero bill if a payment method and overages are
enabled. Optional AI and messaging services can have separate provider costs.

## Configuration

`render.yaml` documents a free Docker web service using the existing Dockerfile,
with a readiness check at `/api/health/ready`. It is a proposed configuration,
not a record that the existing service has synced it. Review differences before
applying a Blueprint to the existing service. No cloud settings are changed by
committing the file.

The server uses explicit `PUBLIC_ORIGIN` first, then Render's assigned
`RENDER_EXTERNAL_URL`. This keeps login, cookies, and CSRF at the same HTTPS
origin. For a custom domain, set its exact origin with no trailing slash.

`DATABASE_URL` must remain a secret in Render. Use the database's **external TLS
connection URL**: Render's internal endpoint uses a self-signed certificate and
does not support certificate verification. Agribridge keeps
`rejectUnauthorized: true`. Do not weaken this check. The existing database's
external allow list is restricted to the Render Frankfurt app egress ranges;
verify those ranges in Render before any network changes.

The Blueprint leaves database provisioning separate because it requires the
verified external URL. Do not create a second database or replace the current
one to reset its trial. Reuse existing secrets and accounts.

The existing service tracks `main` and deploys after CI checks pass. The draft
`codex/render-deployment` branch does not change the running app until merged
and successfully deployed. Its configuration fallback is not required when
`PUBLIC_ORIGIN` is already set correctly.

## Accounts and optional services

Use existing provisioned accounts to sign in. If a new environment needs its
first administrator, run `npm run admin:create:production` from a trusted local
checkout with the production database connection, TLS settings, exact public
origin, and the four `BOOTSTRAP_ADMIN_*` values injected through a protected
local environment. Temporarily allow only that machine's IP for database access,
then remove the allowance and one-time credentials. Do not paste passwords into
chat or source files. The command refuses to overwrite an existing account.

Forecasts need a configured licensed weather endpoint; AI needs its provider key
and reviewed guidance; messaging needs approved provider accounts. These are
separate from publishing the application. No provider purchase or credential
change is authorized by the free hosting choice.

## Validation

Check `/api/health`, `/api/health/ready`, `/welcome`, and `/login` over HTTPS.
Confirm schema migrations and use an existing account for authenticated workflow
tests. A public landing page alone does not prove sign-in or optional integrations.
The local configuration changes passed TypeScript checks, server compilation,
four new configuration tests, and twenty existing security/API tests.

See [the deployment runbook](deployment.md) for backup and operational procedures.

References:
- [Render free-tier limits](https://render.com/docs/free)
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Database connections and TLS](https://render.com/docs/postgresql-creating-connecting)
- [Assigned runtime URLs](https://render.com/docs/environment-variables)
