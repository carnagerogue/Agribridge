# Full application on Render

Status: configuration prepared; no cloud resources have been created or verified.

`render.yaml` builds the existing Dockerfile and hosts the React application and
Express API together. The public address is Render's assigned HTTPS URL, which
the server reads from `RENDER_EXTERNAL_URL`. GitHub remains the source repository;
GitHub Pages cannot execute this application's server or database. Keeping the
frontend and API together preserves the existing same-origin session and CSRF
behavior. A separate Pages frontend is not part of this deployment.

## Proposed resources

- One Frankfurt web service, `0.5c-512mb` (formerly Starter), one instance.
- One separately provisioned PostgreSQL 17 database in the same region, starting
  with `0.1c-256mb` and 1 GB storage for a small pilot, subject to capacity testing.
- No automatic preview environments or autoscaling.

These are paid resources. Confirm the current web, database, storage, bandwidth,
and workspace charges in Render before creation. AI and messaging provider costs
are separate. This file does not create an account or authorize a purchase.

## Connect and deploy

1. Connect the Render integration and the intended Render workspace. Authorize
   Render to read this GitHub repository through its normal GitHub connection.
2. Create the PostgreSQL 17 database after approving its cost. Use its **external
   connection URL** for `DATABASE_URL`, entered directly in Render's environment
   settings. Do not paste credentials into chat, source files, or the Blueprint.
   Render's internal PostgreSQL endpoint uses a self-signed certificate and does
   not support certificate verification. Agribridge intentionally keeps
   `rejectUnauthorized: true`; do not disable that check to use the internal URL.
3. Restrict the database's external IP allow list to the web service's documented
   outbound ranges for the selected region, obtained from Render. Keep any
   necessary maintenance access narrowly scoped. Verify connectivity from the
   deployed service; do not leave the database open to every IP as a workaround.
4. Deploy the branch containing this `render.yaml` as a Blueprint and provide
   `DATABASE_URL` when prompted. The Blueprint leaves the database outside its
   resource list so the verified external URL and network rules are configured
   explicitly. Review the paid service proposal before applying it.
5. Wait for `/api/health/ready` to return 200. Startup applies the versioned
   migrations before accepting requests. Confirm that both `/welcome` and
   `/login` load over HTTPS. Inspect logs without printing secrets.
6. In the Render service's protected environment settings, temporarily supply
   `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (14+ characters),
   `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ORGANIZATION_NAME`. Run
   `node dist-server/bootstrap-admin.js` through the service's authenticated shell.
   Remove those four variables afterward. The command refuses to overwrite an
   existing user. Sign in and provision operator/farmer accounts.
7. Verify the ingress path before changing `TRUST_PROXY` from `0` to `1`.
   The conservative default may share rate limits across users behind the proxy.
   Do not raise replica count until shared rate limiting is implemented.
8. Optional integrations remain unavailable until configured: a licensed weather
   endpoint, reviewed guidance and an AI provider key, and approved SMS/WhatsApp/
   USSD provider accounts. See the existing deployment runbook and channel docs.

For a custom domain, configure it in Render and set `PUBLIC_ORIGIN` to its exact
HTTPS origin, with no trailing slash. That value overrides the Render URL; users
should sign in through the chosen canonical origin.

## Release checks

Run `npm test`, `npm run build`, and `npm run build:server`. Render must still
build the container and verify the live database TLS connection, migrations,
administrator sign-in, saved records, offline sync, and backups. Local compilation
does not prove that the hosted application has launched. Follow
[the deployment runbook](deployment.md) for backup/restore and operational checks.

References:
- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Database connections and TLS](https://render.com/docs/postgresql-creating-connecting)
- [Assigned runtime URLs](https://render.com/docs/environment-variables)
- [Current pricing](https://render.com/pricing)
