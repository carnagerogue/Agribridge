# Deployment and operations

The repository includes a production container and a TLS-protected PostgreSQL Compose stack. These are deployable artifacts, not a claim of a completed production rollout or SOC 2 certification. Docker was unavailable in the implementation environment, so an image build and complete Compose startup must be verified on the deployment host before release. The NodeNext server compilation was checked locally.

## Build and runtime

The Dockerfile has separate build, production-dependency and runtime stages. `npm run build` checks TypeScript and builds the web app; `npm run build:server` emits the Express server into `dist-server`. Runtime executes `node dist-server/index.js` and does not need `tsx` or other development dependencies. The container runs as the unprivileged `node` user, with a read-only root filesystem, dropped capabilities and a small writable `/tmp`. The app serves both the compiled web app and API on port 3001.

The image defaults to `NODE_ENV=production` and `AGRIBRIDGE_DEMO=false`. Production startup rejects demo mode, missing PostgreSQL, non-HTTPS public origins, and nonverified database TLS. By default, pending schema migrations run transactionally before the HTTP listener starts; set `DATABASE_MIGRATIONS=verify` to make startup check the schema without changing it. Application account credentials and all integration credentials stay outside the image. `.dockerignore` excludes local environment files, credentials, generated data, backups and development dependencies.

Node 22 and PostgreSQL 17 image tags are used. For a repeatable release, resolve their approved security-patched digests in the deployment pipeline, pin those digests, retain the lockfile, scan the resulting image, and record the application image digest. Do not invent or copy an unverified digest from documentation.

## Prepare the host

1. Use a maintained Linux host with Docker Engine and the Compose plugin. Restrict administrator access and enable encrypted persistent storage and off-host backups. The included stack is a pilot deployment, not a highly available national service.
2. Provision a public HTTPS hostname and TLS ingress. Set `PUBLIC_ORIGIN` to the exact origin, such as `https://agribridge.example.ug`, with no trailing slash. The application port binds to **127.0.0.1:3001** on the host; do not expose it publicly. Configure the ingress to proxy requests to that address and to overwrite forwarded headers.
3. Use your secret manager to create separate strong administrator and application PostgreSQL passwords. Place their files outside the repository or under an ignored `secrets/` directory. Application password must contain at least 24 characters. No password defaults are supplied.
4. Obtain a PostgreSQL server certificate and key from your private CA, with `db` as a DNS subject alternative name. Supply the issuing CA certificate separately. The server key remains private; the public CA file must be readable by the application container's UID 1000. Do not disable certificate verification to work around a certificate-name mismatch.
5. Create a separate ignored deployment environment file, for example `.env.deploy`, using the variables below. Do not reuse a local demo environment. The URL password must be percent-encoded and match the application-password file.

```dotenv
PUBLIC_ORIGIN=https://agribridge.example.ug
DATABASE_URL=postgresql://agribridge_app:URL_ENCODED_PASSWORD@db:5432/agribridge
POSTGRES_ADMIN_PASSWORD_FILE=/secure/agribridge/postgres-admin-password
POSTGRES_APP_PASSWORD_FILE=/secure/agribridge/postgres-app-password
POSTGRES_TLS_CERT_FILE=/secure/agribridge/postgres-server.crt
POSTGRES_TLS_KEY_FILE=/secure/agribridge/postgres-server.key
POSTGRES_CA_FILE=/secure/agribridge/postgres-ca.crt
AGRIBRIDGE_IMAGE_TAG=release-candidate
TRUST_PROXY=1
AI_DAILY_REQUEST_LIMIT=100
AI_USER_DAILY_REQUEST_LIMIT=10
MESSAGING_DAILY_LIMIT=200
MESSAGING_TENANT_DAILY_LIMIT=100
MESSAGING_RECIPIENT_DAILY_LIMIT=5
```

`TRUST_PROXY=1` is appropriate only when **every** incoming application request passes through exactly one trusted ingress. With a different topology, configure trust deliberately; never set it broadly just to silence a rate-limit warning. Direct access to the internal container network must be restricted. Until that topology is verified, leave `TRUST_PROXY=0`; requests may then share an ingress-level rate bucket.

The database service publishes no host port. Its private network accepts only TLS TCP connections with SCRAM authentication. Local maintenance uses the matching operating-system user. PostgreSQL initializes a separate `agribridge_app` role without superuser, role-creation or database-creation privileges; it can create its application tables in the `public` schema. Startup migrations (`DATABASE_MIGRATIONS=auto`) require those DDL privileges. A larger production deployment should separate them: run `npm run db:migrate:production` once per release with migration credentials, and run the application role with `DATABASE_MIGRATIONS=verify` and ordinary read/write privileges only.

