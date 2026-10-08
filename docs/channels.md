# Low-connectivity channels

Agribridge supports a text-first web app, SMS, WhatsApp Cloud API and short USSD menus. None of these can deliver through a total loss of cellular coverage; offline lessons and queued app changes cover that gap after the first online load. Voice callbacks are support work items, not connected automated calls.

## Configuration

Credentials belong in the server environment or a secret manager. Never prefix them with `VITE_`, expose them in readiness responses, log request bodies, or put them in a public callback URL.

| Setting | Purpose |
| --- | --- |
| `CHANNEL_ORGANIZATION_ID` | The one tenant authorized to receive events from these provider accounts. Configure separate accounts/routes for separate tenants. |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | Africa's Talking account credentials and provisioned sender/shortcode. |
| `AT_ENVIRONMENT` | Must explicitly be `sandbox` or `production`. No automatic production fallback. |
| `SMS_MAX_SEGMENTS` | Hard per-message ceiling; defaults to 3 and accepts 1–6. GSM extension and Unicode messages consume different units. |
| `AT_WEBHOOK_SECRET` | At least 32 random characters injected by an authenticated callback gateway. |
| `AT_USSD_SERVICE_CODE` | Exact carrier-provisioned service code. No invented dial code is shown as active. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta system-user token and configured sending number ID. |
| `WHATSAPP_BUSINESS_NUMBER` | Public business phone number in `+` international format; separate from the Meta ID. Required for the farmer chat link and support replies. |
| `WHATSAPP_API_VERSION` | An explicitly provisioned supported version, for example the version assigned in the Meta app dashboard. |
| `WHATSAPP_APP_SECRET` | HMAC secret used to verify exact raw webhook bytes. |
| `WHATSAPP_VERIFY_TOKEN` | Separate random value for the subscription challenge. |

`getChannelReadiness()` reports credentials present as `configured`; this does not claim carrier provisioning, funding or a successful delivery test. Missing configuration produces `not_configured` without making a network request.

## Mounting and authentication

Mount `createChannelRouter()` at `/api/channels` **before** a global JSON parser. `POST /whatsapp` needs the unmodified raw JSON bytes for Meta's `X-Hub-Signature-256` HMAC. The router checks the configured phone-number ID, validates bounded batches before applying effects, and responds 503 if persistence fails. `GET /whatsapp` implements Meta's verify-token challenge.

Africa's Talking routes accept URL-encoded callbacks:

- `POST /sms`: `id`, `from`, `text`, `date`.
- `POST /sms/delivery`: `id`, `status`.
- `POST /ussd`: `sessionId`, `phoneNumber`, `serviceCode`, `text`.

These routes require `X-Webhook-Secret`; an unauthenticated public provider callback cannot be wired directly to them. Use a gateway configured with provider-supported authentication and/or verified provider network restrictions, strip untrusted incoming copies of the header, then inject the secret. Restrict direct access to the application callback origin. Test the exact provider/gateway arrangement before launch. A header proves possession of the configured secret, not inherent carrier identity. Do not weaken these endpoints to unauthenticated mode if the provider cannot add headers.

## Persistence and consent contract

`ChannelHandlers` are implemented by the host backend. Each handler must record `(tenant, provider, eventId)` and its effects in the same database transaction. A retry must do nothing twice; a repeated USSD request must return its previously persisted response. Retain event IDs for at least the provider retry and incident-review period; otherwise an old signed callback may be processed again. Order inbound consent changes by event time to prevent old STOP/START retries from overwriting a newer decision.

- `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` withdraw consent. A STOP request must not depend on existing marketing consent.
- `HELP`/`MENU` creates a support request with the available short commands. Reply delivery must still use the real outbound adapter.
- `START`/`SUBSCRIBE` identifies an opt-in request. The host must record consent evidence and disclosure before enabling ongoing messages; receiving an arbitrary message does not establish marketing consent.
- USSD menu 4 asks consent for **one support callback**. It does not grant marketing consent.
- USSD menu 5 withdraws both SMS and WhatsApp alerts.
- Bare phone lookup must never expose farm details, exact coordinates, financial records or health records; a shared handset is not an authenticated user session.

The USSD module is browser-safe and can power a clearly labelled menu preview. Initial districts are a pilot set, not nationwide coverage. Information services must return dated, sourced public information; unreviewed lessons and missing forecasts are reported unavailable.

