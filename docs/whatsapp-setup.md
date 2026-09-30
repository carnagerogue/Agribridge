# Connect Agribridge to WhatsApp

Status: local integration, not an activated business number. No production WhatsApp account or phone number has been provisioned by this project. The demo cannot send messages, even when credentials exist.

## What the farmer experiences

1. Open **Connection & settings → Support on WhatsApp**. A real chat link appears only after the server has the complete, tenant-matched configuration and is outside demo mode.
2. Open WhatsApp and send a short question. The link does not send automatically, pre-fill private data, or authenticate the farmer's Agribridge account.
3. Cooperative staff read incoming text in **Messages → WhatsApp inbox** and send a support reply during the allowed conversation window.
4. Ongoing alerts require separate permission. An incoming question or START command does not silently subscribe the sender.

The support inbox is online-only. Photos and voice notes are flagged, not downloaded, transcribed or diagnosed. Staff must use an authorized provider inbox capable of handling media; such an inbox is not supplied by this integration. WhatsApp still requires mobile data or Wi-Fi. SMS, USSD, offline app access and in-person support remain important alternatives.

Incoming and reply text is visible for up to 30 days. Expired bodies are hidden at reads and redacted from the active database during inbox reads and channel writes. This is lazy redaction, not a guarantee of physical deletion at the exact expiry time. Phone numbers, routing metadata, event references and audit evidence remain; provider copies and backups follow separate policies. Before collecting real conversations, configure scheduled retention maintenance and reviewed policies for these additional records and backups.

## Owner's setup checklist

### 1. Obtain a dedicated business number

Use a number controlled by Agribridge's operating organization, with a named owner and a recovery process. Prefer a dedicated Uganda number for the pilot. Confirm it can complete Meta's phone ownership verification. Do not move or deregister a personal or existing business number without reviewing the applicable migration/coexistence options.

### 2. Create the Meta business assets

Prepare a Meta business portfolio, WhatsApp Business Account and registered business phone number. Follow the current WhatsApp Cloud API onboarding in Meta's dashboard, including the account's verification, display-name, billing and two-step verification requirements. Use a production system-user token with the required messaging permissions, not a temporary getting-started token. [Meta's official Cloud API setup reference](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api)

Account creation, number registration, billing acceptance and credential creation are owner actions. This repository does not perform them automatically. Meta dashboard labels and eligibility can change; follow the account's current instructions.

### 3. Prepare a non-demo HTTPS deployment

Complete the [deployment runbook](deployment.md). The real service needs `NODE_ENV=production`, `AGRIBRIDGE_DEMO=false`, an exact HTTPS `PUBLIC_ORIGIN` and certificate-verified PostgreSQL. Do not expose the localhost demo or seed identities publicly. `localhost:5180` is not a webhook address Meta can reach.

### 4. Add server-side configuration

Use the hosting secret manager. Never paste tokens into chat, source code, screenshots, farmer profiles, or `VITE_` variables. Use [.env.example](../.env.example) as a names-only reference.

| Variable                          | Value to provide                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `CHANNEL_ORGANIZATION_ID`         | The real Agribridge tenant provisioned for this business account                    |
| `WHATSAPP_BUSINESS_NUMBER`        | Public business number in international form, including `+`; not the Meta number ID |
| `WHATSAPP_PHONE_NUMBER_ID`        | Meta's sending phone-number ID                                                      |
| `WHATSAPP_ACCESS_TOKEN`           | Restricted production access token                                                  |
| `WHATSAPP_API_VERSION`            | A currently supported Graph API version selected for the app                        |
| `WHATSAPP_APP_SECRET`             | Meta app secret, used to validate webhook signatures                                |
| `WHATSAPP_VERIFY_TOKEN`           | A separate, strong random verification value, also entered in Meta's webhook setup  |
| `MESSAGING_DAILY_LIMIT`           | Global daily message-request ceiling                                                |
| `MESSAGING_TENANT_DAILY_LIMIT`    | Daily ceiling for the cooperative                                                   |
| `MESSAGING_RECIPIENT_DAILY_LIMIT` | Daily ceiling per recipient                                                         |

This pilot routes one provider account to one tenant. Multi-cooperative ownership of separate WhatsApp numbers requires explicit routing and onboarding work; do not reuse one tenant's credentials for another.

### 5. Subscribe the webhook

Configure the public callback as `https://YOUR-DEPLOYED-ORIGIN/api/channels/whatsapp`, replacing the placeholder with the actual HTTPS origin. Use the same verify token as the server and subscribe the WhatsApp Business Account to the app's message events. Preserve the request body exactly: signature verification uses the raw bytes. Support both verification GET and signed POST requests. Monitor rejected signatures, provider retries and persistence failures; never log raw request bodies or authorization headers.

### 6. Publish the service's privacy and support information

Explain who handles messages, what is retained, third-party processing, support hours, opt-out and how to request help from a person. Do not request payment PINs, identity documents, passwords or patient details. A shared phone number is not proof of account ownership. These are launch requirements, not a claim of regulatory certification.

Free-text replies must stay inside the customer-service window, which resets with each user message. Outside that window, approved templates are required. Keep alert consent separate from requested support; honor STOP. Any later AI automation must be disclosed and offer human escalation. [Meta's current business messaging policy](https://whatsappbusiness.com/policy/)

### 7. Run a consented end-to-end test

Use a staff-controlled test phone; obtain permission before sending.

- Send a text question to the business number. Verify one inbox item appears.
- Replay the same signed event in a controlled integration test. Confirm no duplicate item or follow-up task.
- Reply once. Check provider acceptance, then an actual delivery receipt. Acceptance alone is not delivery.
- Send STOP. Confirm new replies are blocked until a later direct request, and ongoing alert permission stays withdrawn.
- Verify expired-window replies cannot be sent as free text. The current inbox does not compose approved templates.
- Send a voice note or image. Verify a clear media-review notice, with no claim that Agribridge downloaded or understood it.
- Verify a farmer account and another cooperative cannot read the inbox.
- Test a provider timeout. Reconcile uncertain delivery before composing another reply; do not automatically resend.
- Confirm the published business number, support hours, real device performance and process for removing retained data.

Only call the channel live after the real test passes. **Setup configured** in the app means configuration exists, not that Meta has accepted a message.

An unresolved send blocks additional support replies to that phone, including replies from another staff member or another incoming question. Retrying the original key reads or completes that same request; it does not resend a saved provider attempt. If a timeout leaves no provider ID, a refresh cannot prove the result. Escalate to the technical operator for provider-record reconciliation. An audited in-app reconciliation workflow is still needed before broad rollout; do not bypass this safeguard by starting a new reply or manually clearing database state without an approved incident procedure.

## Costs and AI

Budget for data, hosting, staff and any provider messaging fees. Meta's charges depend on message category and recipient market; inspect the live account rate card before activation. Do not assume permanently free delivery. [Meta pricing](https://whatsappbusiness.com/products/platform-pricing/)

The OpenAI credit is separate from WhatsApp. Incoming WhatsApp messages do not currently trigger paid AI calls or autonomous replies. Next phase can add a clearly consented, bounded agriculture assistant with human escalation after the basic channel and privacy process have been tested.

Reference check: 28 September 2026. Some developer pages require login or return rate limits; account-specific approvals and current pricing must be checked in the provisioned Meta account.