Set `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`) before the first production start; startup refuses to run without it. It encrypts administrator two-factor secrets, so keep a copy in the organization's secret manager, separate from database backups: a restored database is unusable for administrator sign-in without it, and losing it means every administrator sets up two-factor sign-in again (`npm run admin:reset-mfa:production`).

Compose secret-file mounts are not an encrypted secret store. Protect source files, Docker access, host backups and environment files. Production orchestration should inject credentials from a managed secret service. Rotating files on an already initialized PostgreSQL volume does **not** change the stored database role passwords; perform a coordinated database role-password rotation and update the app credential.

## Start and provision

Validate configuration without printing interpolated credentials, then build and start:

```sh
docker compose --env-file .env.deploy config --quiet
docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps
```

The application waits for PostgreSQL's health check before starting. Its health check is HTTP liveness, not proof that every database or telecom dependency is healthy. Verify the HTTPS ingress, sign-in cookies, database queries, current weather and every configured provider independently.

Bootstrap the first administrator through the compiled command. Supply one-time `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ORGANIZATION_NAME` through your secret manager or protected terminal environment. Do not paste a password literal into shell history. Forward variable names, not values:

```sh
docker compose --env-file .env.deploy run --rm --no-deps \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD \
  -e BOOTSTRAP_ADMIN_NAME -e BOOTSTRAP_ORGANIZATION_NAME \
  app node dist-server/bootstrap-admin.js
```

Remove the one-time variables after provisioning. Existing accounts are never overwritten by this command. Use the admin experience to provision initial operators and farmers. Users receiving temporary passwords must rotate them before accessing workspace data.

## External services

An empty integration configuration means unavailable. It does not enable sample outbound delivery.

- Set a licensed or self-hosted `OPEN_METEO_BASE_URL` and, if needed, `OPEN_METEO_API_KEY`. The production model-forecast path requires an explicit endpoint. Official Uganda weather warnings use the public MWE CAP service independently.
- Set `OPENAI_API_KEY` and daily request allowances only after agreeing the usage budget and data-processing terms. The assistant sends a consented, bounded farming question and reference excerpts; it is not an autonomous operations agent. See [AI operations](ai.md).
- Provision real SMS senders, WhatsApp assets and a Uganda USSD shortcode. Confirm callback authentication with the provider/gateway. Set `CHANNEL_ORGANIZATION_ID` to the tenant returned by administrator provisioning. Configure spending caps and perform a small consented delivery test, including STOP, a duplicate callback, and a genuine delivery receipt. See [channels](channels.md).
- The provided `.env.example` documents optional variable names. Never use a `VITE_` prefix for any server credential.

## Backup, restore and release

Keep encrypted, access-restricted backups on a separate system and choose retention according to an agreed recovery policy. A host or Docker volume snapshot alone is not a verified database backup. A PostgreSQL custom-format export can be taken without exposing the database port:

```sh
docker compose --env-file .env.deploy exec --user postgres -T db \
  pg_dump -U postgres -d agribridge -Fc > /secure/backups/agribridge.dump
```

The output contains personal and operational data; write only to an access-controlled encrypted backup destination. Test restoration into a **separate** isolated database, verify account/tenant isolation and representative record counts, and record measured recovery time. Never practice a restore against the live volume. Do not use `docker compose down -v` on a deployment containing data.

Before release, run `npm test`, `npm run build`, and `npm run build:server`; test the actual image and PostgreSQL version, including concurrent edits, login/password rotation, offline sync, consent withdrawal, provider failures and budget ceilings. Capture an encrypted backup and a rollback decision before changing schema. Automatic rollback of schema changes is not implemented. The application records applied migrations in `schema_migrations` and refuses to run against a schema newer than it knows. Migration 2 (typed record tables) is not reversible: releases before it cannot start on an upgraded database, so rolling back past it means restoring the pre-upgrade backup. Retain the previous application image, and confirm its schema compatibility before switching back.

The application logs JSON lines to standard output and standard error, including a request ID, path, status and duration per API request (see [API logging](../server/README.md#operational-logging-and-health)). Ship those streams to a log store with access control and a retention period, and use `GET /api/health/ready` for readiness checks. Operational monitoring must cover HTTP error rates and latency, database connection pressure, disk space, backup age, failed login attempts, stale or unavailable forecasts, messages awaiting reconciliation, provider funding, spending caps and unreviewed content. Do not log passwords, tokens, callback bodies, precise locations or AI question/answer text. Agree incident ownership, data-retention/deletion workflows, Uganda privacy obligations and district support procedures before a public pilot. National scale additionally requires load testing, shared rate limits, managed high availability, restore drills, local-language review and field testing on low-end handsets.
