# Market workspace: implementation and activation

The market workspace is available at `/marketplace` for signed-in community members and cooperative staff. It uses the existing React/Express application and PostgreSQL/PGlite database. It is a working community-market workflow, not an activated public payment or telecom service.

## What is implemented

- Business profiles with name, business name, phone, district/community, crops, optional acreage and English/Luganda preference. A profile phone is explicitly self-declared, not proof of account or payment ownership.
- Produce declarations with variety, kilograms, asking price or quote request, location, grade notes and harvest/availability window. Owners can pause listings and revise uncommitted terms.
- Organization-entered buyer requests with quantities, variety, quality requirements, location and buying window. Explainable matches compare recorded supply and demand; quality/logistics/final-price checks remain visible. Matches cover the records loaded, not an exhaustive national buyer search.
- Durable broker introduction requests with duplicate prevention and staff acknowledgement/closure.
- Dated input, transport and storage quotes with provider, unit, source URL/title, observation date, validity and verification status. Reported, expired and sample records are distinguished.
- A market desk that retrieves source facts for prices, weather, input costs, logistics and recorded demand. It does not generate prices or buyers. An explicit question's crop/location takes precedence over saved profile defaults; a fertilizer question cannot be answered using a seed quote.
- A sanitized, authenticated community supply catalog and single-seller order requests. Seller/staff acceptance snapshots terms and reserves declared quantity atomically. Fulfillment consumes it; eligible cancellation releases it. Existing whole-lot harvest commitments are not silently repurposed as these new declarations.
- Trusted payment-event processing with amount/currency/payer/seller/order checks, transaction/event deduplication, refund history and approval/confirmation messages. No endpoint initiates a charge or collects client funds.
- Verified WhatsApp account linking with expiring hash-only codes, separate payment-notification consent, durable notification processing, template/window enforcement, spending limits and delivery reconciliation.
- Optional WhatsApp guided registration and produce intake, source-information commands, staff handover and STOP. Confirmed channel profiles/inquiries are visible to authorized staff under Orders & updates. They do not silently claim an application login or become public seller listings.

Profiles, offers, orders, messages and intake remain organization-scoped. Cross-organization public storefronts, open client onboarding and global fulfillment are separate extensions; current publication does not expose private profile phones, exact household details or financial records.

## Local development and checks

Use the existing isolated checkout; do not create a Git worktree unless requested.

```sh
cd /workspace/Agribridge
npm ci
PUBLIC_ORIGIN=http://localhost:5180 AGRIBRIDGE_DEMO=true npm run dev
```

The API defaults to origin `http://localhost:5180`, matching Vite. PGlite persists under the ignored `.data` directory. Startup applies numbered migrations 1–6; never edit a migration already applied to a retained database. Demo seeds are idempotent and clearly marked sample; fictional buyers/quotes are not production data or evidence of actual demand.

