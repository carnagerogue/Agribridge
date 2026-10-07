# Agribridge API

The API runs on Node 22+, Express 5 and PostgreSQL. For a local demonstration, PGlite runs the same parameterized SQL on disk at `.data/agribridge`. It is a single-process local database, not a national-scale deployment architecture.

## Local use

Run `npm run demo` from the repository root. Demo access is explicit and loopback-only. The sign-in screen can establish farmer, operator or administrator sessions through `POST /api/auth/demo`. Sample organizations, contacts, farms, prices and trading opportunities are labelled sample data. Outbound telecom delivery is disabled in this mode, even if provider credentials are present.

`.env` is loaded only by `server/index.ts` and the bootstrap command. Never put secrets in a `VITE_` variable. API keys remain server-side. The API serves `dist/` when it exists; during development, Vite proxies `/api` to the API.

## Account provisioning

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 14 characters), `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ORGANIZATION_NAME` in the deployment's secret environment, then run `npm run admin:create`. `AGRIBRIDGE_DEMO` must be disabled. The command refuses to overwrite an existing identity and prints only the new organization ID. Remove bootstrap secrets after provisioning. Do not put passwords in command-line arguments or shell history.

Administrators can list and create tenant members at `/api/admin/users`. An email or Uganda mobile number and an initial password are required. Initial credentials must be shared using the organization's approved process; the application never automatically messages them. A newly provisioned person must change their initial password before accessing data.

`POST /api/auth/login` accepts `{email: "email-or-phone", password}`. `POST /api/auth/password` accepts `{currentPassword,newPassword}`, revokes every existing session, and returns a new `{user,csrfToken}` session. Administrators can suspend or reactivate another tenant member using `PATCH /api/admin/users/:id` with `{active}`; suspension immediately revokes all of that member's sessions. Self-suspension is blocked. Password recovery, administrator MFA and external identity federation still need operational integration before a broad production launch.

## Security and persistence

- Opaque, random, server-side sessions. Only session-token hashes are stored; cookies are HttpOnly, SameSite=Lax, and Secure with a `__Host-` name in production. Session lifetime is 12 hours.
- Salted scrypt password hashes and timing-safe comparison. The idempotency fingerprint slows hashing of password fields as well, so it does not become a fast alternate password verifier.
- Exact-origin checks plus session-bound CSRF tokens on authenticated mutations. Provider callbacks have their own signature/token validation and are mounted before JSON parsing.
- Tenant boundaries on reads and writes; farmers only access their own farms, tasks, reports and learning progress. Offers and prices are visible within a tenant. Operators manage contacts and trade. Administrators provision tenant accounts.
- Input allowlists, body size and rate limits. Mutable records use optimistic `version` checks; stale changes return `409 VERSION_CONFLICT`.
- UUID `Idempotency-Key` replay is persisted per tenant and user. Entity write, audit event and replay record commit atomically. A key reused for another request is rejected.
- Audit records contain action metadata, not passwords, message bodies, AI prompts or medical details. The application writes audit events but the database owner can change them: immutable external audit retention is a deployment responsibility.
- Messages reserve a durable record before contacting a provider. Ambiguous network outcomes are not automatically retried. Signed receipts are deduplicated, survive early arrival, and do not downgrade delivery state.
- Paid message attempts use persistent atomic daily limits: `MESSAGING_DAILY_LIMIT` (default 200 globally), `MESSAGING_TENANT_DAILY_LIMIT` (100 per organization), and `MESSAGING_RECIPIENT_DAILY_LIMIT` (5 per recipient across organizations). Invalid settings stop delivery. Attempts are not refunded following provider uncertainty; the telecom account also needs a funded spending limit. These caps bound message attempts, not a precise monetary amount.
- SMS/WhatsApp marketing permission is recorded per channel. STOP withdraws permission; START does not grant it. SMS follow-up tasks retain a provider reference, not raw message text. Verified WhatsApp messages enter a separate private support inbox; its task notices contain neither the message text nor the sender's number.
- USSD exposes public verified prices, model forecasts and reviewed learning content only. Callback requests require affirmative confirmation. Private farm records are not authenticated by an unverified phone number alone.

