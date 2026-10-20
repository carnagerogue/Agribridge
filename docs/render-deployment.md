# Deploy Agribridge on Render

WhatsApp credentials are **not required** to deploy. There are two independent deployment options. Neither enables real payments or messages.

## Existing Agribridge service

The existing Render URL supplied by the project owner is **https://agribridge-d435.onrender.com**. Updates for that site should use its current Render service and database. The tested release is published to the repository's `main` branch; deploying that branch makes the public WhatsApp demonstration available at `/whatsapp-demo` alongside the operational platform. Confirm that the existing service watches `main`, or select that branch and deploy the latest commit in its Render dashboard. An automatic deployment occurs only if the existing service has it enabled.

The Blueprints below are for setting up services. They do not identify or update the existing Render service automatically. Live verification requires access to `agribridge-d435.onrender.com`; this cloud environment's hostname access requirement has been saved in its configuration draft.

## Public demonstration first

The root `render.yaml` creates a **static site** with an interactive WhatsApp demonstration. It requires no backend, database, accounts, or API keys. Conversations and sample records exist only in the visitor's browser memory; reset or reload clears them. It does not create a real farmer account, contact a buyer, retrieve live prices or weather, record audio, or transfer money. Luganda copy is a preview awaiting local review.

1. Make this revision available on a GitHub branch that Render can read.
2. In the [Render dashboard](https://dashboard.render.com/), choose **New → Blueprint**, connect `carnagerogue/Agribridge`, select that branch, and use the default `render.yaml` path. Review the resources, then deploy the static site.
3. Open the actual HTTPS URL returned by Render. Walk through signup, produce, market information, and payment updates; repeat on a phone. The root route and `/whatsapp-demo` both open the demonstration.

The build command is `npm ci --include=dev --no-audit --no-fund && npm run build:showcase`; the published directory is `dist-showcase`. The separate entry excludes the workspace's API client, authentication provider, and service worker. The site's Content Security Policy blocks network connections, and Permissions Policy disables microphone, camera, and geolocation. Keep these policies when adding a custom domain. No secret should ever use a `VITE_` variable or enter this static build.

Automatic deployment is disabled in both Blueprints. Subsequent releases require an explicit deployment in Render. Check current Render pricing and availability in the dashboard; the static option does not request a paid web instance or PostgreSQL.

## Operational platform

Use the Blueprint path **`deploy/render-platform.yaml`** for the full application. It requests a paid Starter web service in Frankfurt. It does not provision a database or set up WhatsApp, AI, forecasts, or payment providers.

1. Provision a PostgreSQL database with persistent storage, backups, a certificate-valid TLS hostname, and an application role allowed to run the initial schema migrations. Put its URL into Render's secure `DATABASE_URL` field when prompted. For Render PostgreSQL, use the **External Database URL** with its full certificate-valid hostname and allow only the web service's documented outbound IP ranges. Do not substitute the short internal hostname or disable certificate verification. Other managed TLS PostgreSQL providers also work.
2. Create the Blueprint using `deploy/render-platform.yaml` on the release branch. `NODE_ENV=production`, `HOST=0.0.0.0`, and `AGRIBRIDGE_DEMO=false` are explicit. Render supplies `PORT` and `RENDER_EXTERNAL_URL`; the latter is used for the exact public HTTPS origin when `PUBLIC_ORIGIN` is absent. For a custom domain, set `PUBLIC_ORIGIN` to that exact HTTPS origin without a trailing slash.
3. Require `/api/health/ready` to return HTTP 200 before releasing. This checks the database and schema. The server applies pending migrations transactionally before listening. For later deployments with a separate migration role, run `npm run db:migrate:production` once and set `DATABASE_MIGRATIONS=verify` for the web service.
4. Provision the first administrator in Render's protected service shell using the compiled `npm run admin:create:production` command and one-time `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (14+ characters), `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ORGANIZATION_NAME` environment variables. Enter values only through secure controls, then remove these variables after provisioning. Existing accounts are never overwritten.
5. Verify HTTPS login, cookie handling, an authenticated database request, logout, and a cold restart. The public `/whatsapp-demo` route works without signing in. Production never exposes sample-role logins.

`TRUST_PROXY=0` stays conservative until the actual Render ingress topology and forwarded-header handling are verified. Requests may share an ingress rate bucket until configured deliberately. See [deployment and operations](deployment.md) for migration, backup, restore, and release details.

The marketplace initially operates within each organization. A nationwide public storefront, real voice transcription, live logistics scraping, and integrated checkout are not enabled by deployment. Data and provider availability must remain visible rather than being replaced by sample records.

## Connect Render securely from this cloud environment

The environment currently has no Render identity or API credential. A requirement for **`RENDER_API_KEY`**, restricted to `api.render.com`, has been saved in environment settings together with Render API/documentation network access. Review and save those settings, enter the credential securely, then publish the environment. Saving a requirement does not create a key or deploy the application. Never paste a key into chat, source files, deployment YAML, screenshots, or shell arguments.

Render must also have access to the selected GitHub repository and release branch. Git clone access in this workspace does not imply that the Render account can read a private repository. A live deployment is complete only after Render returns a real service URL and the hosted checks pass.

## Local release checks

```sh
npm test
npm run build
npm run build:server
npm run build:showcase
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Test `dist-showcase` with an ordinary static server, including direct navigation to `/whatsapp-demo` with the rewrite rule applied. Confirm the browser makes no API/provider requests. Test the actual production container with PostgreSQL separately; a passing static demo is not proof of an operational deployment.
