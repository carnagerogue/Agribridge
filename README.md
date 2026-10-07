# Agribridge

A Uganda-first agricultural workspace for farmers, cooperatives and extension teams. Built around short, useful information, shared operational records and unreliable connectivity.

## What works

- **Farm operations:** farm profiles, crop stages, dated tasks and conflict-aware updates.
- **Season planning:** household harvest reserves, user-entered costs, break-even estimates, a downside scenario, actual expenditure and sale/receipt records. Cash estimates are not guaranteed profit or verified payments.
- **Harvest coordination:** farm-linked lots, recorded quality reviews, buyer collections, atomic whole-lot allocation and historical manifests. Internal acceptance is not certification.
- **Markets and trade:** real WFP/HDX monthly market observations with per-series dates, original units and retail/wholesale distinctions; separate cooperative price records, produce offers, buyer opportunities and export-readiness checklists. Public observations are references, not live quotes. No payment settlement or customs clearance is claimed.
- **CRM:** contacts, permission by messaging channel, follow-ups and support work queues.
- **Learning:** curated links to existing FAO resources, plus separate short field guides, quizzes, progress and administrator editing/review history. Initial local guides are clearly marked drafts awaiting qualified agronomist review.
- **Weather:** dated Open-Meteo model forecasts and a separate official Uganda MWE warning feed. Missing weather is shown as unavailable.
- **Community observations:** crop concerns and standing-water reports with operator review. No patient records or automatic malaria/crop diagnosis.
- **Low-connectivity access:** an installable web app, explicitly enabled offline farm/learning storage, queued supported edits, conflict handling, and a USSD menu preview. First load and synchronization still need internet.
- **SMS and WhatsApp:** real provider adapters, authenticated callbacks, consent withdrawal and delivery receipts. WhatsApp adds a staff-only support inbox, bounded free-text replies, and a farmer-facing business connection panel. Sender accounts/shortcodes must be provisioned; no autonomous WhatsApp AI replies are active.
- **Farm assistant:** consented, source-grounded OpenAI answers with request budgets and safety referrals. Production requires reviewed guidance; demo answers label draft sources.

## Finding your way

The public introduction is at `/welcome`, also shown at `/` when signed out. Sign in at `/login`. The workspace has five primary destinations: **Home, Farms, Weather, Prices and Learn**. Season planning, harvest and other specialist features remain under **More tools**; authorized staff also get **Cooperative tools**. Home offers a single next task and short paths into the main activities.

Learn starts with **Soil & water**, **Protect crops** and **Harvest & storage**, linking to FAO's own website rather than copying its courses. Courses require a free FAO account and a connection; mobile data charges may apply, and a larger screen is recommended. The listed course downloads are for Windows computers, not offline phone lessons. A separate public fall-armyworm PDF needs no account, is about 7.2 MB and dates from 2018; it is a training reference, not current diagnostic or pesticide advice. External actions are disabled while Agribridge is offline. The **Short field guides** view retains Agribridge's local guides and progress. No FAO partnership, endorsement or course-completion synchronization is claimed.

This release is **English-first**; locally reviewed translations and field testing remain launch work. A public GitHub repository makes the source available—it does **not** publish a hosted, live application. Hosting, production accounts and provider activation must be completed separately.

## Local demo

Requires Node.js 22+ and npm. A local PGlite database persists under `.data/agribridge`; Docker is unnecessary for the demo.

```sh
npm ci
```

In terminal 1, start the API with explicit local demo access:

```sh
npx cross-env AGRIBRIDGE_DEMO=true PUBLIC_ORIGIN=http://localhost:5180 npm run api:watch
```

In terminal 2, start the web app on the matching origin:

```sh
npm run web -- --port 5180 --strictPort
```