## Schema and migrations

Each record type has its own typed table (`farms`, `tasks`, `contacts`, `market_prices`, `offers`, `deals`, `reports`, `progress`, `settings`, `messages`, `seasons`, `lots`, `collections`). Columns carry real SQL types, enumerated values have `CHECK` constraints, and references between records are `(tenant_id, id)` foreign keys, so the database itself rejects a link to another organization's record. Season cost/sale lines, collection manifests and per-channel inbound times remain `jsonb` columns for now. The API shape is unchanged: [`records.ts`](records.ts) maps camelCase fields to columns, and writing a field without a column throws instead of being silently dropped.

Schema changes are numbered migrations in [`migrations/`](migrations/). Each one is literal SQL, runs in a single transaction and is recorded with a checksum in `schema_migrations`. Concurrent processes serialize on a PostgreSQL advisory lock. The runner refuses an edited applied migration, and refuses to run when the database has a newer version than the release knows about.

To change the schema, append a new migration to [`migrations/index.ts`](migrations/index.ts), update the registry in `records.ts`, and run `npm run test:server`. A test compares the registry with the migrated database column by column. Never edit, rename or reorder an applied migration.

Migration 2 copies the earlier generic JSON `entities` table into the typed tables. Before copying, it stops if any legacy record has a type or field without a destination. It casts every value, compares row counts and only then removes the legacy table. Any failure leaves the database unchanged. A small empty `entities` view replaces the table so releases from before versioned migrations fail at startup instead of running against an apparently empty database.

`DATABASE_MIGRATIONS=auto` (the default) applies pending migrations at startup. With `DATABASE_MIGRATIONS=verify`, startup only checks the schema and refuses to start until `npm run db:migrate` (or `npm run db:migrate:production` for the compiled build) has applied the migrations. That lets the application role run without schema-change privileges.

The application is not SOC 2 certified. There is no substitute in this repository for an independent assessment, access governance, key management, incident response, backup testing, monitoring, disaster recovery and Uganda data-protection obligations.

## Weather and learning

`GET /api/weather?latitude=...&longitude=...` accepts Uganda-area coordinates. Open-Meteo forecasts are cached by rounded geographic cell for 30 minutes; outages may return a clearly marked prior forecast up to six hours old. Otherwise the endpoint returns `503 WEATHER_UNAVAILABLE`. It never invents a fallback forecast. External model forecasts do not establish field conditions or a pest/disease diagnosis.