```sh
npm run typecheck
npm run build:server
npm run build
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

The market browser journeys cover saved produce/harvest details, source-backed questions, and requesting/accepting/cancelling an order without claiming a payment. API tests cover scopes, ownership, replay/version conflicts, stock commitments, stale/item-specific information, signed callback wiring, signup confirmation, STOP, worker restart/concurrency, account linking and payment receipts.

## WhatsApp operation

First activate a real number and non-demo HTTPS deployment as described in [WhatsApp setup](whatsapp-setup.md). Keep all credentials server-side. Default feature flags are off.

| Setting                                     | Purpose                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `MARKET_WHATSAPP_ENABLED=true`              | Enables durable guided market conversations.                                                                                                   |
| `CHANNEL_ORGANIZATION_ID`                   | Required organization scope for both conversation and notification workers. Work from another organization is never claimed using this number. |
| `MARKET_LUGANDA_REVIEWED=true`              | Enables the prepared Luganda text path only after native-speaker review; otherwise it hands over to a person. It does not activate speech.     |
| `MARKET_PAYMENT_NOTIFICATIONS_ENABLED=true` | Enables delivery of payment-event notifications after linking, consent and configuration checks.                                               |
| Existing WhatsApp credentials               | Enable authenticated provider sending/callbacks; configuration is not delivery verification.                                                   |

The server starts a bounded five-second worker pulse only when a market worker flag is enabled. Jobs survive process restarts. Provider I/O occurs outside database transactions. Leases serialize workers, and unresolved sends require receipt reconciliation rather than automatic resend. Fresh staff replies pause pending automation; the caller can explicitly resume it.

Suggested English commands: `REGISTER`, `SELL`, `BUYERS maize`, `PRICES beans Jinja`, `INPUTS seed Nakaseke`, `TRANSPORT Nakaseke`, `STORAGE Nakaseke`, `WEATHER Jinja`, `HUMAN`, `STOP` and `RESUME`. Registration and supply intake ask for explicit confirmation of a version-bound summary before saving. Replying to a question does not subscribe a farmer to alerts.

The existing default per-recipient ceiling is five message attempts per day, which is too small for a full registration plus produce-intake conversation. A supervised pilot can deliberately set `MESSAGING_RECIPIENT_DAILY_LIMIT=20`, within the application's hard ceiling, with corresponding global/organization budgets. This code does not raise paid-message limits automatically.

Voice notes and pictures still require a person using an authorized provider inbox. The app does not download/understand media or synthesize English/Luganda speech. A fully spoken signup/question/confirmation journey remains pending speech-provider integration, recorded test material and native-speaker evaluation. Do not advertise automated bilingual voice based on the text menus.

## Direct client-to-seller payments

The confirmed commercial model is direct payment from client to seller through an integrated provider. No provider has yet been selected/configured by this work; checkout therefore remains disabled and the UI explains that order requests do not collect money.

An actual provider adapter must verify provider signatures and/or transaction lookup, seller onboarding/destination, amount, currency and order references, then call `recordVerifiedMarketPayment`. Its schema distinguishes `authorized`, `succeeded`, `failed` and `refunded`. Approval is not transfer confirmation. A fulfilled order, manual season receipt, redirect URL, screenshot or delivered WhatsApp message cannot establish payment.

An optional **trusted integrator gateway protocol** is implemented at `POST /api/marketplace/payments/events`. It is not a ready-made payment-provider integration. It stays disabled unless `MARKET_PAYMENT_EVENTS_ENABLED=true`, `MARKET_PAYMENT_PROVIDER` names the selected adapter and a sufficiently strong `MARKET_PAYMENT_WEBHOOK_SECRET` is injected securely. The gateway must authenticate/reconcile the real provider itself. The timestamp header and raw-body signature contract are documented in `server/market-payments.ts`; never weaken it to accept browser-authored success events.

Payment notifications require a separately linked account and explicit permission. Linking uses the authenticated web account to issue a short-lived `LINK ...` command; only a verified incoming WhatsApp callback can consume it. Raw codes are not retained in inbox, job or idempotency records. Linking never creates an application session or grants cooperative roles. Number changes, account suspension, consent withdrawal and STOP are checked before sending.

For messages outside the service window, configure real approved templates using these names, with `_EN` and/or `_LG` suffixes:

- `MARKET_PAYMENT_TEMPLATE_APPROVED_EN`
- `MARKET_PAYMENT_TEMPLATE_CONFIRMED_EN`
- `MARKET_PAYMENT_TEMPLATE_FAILED_EN`
- `MARKET_PAYMENT_TEMPLATE_REFUNDED_EN`

Optional `MARKET_PAYMENT_TEMPLATE_LANGUAGE_EN`/`_LG` specify the account's approved language code. Template body parameters are amount in UGX, order ID and payment provider, in that order. Luganda notifications require a reviewed configured template even during an open conversation; the server does not invent a translation. A template does not reopen a closed customer-service window; the farmer must reply before free-form follow-up.

Delivery status remains separate from financial status. Unknown send outcomes are not automatically retried. Verified receipts and durable reconciliation resolve known provider IDs; an uncertain send without a provider ID requires operator/provider investigation.

## Information quality and sources

WFP is a monthly reference source with uneven market/commodity coverage, not current nationwide farm-gate pricing. Preserve original observation dates, units and retail/wholesale distinctions. See [market-data limitations](market-data.md).

Weather uses explicitly mapped district/model-grid forecasts and separate official warnings. Missing data is unavailable, never an all-clear. No hail alert is inferred from rainfall or temperature.

Input and logistics information currently comes from operator-entered sourced quotes. A web link is provenance, not proof that a quote is current or a supplier is available. The system does not scrape arbitrary websites, bypass provider access controls or invent prices. Automated acquisition should be added source by source after confirming permitted access, licensing, coverage, units, freshness and refresh/error rules. Existing network restrictions may need approved source domains added in environment settings.

Remaining activation work includes actual organizations and current listings, direct-settlement provider choice, seller verification, approved templates, production credentials/domain, reviewed Luganda content, media/speech support, and consented end-to-end delivery tests. Automated price/weather subscriptions and a public multi-organization storefront are still planned; the payment notification service does not imply those schedulers exist.