Open [http://localhost:5180](http://localhost:5180) for the introduction, then [the sign-in page](http://localhost:5180/login) to choose farmer, operator or administrator demo access. Operational demo records are labelled sample and separated from the real WFP published observations. Demo mode disables outgoing SMS/WhatsApp delivery even if credentials exist. It can still call configured weather and AI providers, so AI usage may incur charges.

The development and preview servers use strict port **5180**. The convenience `npm run demo` command uses that same port; keep `PUBLIC_ORIGIN=http://localhost:5180` aligned with the browser URL. Production rejects demo mode and requires real administrator-provisioned identities.

To test offline reopening, run `npm run build`, stop the development web server, then run `npm run preview`. Enable saved device access in Connection & settings while connected. Only use a trusted device: browser storage is not encrypted. Private notes, customer contacts, financial records and harvest manifests are excluded from offline browsing. Lock workspace hides the interface while preserving unsynced work; reopening a locked workspace requires a connection and explicit sign-in.

## Credentials and configuration

Use [.env.example](.env.example) as a reference for an ignored local `.env` file, or inject server variables through your secret manager. Do not commit a real key, paste it into source code, put it in a URL, or prefix it with `VITE_`.

For the optional assistant, set `OPENAI_API_KEY`, `AI_DAILY_REQUEST_LIMIT` and `AI_USER_DAILY_REQUEST_LIMIT` server-side. Never put the key in a browser form or command argument. Restart the API after changing its environment. Missing credentials produce an unavailable state; insufficient provider credit is reported explicitly. The application sends only the current consented question and bounded references, without adding contact records or farm coordinates. Users must still omit personal information from their questions.

Provider connectivity and an authenticated browser assistant answer have been verified with `gpt-6-luna`. The tested answer used draft-qualified guidance and source links. This is functional verification, not an agronomic quality certification. See [AI configuration, pricing and safeguards](docs/ai.md).

SMS/WhatsApp require funded provider accounts and sender approval. USSD requires a provisioned Uganda service code and authenticated callback gateway. These services are not permanently free. [Channel configuration](docs/channels.md) explains verification, delivery states, consent and limits.

No dedicated WhatsApp number yet? Start with the [WhatsApp activation checklist](docs/whatsapp-setup.md). The demo inbox uses labelled sample questions and cannot deliver to a real phone.

Public WFP market observations need no API key. The server validates and caches the fixed HDX source, preserves the last successful snapshot during upstream failures, and refreshes due snapshots when accessed. Observation dates—not download dates—determine price age. Coverage varies substantially: a recently published file does not mean every market has recent prices. See [market sources, licensing and daily-price launch gates](docs/market-data.md).

## Check and build

```sh
npm run typecheck
npm run build:server
npm run build
npm test
npm run test:e2e
npm audit --audit-level=high
```

Tests use mocked external providers and local databases; they do not send real messages or require an OpenAI key. CI runs the same checks without deployment secrets or automatic production deployment.

`npm run test:e2e` builds the web app and drives the main farmer and cooperative journeys in Chromium on a low-end Android profile (360×640) with a constrained 3G connection and a 4× slower CPU. It covers the public introduction's download budget (250 KB on a first visit), completing a task, an offline change syncing on reconnect, reopening a saved workspace with no connection, dated forecasts, dated public prices and role-restricted navigation. The test server answers weather, warning and price requests with fixed fictional data and refuses any other outbound request. Install the browser once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium.

Built text assets ship with Brotli and gzip copies. The server sends the smallest copy the browser accepts and lets browsers keep content-hashed assets for a year.

The compiled application runs with `npm start`. Production additionally requires `NODE_ENV=production`, `AGRIBRIDGE_DEMO=false`, certificate-verified PostgreSQL and an exact HTTPS `PUBLIC_ORIGIN`. The [deployment runbook](docs/deployment.md) covers the nonroot Docker image, TLS PostgreSQL Compose stack, administrator provisioning, backup/restore and release checks. Container startup still needs verification on a Docker-capable deployment host.

## Before a public launch

This repository is a working product and deployment foundation. A national rollout still needs reviewed crop content and translations, testing with Ugandan farmers on low-end phones, approved telecom services, licensed weather access, trained support teams, realistic load testing, backup restoration drills and monitored infrastructure. Connectivity is not guaranteed: SMS, USSD and WhatsApp all require an available network at delivery time.

Password recovery, administrator MFA, shared rate limiting across replicas and operational privacy/security governance remain launch work. The application is **not SOC 2 certified**; code controls do not establish certification. Review Uganda data-protection obligations, retention, access approval, incident response and provider processing terms before collecting real customer information.

More detail: [API and security](server/README.md), [Uganda access research](docs/access-research.md), [season and harvest research](docs/uganda-value-workflows.md), [deployment](docs/deployment.md), [channels](docs/channels.md), [AI](docs/ai.md).