## Sending and delivery truth

Proactive messages must verify tenant ownership and persisted channel consent, reserve a message row and idempotency key, enforce spending/frequency limits, and then call `sendOutbound()`. WhatsApp support replies use the separate authenticated inbox flow below. WhatsApp free text requires a trusted inbound timestamp within the preceding 24 hours; otherwise an approved template is required. The transport adapter supports templates, but the application inbox does not yet compose or submit them. Templates must be approved in Meta; passing a name to an adapter does not approve it.

Provider acceptance means `sent` or `queued`. Only a delivery callback can mark `delivered`. A late `sent`/`queued` event must not downgrade `delivered`. Unknown providers or missing credentials never become `delivered`. A timeout may occur after the provider accepted a message, so ambiguous results carry `deliveryUncertain: true` and do not automatically retry. Neither provider is assumed to deduplicate our request key. Operators must reconcile uncertain sends before trying again.

Requests use fixed HTTPS provider endpoints, no redirects, an eight-second timeout, bounded responses and sanitized errors. Callback ingress has a separate ceiling of 600 requests/minute/IP before body parsing; this is a per-process control. A national deployment needs a shared gateway limiter and a provider-specific burst capacity based on load testing. No real messages are sent by tests. Run `npx tsx --test server/channels/channels.test.ts`.

## Account security messages

Password reset codes are transactional messages sent only when the account holder requests one for their own number. They do not depend on, or grant, marketing permission, and STOP does not block them. Each request counts against the same daily messaging caps (global, organization and recipient), and a number receives at most three codes an hour. The message text is never stored; only a hash of the code is kept, for ten minutes.

## WhatsApp support inbox

See [activation from zero](whatsapp-setup.md) for owner-facing setup and live acceptance tests.

- `GET /api/whatsapp/connection`: authenticated connection status, safe checklist and public click-to-chat link. A link is returned only for the configured tenant outside demo mode with complete setup. No token or app secret is returned. Configuration is not proof of delivery.
- `GET /api/whatsapp/inbox?limit=20&cursor=…`: tenant-scoped operator/admin inbox with stable cursor pagination. Text, sender, optional CRM match, message time, reply eligibility and recent reply outcomes are returned only here, never in bootstrap/offline snapshots.
- `POST /api/whatsapp/inbox/:id/reply`: operator/admin free-text support reply with `{body}` and a UUID `Idempotency-Key`. Recipient and service-window timestamps come from verified incoming events, never request input. Requires CSRF, tenant scope, open service window, configured channel and available message budget.

Unknown senders can request help without being automatically created as CRM contacts. A phone match does not authenticate a farm account. A requested support answer does not grant permission for ongoing alerts. STOP blocks replies until a later direct support request; a later question does not restore marketing permission. START is routed for consent review, not automatic enrolment.

Signed inbound callbacks are deduplicated transactionally. Non-text messages show an unsupported-media notice: media content and URLs are not fetched or sent to OpenAI. All autonomous WhatsApp AI is off. A durable outgoing reservation is never automatically resent after a crash or ambiguous provider response. Operator reconciliation remains necessary.

Message bodies expire from API visibility after 30 days. Active-database bodies are lazily redacted during relevant reads/writes; identifiers, phone numbers, routing metadata and provider/backups have separate retention obligations. This is not exact-time deletion or regulatory certification. Before real data collection, add scheduled maintenance and reviewed retention procedures covering those other stores.

## Provider references

- [Africa's Talking SMS endpoints](https://africastalkingltd.gitbooks.io/mobile-communication-apis/content/downloads.html)
- [Africa's Talking acceptance versus delivery status](https://help.africastalking.com/en/articles/742491-why-did-my-messages-fail)
- [Africa's Talking Uganda USSD provisioning](https://help.africastalking.com/en/articles/8167020-ussd-uganda)
- [Meta webhook verification reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) — archived official SDK documentation; current Meta account setup must also be verified.
- [Meta Cloud API setup reference](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)
- [WhatsApp business messaging policy](https://whatsappbusiness.com/policy/)
- [WhatsApp click-to-chat instructions](https://faq.whatsapp.com/5913398998672934)

Some Meta developer pages returned rate-limit errors during research. Meta's public business policy and official Cloud API collection were checked on 28 September 2026. No permanently free service is promised. Carrier sender approvals, Uganda shortcode allocation, commercial fees and callback identity verification remain deployment tasks.