Production requires `OPEN_METEO_BASE_URL` pointing to an appropriately licensed hosted or self-hosted endpoint. `OPEN_METEO_API_KEY` is optional for providers that require it. The hosted free service has commercial-use restrictions; consult [Open-Meteo pricing](https://open-meteo.com/en/pricing). Without it, production startup logs `weather.not_configured`, the forecast endpoint returns `503 WEATHER_NOT_CONFIGURED` with a message that names the missing setup rather than the user's connection, and Administration lists the weather integration as not configured. Other forecast failures return `503 WEATHER_UNAVAILABLE` and log `weather.unavailable` with a reason (`timeout`, `network`, `http_<status>`, `invalid_data` or `incomplete_data`), never coordinates.

`GET /api/weather/warnings` reads Uganda MWE's public CAP service. An empty successful response means no warnings were returned; an outage returns an error instead. These are separate from the model forecast. See [official weather API documentation](https://wids.mwe.go.ug/portal/api-docs).

Six short field guides are original summaries with official source links. They initially remain drafts awaiting agronomist review. Their quizzes are graded on the server and do not constitute professional certification. Production AI refuses an unreviewed knowledge corpus. Environmental reports support standing-water observation and review; no individual malaria cases, patient records, automatic diagnosis or chemical treatment recommendations are implemented.

Administrators can edit field-guide content and record a qualified review for their organization at `GET /api/admin/lessons`, `GET /api/admin/lessons/:id`, and `PUT /api/admin/lessons/:id`. Updates require the current `version`. To mark a guide reviewed, supply `reviewStatus: "reviewed"`, `reviewConfirmed: true`, `reviewerName`, `reviewerQualification`, and substantive `reviewNotes`. This is the administrator's attestation that review occurred; the software does not verify a professional's credentials or create institutional endorsement. Seed guides are never automatically approved. Editable fields include title, summary, sections, quiz, duration, level and official source links.

Content changes automatically return the guide to draft unless a new explicit review is recorded in the same request. Every edition has an immutable-through-the-API historical snapshot plus reviewer/date/version metadata and an audit event. Review effects are tenant-scoped: public unauthenticated lessons remain original drafts, while signed-in lessons, quizzes, bootstrap data, AI grounding and the organization's USSD channel use its current edition. Completion on an older edition is marked as needing review. Source links must remain on allowlisted official domains. Back up and retain editorial history alongside the main database.

## Public market observations

`GET /api/market-data` requires a signed-in session. It imports the actual [WFP Uganda Food Prices dataset on HDX](https://data.humdata.org/dataset/wfp-food-prices-for-uganda), using the publisher's [CC BY-IGO 3.0 license](https://creativecommons.org/licenses/by/3.0/igo/). Attribution, dataset/download links, license, retrieval time, publisher update time and source checksum accompany the response. No API key or subscription is required by this source.

These are published monthly reference observations, not live prices, executable buyer quotes or guaranteed current market conditions. Collection/publication coverage varies by market and commodity. The most recent period anywhere in the source does not make every series current. The September 2026 implementation check found 34,328 original records, 646 latest series, 43 markets and 38 commodities; some retained series were from 2014. These are observations of that downloaded file, not permanent national coverage claims. The source also includes household non-food commodities; category labels must remain visible.

Optional exact-match filters are `commodity`, `category`, `market`, `priceType`, `unit`, and `currency`; `limit` defaults to 30 and is capped at 100. The opaque cursor is tied to the source checksum; a changed snapshot returns `409 CURSOR_EXPIRED`. Each row preserves original commodity naming, market IDs, geographic fields, units, currency, price type, price flag, observation date and source-provided USD value. No litre/bag/packet-to-kilogram conversion or commodity-name merging is performed. A series is keyed by market ID, commodity ID, unit, price type, price flag and currency, with the latest observation retained independently for each series.

`ageDays` and row `freshness` derive from the observation date: recent up to 62 days, aging through 183 days, then historical. These are application labels, not WFP quality certification. `cacheStatus` describes the download cache separately. A successful download of historical prices does not make those prices recent. Original source fields, row checksums and import history are retained in the database, separately from tenant-entered prices and clearly sample seed records. The public snapshot is not placed into private bootstrap data.

Cold reads wait for the first import within a shared 12-second network deadline. Metadata is capped at 1 MB, CSV at 8 MB, rows at 150,000 and retained series at 10,000. Only fixed HDX URLs are fetched; the CSV may follow one redirect to its exact HDX-owned S3 object. Signed download parameters are transient and never persisted or logged. Unexpected publisher/license identity, schema changes, conflicting same-period values, invalid/future dates and invalid numbers fail closed.

Successful snapshots refresh on demand after 24 hours; existing observations return immediately while a due refresh runs. A durable lease prevents duplicate refreshes across processes. Failures retain the prior snapshot and back off from one minute to one hour, including across restarts. `POST /api/market-data/refresh` accepts `{}` from an administrator with CSRF protection, respects active leases/failure backoff and imposes a one-minute minimum between healthy manual refreshes. Network requests never run under database locks.

A cold import must contain at least 50 series across five markets. Refreshes reject backward source timestamps, a backward latest observation, any retained series moving backward, loss of over 20% of series or loss of over 30% of raw records. The previous snapshot remains available with a source-review notice. Legitimate upstream corrections can therefore require maintainer review; this release has no unchecked administrative override. Same-period price corrections with consistent coverage are allowed and change the source checksum. These checks guard against truncation and rollback, but do not independently verify WFP's underlying survey observations.

## AI

`GET /api/assistant/status` describes configuration and request allowance. `POST /api/assistant` accepts `{question,crop?,district?,consent:true}`. Both require a session; POST requires CSRF. Identifiers are filtered, location context uses a district name, and no farm/contact record is automatically sent. The service does not retain prompts in the application database. OpenAI receives the user's approved question and selected source excerpts, with `store:false`; the provider's applicable data terms still apply.

`AI_DAILY_REQUEST_LIMIT` and `AI_USER_DAILY_REQUEST_LIMIT` constrain a durable UTC daily request budget. The global counter is shared across all tenants and processes using the same database. Reservations are atomic and not refunded after an uncertain provider outcome. These are request limits, not a guaranteed monetary spending cap; set the provider project's own spending controls too.

Provider credentials alone do not mean the AI account is funded or usable. A billing/quota error is surfaced explicitly. Consult `server/ai/` and channel documentation for the exact configured model and limits.

## Private WhatsApp support

`GET /api/whatsapp/connection` is authenticated and exposes only configuration readiness. A `wa.me` link requires the explicit public `WHATSAPP_BUSINESS_NUMBER`, sending and signed-webhook configuration, a matching `CHANNEL_ORGANIZATION_ID`, and non-demo mode. Readiness is not a successful delivery test. No number is supplied by default.

`GET /api/whatsapp/inbox?limit=20&cursor=...` is operator/admin-only, tenant-scoped and cursor-paginated (maximum 50). Messages are not included in bootstrap or offline storage. Incoming text up to Meta's 4096-character limit is accepted; storage retains the first 1600 characters with an explicit truncation flag. Non-text messages retain a placeholder only; media is not fetched. Unknown callers do not automatically become CRM contacts.

`POST /api/whatsapp/inbox/:id/reply` accepts only `{body}` (1–1600 characters) and requires a UUID `Idempotency-Key`. The server resolves the recipient and service window from verified callbacks. A direct support request opens a 24-hour reply window without granting marketing permission. STOP closes support until a later direct question or HELP request; START alone does not reopen it. SMS/USSD consent withdrawal also closes pending WhatsApp support authorization. Phone changes in CRM clear previous-number permission and conversation timestamps.

Reply reservations persist before any provider call and share the existing daily spending/request caps. Same-key retries return the saved record without repeating delivery, even if the window later expires. An in-flight or uncertain reply blocks new replies to that phone across the inbox. Signed delivery receipts can resolve known provider IDs. An uncertain result without a provider ID requires administrator/provider investigation; this release has no automatic or manual reconciliation endpoint and refreshing does not resolve an uncorrelatable send. Provider acceptance is not handset delivery. Database row locks serialize receipt linkage, not network calls.

Incoming and outgoing message text is available for up to 30 days. Read responses hide expired text; inbox activity and callback/reply writes lazily redact expired bodies from the database. Old signed webhook replays cannot renew their text lifetime. This is not a guarantee of physical deletion at exactly 30 days for dormant tenants. Phone numbers, metadata, provider records and backups need separately approved retention and deletion policies. Idempotency records do not duplicate private reply bodies. Do not log message content or copy it into audit records. No AI auto-replies or live sends occur in demo mode.

## Season economics and harvest coordination

`GET/POST /api/seasons`, `GET/POST /api/lots` and `PATCH /api/{seasons|lots}/:id` are tenant- and farm-owner scoped. An operator can assist a farmer, but the resulting record belongs to the farm owner, not the operator. Updates require the current `version`; UUID idempotency keys protect retried writes. Bootstrap includes these records and their derived summaries.

Seasons store user-entered assumptions, planned and actual cost lines, harvested quantity and manual sales/receipt records. Server summaries distinguish missing actual costs (`null`) from zero. Dates, quantities, unique line references, receipt-versus-sale values and bounded whole-UGX totals are validated. A season's recorded harvest cannot fall below its linked lots. Cash estimates are not comprehensive profit or verified payments; a season's sales ledger does not automatically reconcile separate physical lots.

Lots have generated traceability codes, optional season linkage, recorded measurement methods and explicit internal quality review. Actual harvest dates follow the Uganda calendar (`Africa/Kampala`), while audit timestamps remain UTC. Farmers cannot approve their own quality status. Material lot changes invalidate prior review unless an operator explicitly records a new review. Internal acceptance does not certify food safety, grade or export eligibility.

`GET/POST /api/collections` and `PATCH /api/collections/:id` are operator/admin-only. Collections begin in planning, reserve whole accepted matching-crop lots transactionally and require the target quantity before confirmation. A unique database allocation and ordered row locks prevent concurrent double commitment. Confirmed commercial terms and lot selection are protected; cancellation releases lots, dispatch permanently locks them, and both states are final. Historical manifests retain quantities, contributors and review metadata. Farmer lot responses expose allocation ID/status only, never buyer details or other farmers' records.

Demo seed additions are idempotent and clearly sample. They do not overwrite existing records, reverse a cancelled collection or imply real laboratory inspection. See [the research, assumptions and limits](../docs/uganda-value-workflows.md). Database contention behavior must also be tested on the selected managed PostgreSQL deployment; local PGlite serializes transactions.

## Operational logging and health

The server writes one JSON line per API request (`time`, `level`, `event`, `requestId`, `method`, `path`, `status`, `durationMs`) to standard output, and server errors to standard error. Paths have record identifiers masked and query strings removed, because weather requests carry coordinates. Logs never include request or response bodies, cookies, phone numbers, AI text or error messages; an unexpected error records only its class, code and stack frames.

Every response carries an `X-Request-Id`, and a `500` response includes the same `requestId` in its body so support staff can find the matching log entry. An inbound `X-Request-Id` is reused only with `TRUST_PROXY=1`, so the ingress can correlate its own logs.

`GET /api/health` reports that the process is running. `GET /api/health/ready` also checks that the database answers within two seconds and returns `503` otherwise; point load-balancer readiness checks at it.

## Production setup and release limits

The server refuses production startup with demo enabled, without a PostgreSQL `DATABASE_URL`, or without HTTPS `PUBLIC_ORIGIN`. Production database connections always require TLS with certificate verification; a URL that explicitly disables verification is rejected. Set `DATABASE_CA_CERT` to the provider's PEM certificate if its CA is not in the system trust store. `DATABASE_TLS=true` enables the same transport in development. Set `HOST` for the hosting environment; use `TRUST_PROXY=1` only behind one trusted reverse proxy. Configure encrypted storage, restricted network access and a minimally privileged runtime database user. Run `npm run db:migrate:production` as a controlled deployment step with schema-change credentials, then start replicas with `DATABASE_MIGRATIONS=verify`.

Production scale also requires shared/distributed rate limiting (current limiter is process-local), database pool sizing, retention jobs for expired sessions/idempotency/callback records, reviewed content and translations, verified weather licensing, consent and privacy policies, provisioned telecom senders/shortcodes, recipient allowlists during staging, operational staff and a load/restore drill. There is no payment settlement or customs clearance implementation; trade records track readiness and coordination.

`npm run test:server` covers authenticated behavior, tenant separation, role restrictions, CSRF/origin controls, idempotency, stale-write rejection, partial-update preservation, forced password changes, session revocation, lesson review, quiz grading, channel signatures/deduplication, AI budget races, season calculations, lot allocation/quality/final-state safeguards on-disk restart persistence, and schema migrations (legacy upgrade without value loss, refusal of unmapped or malformed legacy data, cross-organization foreign keys, checksum and version guards, concurrent startup, and registry-versus-schema drift). A USSD regression verifies weather-provider I/O is outside database transactions. Most tests run on PGlite. Set `TEST_DATABASE_URL` to a PostgreSQL server (a role that can create databases) to run the migration tests on real concurrent connections, as CI does with PostgreSQL 17. Still validate the remaining integration scenarios against the chosen managed PostgreSQL service before release.
