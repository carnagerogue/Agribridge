# Agribridge marketplace and WhatsApp farmer service

Status: proposed product and implementation specification. This document adds no running marketplace, voice service, payment integration, or automatic messaging.

Implementation update: a community market workspace, guided WhatsApp intake, order/payment event records and verified notification delivery have since been added. See [implemented capabilities and activation requirements](market-workspace.md). The broader public storefront, automated speech and provider activation below remain a roadmap; do not infer completion from this specification.

Baseline reviewed: repository commit `485035ae39e8fa03659b6533de4899dfefcab8ff`.

## 1. Confirmed direction

Agribridge is a broker connecting farmers and cooperatives with clients. Farmers/co-ops are the sellers; clients place orders through the platform. Agribridge helps discovery, communication, quality review and transaction coordination. This does not assume Agribridge purchases the produce, owns inventory, holds client funds, operates escrow, or provides delivery itself.

WhatsApp is the immediate farmer access channel. The web platform will also provide an image-led marketplace, with a familiar browse, select, order and track experience. The existing farm/cooperative workspace remains the operational foundation.

The first voice pilot must support **English and Luganda**, including spoken replies and confirmations. English-only transcription does not satisfy this requirement.

**Clients pay sellers directly through an integrated payment provider.** Agribridge records the order and payment status but does not hold the purchase funds or later disburse them to farmers. Provider selection must preserve this direct settlement model.

The farmer should be able to ask general agricultural questions without registering. Registration is needed to manage a seller business, publish supply, view private orders and receive personalized updates.

### Inputs still to settle

- The payment provider and its supported Uganda payment methods, seller onboarding/verification, direct settlement, refund process and webhook capabilities. Do not substitute a platform-held balance or escrow for the confirmed direct-to-seller model.
- Agribridge's fee/commission, when it is earned, and who pays it. Any fee must be visible before order confirmation.
- Who provides collection/delivery, available areas, charges, and responsibility for shortages or failed delivery.
- Initial communities, actual sellers, produce varieties, quality specifications and buyer requests. “Chachtanga” is the supplied example community name; its spelling and administrative location need confirmation before geocoding.
- The supplied message about learning ends at “specific to the…”. Crop/stage/language-specific learning is proposed below; the missing continuation has not been inferred.

## 2. User experiences

### Farmer: join through WhatsApp

1. The farmer texts or sends a voice note to the Agribridge business number.
2. Agribridge explains that it uses an AI assistant, offers a person, and asks English or Luganda and text or voice. General questions remain available without signup.
3. “Register my farm/business” starts a resumable conversation. Ask one short question at a time: preferred name/business name, farmer or cooperative, community/district, crops/varieties, and optionally land size with its unit. Ask only for details needed for the selected service; exact coordinates and land size are not prerequisites for basic access.
4. Read back a short profile summary in the chosen language and medium. The farmer can correct, confirm, pause or request help. Uncertain transcription never silently becomes a saved quantity, place or name.
5. Save the confirmed profile and seller membership. Confirm which details may appear publicly. Profile creation does not itself publish a listing.
6. Offer next actions: **Sell produce**, **View buyer requests**, **Prices**, **Weather**, **Learn**, **My orders**, **Alerts**, **Talk to a person**.

The farmer can use their phone number as the familiar account/contact identifier. Internally use a stable farmer ID with a replaceable, verified phone/channel binding. A changed or recycled number must not create entitlement to another person's business, order or payment. Shared-handset and cooperative-representative cases need an explicit account-selection and authorization path. Never automatically merge existing accounts by phone match or create an unrequested password in chat.

A verified provider message establishes control of a WhatsApp channel. It does not prove legal identity, land ownership, cooperative authority or authority to receive a client payment. Sensitive profile/payment-destination changes and recovery require additional verification. New WhatsApp registrations must not automatically grant membership in an existing cooperative.

### Farmer: ask about prices, quality or weather

- “What is the bean price near my community?” Ask for missing variety, market or unit when it materially changes the answer. Return the source, place, unit, trade level, observation date and freshness. Keep retail, wholesale and farm-gate prices distinct.
- “What do buyers want for this maize?” Retrieve an actual buyer request and its quality criteria. Explain practical steps using reviewed crop guidance, preferably a short lesson or audio explanation.
- “Will it rain here?” Use the selected district/model-grid forecast and explain its date and uncertainty. It is a model forecast, not a verified observation from the farmer's community. Official warnings are displayed as a separate source. Expanding the current assistant's district coverage requires explicit source/location mapping.
- “Can someone help me?” Pause automation for that conversation and place it in the existing staff inbox with relevant context. Do not keep answering over the staff member.

AI explains retrieved facts; staff/sellers control commercial terms and quality acceptance. A photo, voice description or generated answer cannot certify grade, moisture, food safety or export readiness. Quality must distinguish seller-reported, staff-reviewed and independently tested evidence.

There are three separate information categories:

| Category | Meaning |
| --- | --- |
| Market reference | A dated published or locally recorded observation; no sale is promised. |
| Seller listing | A farmer/co-op's actual offer, with availability, price/quote terms and expiry. |
| Buyer request | A real client's demand with variety, quantity, quality, destination and deadline. |

Use **“View buyer requests”** or **“Produce with active buyer demand”** for the original idea of a menu of varieties with markets available. Avoid “Agribridge is buying” unless Agribridge is genuinely the purchaser in that particular transaction. An empty or expired demand board must not turn reference prices into invented demand.

The reviewed WFP source provides monthly observations with uneven market/commodity coverage; it is not a current nationwide or farm-gate feed. Carry the limitations and per-series dates in [the market-data handoff](market-data.md) into every new channel.

### Farmer: sell available produce

1. Choose a crop/variety using a picture card, short numbered choice, typed description or voice.
2. State quantity and unit, availability date, collection area, and asking price or “request a quote.” Photos are optional and must not be presented as verified inspection evidence.
3. Review the draft listing through text or spoken read-back, including which information will be public.
4. Publish only after confirmation and the applicable seller/listing review. The farmer can pause the listing or update availability with confirmation.
5. Receive a real client order/request, confirm available quantity and terms, and follow collection/delivery and payment status. Client payments go directly to the seller through the selected provider.

### Client: browse and order

The storefront should provide produce pictures, crop/variety filters, seller/co-op pages, community/service area, available quantity and units, quality-evidence labels, prices or quote requests, and pickup/delivery information. Public cards expose only approved seller information; private farm notes, exact household locations and payment details stay private.

Recommended first checkout: **one seller per order**, while clients can browse all published sellers. Each order identifies the seller, quantities/units, accepted price, quality requirements, Agribridge fee if applicable, collection/delivery charges, and the total before confirmation. A quote-request listing must not look like immediately purchasable fixed-price stock.

After terms are confirmed, the client authorizes payment through the integrated provider to that order's verified seller destination. Payment credentials and mobile-money PINs belong in the provider's authorized flow, never in WhatsApp or the AI conversation. Use provider-supported phone-based payment methods where available; do not assume method or seller eligibility before checking the selected service.

Order progression must be visible to clients, sellers and authorized Agribridge staff. The platform should support cancellation, shortages and disputes as explicit events, including what happens when payment succeeds but fulfillment fails. Multi-seller carts can follow with seller suborders and separate fulfillment/payment allocation; do not silently mix sellers in one undifferentiated order.

### Learning

Use the farmer's selected crops, stage, buyer quality goals and language to select short reviewed lessons. Offer text, picture-supported explanations, and reviewed audio where useful. Store learning progress against the stable farmer identity so app and WhatsApp can share it.

External FAO links remain external. Existing draft guides must stay labelled; they are not automatically approved for production advice. Learning enrollment does not imply permission for promotional messages.

## 3. Inclusive voice and picture interactions

Voice support includes receiving audio, understanding the request, asking spoken clarifying questions, reading back important details, and returning spoken answers. Buttons and pictures supplement voice; signup, consent, corrections and confirmations must not depend solely on reading text.

- Preserve the signed inbound provider media ID and message identity, then fetch media through authenticated, bounded provider routes. Do not accept arbitrary user URLs or forward provider authorization to an untrusted host.
- Validate audio format, byte size and duration before processing. Set configurable per-person and global audio-use budgets, separate from text-message count limits.
- Treat audio and transcripts as private conversation content with explicit processing disclosure and a defined deletion period. Do not store either in normal request/audit logs.
- Native Luganda reviewers must evaluate crop/place names, quantities, prices, code switching, accents and noisy low-cost phones. Evaluate completed tasks and preservation of meaning as well as transcription accuracy.
- Validate speech output for understandable pronunciation and meaning. Provider support for Luganda is not yet verified. Reviewed human-recorded menus and bilingual staff responses are a supported pilot option, clearly distinguished from automated speech.
- Confirm quantities, prices, land units, locations, order commitments and payment-related changes before saving or acting. If meaning is uncertain, ask again or hand over.
- Produce pictures must be licensed/owned, recognizably labelled and mapped to the same canonical variety IDs as text/audio choices. Illustrative menu pictures must not masquerade as a photo of the seller's actual stock.

A bilingual voice pilot is ready only when representative farmers can finish the entire signup/question/confirmation flow in both languages on real phones. A demo transcript alone is insufficient.

## 4. Alerts and payment messages

### Subscriptions

Record separate explicit subscriptions for price changes, weather updates, buyer-demand updates and order/payment status messages. Each subscription includes the channel, language, relevant crop/variety and location, chosen threshold or event type, frequency, quiet hours, consent evidence and unsubscribe state.

Price alerts compare matching variety, market, quality where available, unit, currency and trade level. Configure freshness and coverage rules per source; exclude historical observations from current-price alerts. Store the comparison baseline and trigger reason. Cooldowns and deduplication prevent repeated messages about one source update. Corrections must not masquerade as real price movements.

Forecast temperature/rainfall thresholds can trigger forecast updates. Official severe-weather warnings use the source's issue, expiry, cancellation and affected-area information. Hail alerts require an actual supported hail-warning source; temperature/rain forecasts alone cannot establish hail. Missing data is unavailable, never an all-clear.

STOP and topic unsubscribe must stop applicable subscriptions and pending sends. Do not automatically enroll people after signup or a question. Order/payment notification preferences must remain separate from promotional subscriptions, with a defined alternative way to check order status.

Scheduled messages need a real background scheduler and durable notification queue. Messages outside WhatsApp's customer-service window need suitable approved templates; current rules, template availability and English/Luganda language options must be checked in the actual provider account before activation. Outbound free-form audio needs an open service window. A suitable approved template may invite the farmer to resume the conversation, but sending it does not reopen that window: the farmer must reply. Do not assume arbitrary spoken answers can be attached to an out-of-window template. Use eligible text templates for scheduled events and offer audio when the farmer resumes the conversation.

### Payment updates

The requested farmer update is **payment approved**. In the confirmed direct-payment model, notification wording must map to the provider's actual event: authorization/approval is not automatically a completed transfer. Record the order, client payer, verified seller payee, amount/currency, provider transaction ID, event time and supporting reference. An authenticated provider transition emits one notification event; AI cannot approve or declare a payment successful. Staff acceptance of an order or review of a payment request is recorded separately from provider approval.

Keep these events distinct:

| Event | Appropriate farmer-facing statement |
| --- | --- |
| Order accepted | The seller/client order has been accepted on the recorded terms. |
| Payment approved/authorized | The provider has approved/authorized payment; transfer may still be pending. Only use this state if the provider supports it. |
| Payment initiated | The identified payer/provider has begun the transfer. |
| Payment confirmed | A trusted payment-provider/bank record or authorized reconciled evidence confirms the specified transfer. |
| Failed/reversed/disputed | Describe the recorded problem and provide a support route. |

The initial model has a client-to-seller payment and no Agribridge-to-seller payout. Verify callbacks/signatures, order ownership, seller destination, amount and currency; reconcile uncertain outcomes with the provider's transaction lookup. Duplicate/out-of-order events cannot repeat payment initiation or overwrite confirmed transaction history with an older status. Separately authenticated refunds, reversals and dispute events update their own recorded lifecycle. A screenshot or browser return URL alone cannot establish payment. Do not infer a transfer from a season's manually entered receipt, a dispatched collection, AI text, or WhatsApp message delivery.

Refunds and reversals must follow the provider's direct-seller process, with authorization and an order-linked record. An Agribridge fee, if introduced, needs a disclosed, provider-supported charging arrangement; it must not silently convert direct seller settlement into Agribridge custody.

Notification processing has its own status: queued, provider accepted, delivered, failed or uncertain. A delivered message does not establish a paid order. Duplicate approval/provider callbacks must not create duplicate obligations or notifications. An ambiguous send must preserve the existing reconciliation safeguards.

## 5. Reuse and required additions

| Capability | Existing foundation | Work required |
| --- | --- | --- |
| Phone-based signup | Phone/password accounts, roles, staff provisioning | Conversational draft signup, verified/revocable channel bindings, confirmation, recovery and seller memberships |
| Business account | Farms, organizations, contacts, district/crop fields | Individual/co-op seller profile, community, representatives, public/private projection and publication permission |
| Supply marketplace | Tenant-visible offers, harvest lots and collections | Public seller listings, standardized varieties/grades, images, stock/quote validity and publication review |
| Real buyer demand | Trade opportunities and buyer collection records | Explicit client-owned requests and matching eligibility, separate from seller stock/reference prices |
| Client orders | Existing commercial records and audit/version handling | Buyer access, checkout/quote acceptance, line-item snapshots, inventory reservations, fulfillment and dispute events |
| Quality and learning | Staff lot review, reviewed lesson workflow, quizzes | Buyer-specification links, farmer-specific delivery, reviewed English/Luganda content and channel progress |
| AI conversation | Bounded web assistant, weather and market services | Durable conversation jobs, shared information retrieval, bounded conversational context and authorized actions |
| Voice/pictures | Signed callbacks and staff inbox | Media metadata/download, transcription, bilingual speech, interactive/image adapters and accessible fallbacks |
| Alerts | Consent, STOP, message ceilings and template-capable transport | Topic subscriptions, scheduler, trigger rules, approved templates and durable notification queue |
| Direct seller payments and updates | Audit events, roles and delivery receipts | Seller provider accounts/destinations, client payment authorization, signed/reconciled payment events, refunds and status notifications |

Source anchors: `server/app.ts`, `server/channel-bridge.ts`, `server/whatsapp.ts`, `server/channels/`, `server/ai/index.ts`, `server/market-data.ts`, `server/workflows.ts`, `server/store.ts`, `src/context/AppContext.tsx` and `src/pages/Markets.tsx`.

## 6. Implementation boundaries

### Shared services and records

Add versioned migrations rather than editing previously applied migrations. Proposed record groups:

- Farmer/seller profiles, verified channel bindings, seller/co-op memberships and resumable signup/conversation state.
- Canonical produce varieties, quality specifications and reviewed bilingual/media assets.
- Seller listings, client buyer requests, client orders, immutable order-line/quote snapshots and fulfillment events.
- Inventory reservations and release/expiry events, linked to source stock/lots where applicable.
- Verified seller payment destinations, payment attempts and provider transaction/event history, with explicit payer/payee, amount/currency and order references; refund/reversal records.
- Topic subscriptions, source-specific alert evaluations, durable jobs and notification delivery records.

The current offer model is organization-visible. Public marketplace search needs an intentional sanitized publication layer across organizations; it must not disable tenant filtering on the existing private APIs. Client, seller and broker permissions must be explicit. Staff can assist only within their assigned authority, and assistance does not change produce ownership.

The current user model binds a user to one organization and uses globally unique phone numbers. Decide how marketplace identity and memberships relate to existing users before coding signup. Preserve existing users and roles; do not automatically create a new tenant or reassign an account based on a chat message.

### Orders and inventory

Suggested listing lifecycle: draft → published → paused/sold out/expired.

Suggested order lifecycle: requested → seller accepted/quoted → client confirmed → fulfilling → delivered → completed, with cancellation/expiry/dispute paths and recorded transitions. Keep payment and fulfillment states independent.

Reserve inventory atomically with a defined expiry when an order reaches the agreed commitment point. Release it on eligible cancellation/expiry, and snapshot accepted prices/units/quality terms. Race tests must prove two buyers cannot purchase the same remaining quantity.

Existing collections reserve whole lots. Order reservations must share a consistent availability calculation with those commitments; never allow a lot to be pledged both to a collection and an unrelated client order. Partial-quantity selling requires a deliberate divisible-stock model or lot splitting before it is offered. Do not silently weaken current allocation protections.

### Conversation processing

Persist and deduplicate the authenticated inbound event, acknowledge it, and process AI/media/provider work outside database transactions in a durable worker. Preserve per-conversation ordering and exclusive staff/automation ownership. Recovery after restart must not repeat account creation, order commitment, payment approval or sending after an uncertain provider result.

Use a shared information service for market references, seller listings, buyer requests, district forecasts and reviewed guidance. Ordinary price/menu replies can be formatted directly from structured records. AI can clarify and explain them without becoming the source of numeric facts. Price/weather-only answers should not require an unrelated reviewed lesson, as the current web assistant does.

Expose business operations through typed, validated commands under an authorized caller identity. The model may propose a profile/listing/order action; it does not write arbitrary database fields or establish its own permissions. Signup, subscriptions, commercial commitments and sensitive changes need explicit recorded confirmation, with confirmation bound to the exact draft/version.

No provider credentials or real-message sending is enabled by this specification. Existing demo mode must continue to prevent real outgoing telecom delivery. Test voice/AI/payment adapters with bounded fixtures before consented provider checks.

## 7. Delivery sequence

These are implementation stages, not completed features or delivery-time estimates. Stages 1–4 form the initial target service; intermediate demonstrations must identify which capabilities remain disabled.

1. **Seller identity and WhatsApp conversation foundation.** Add farmer/co-op profile drafts, verified channel binding, confirmation, human handover, English/Luganda language and medium preferences, durable inbound jobs and operation-specific authorization. Reuse existing staff inbox and source services.
2. **Accessible farmer marketplace participation.** Add bilingual voice input/replies and picture menus, confirmed seller listings, real buyer requests, source-backed price/weather/quality answers and tailored reviewed learning. Voice is part of pilot acceptance, not a claim supplied by a text-only prototype.
3. **Client marketplace and brokered orders.** Build public browse/seller pages and single-seller order/quote confirmation, explicit inventory commitments, seller confirmation, fulfillment/status and broker tools. This is where the food-delivery-style browsing and order experience appears. Payment collection stays disabled until stage 4; do not advertise an intermediate order demonstration as a functioning paid checkout.
4. **Direct seller payments, subscribed alerts and payment updates.** Integrate a provider that supports verified seller onboarding and client-to-seller settlement. Add authenticated/reconciled payment/refund events and accurately worded WhatsApp updates. Add freshness-aware price/weather triggers, scheduler, approved templates and exactly-once business events with observable delivery outcomes. Provider selection and the operational process must be resolved before enabling real charges.
5. **Later channel expansion.** Reuse identity, listing, order, information and subscription services in the app and USSD. Extend existing opt-in PWA offline records carefully. USSD can share short text workflows, but cannot reproduce WhatsApp pictures/voice or receive asynchronous alerts in a closed session; those need a separately consented messaging/call channel. WhatsApp itself does not provide an offline bot.

## 8. Acceptance criteria

The initial service is ready for a supervised pilot only when the relevant stages demonstrate:

1. A farmer completes signup in English and Luganda using voice, confirms a spoken profile, corrects a misunderstood detail and reaches a person without requiring typed input.
2. Duplicate/reordered callbacks and worker restarts create one confirmed identity/profile/listing/action, with no duplicate commercial commitments.
3. A shared/reassigned phone or another organization cannot retrieve private orders or redirect a payment by simply supplying a number.
4. Published marketplace cards omit private phone/location/financial fields; only an authorized seller or representative can publish/change supply.
5. Menus show real published stock and buyer requests. Paused/expired/empty demand never becomes an AI-invented purchase opportunity.
6. A price answer preserves variety, market, grade where known, unit, date, source and freshness; stale references cannot trigger current-price alerts or become an executable quote.
7. A quality answer cites reviewed guidance and the actual buyer specification, while lot acceptance remains an authorized recorded decision.
8. Simultaneous orders and existing lot collections cannot over-allocate stock. Confirmed orders preserve the agreed quantity, price, fees and fulfillment terms.
9. Subscription consent, unsubscribe, STOP, cooldowns, quiet hours and source outages behave as described. Missing forecasts do not become an all-clear; unsupported hail alerts are unavailable.
10. A confirmed client payment settles to the selected seller through the provider, without an Agribridge-held balance. One authenticated payment approval/success event produces one accurately worded update. Neither authorization nor message delivery is displayed as completed transfer. Amount/currency/payee mismatches are rejected, uncertain outcomes are reconciled and duplicate events cannot charge or notify twice.
11. English/Luganda audio is understandable to intended users on real phones; numbers/units/places preserve their meaning, and unsupported speech has a practical bilingual human path.
12. End-to-end checks cover web clients, WhatsApp farmers and staff together: signup → listing → client order → seller confirmation, then the configured payment and fulfillment transitions and their notifications. Decide whether payment is required before dispatch, on delivery or on another agreed milestone; the example journey does not impose a payment-timing policy. Sandbox/mock results are distinguished from a consented real-provider delivery test.

## 9. Exclusions from this first specification

Automatic pesticide dosing or crop diagnosis, automated grade certification, guaranteed daily nationwide prices, AI-negotiated or AI-approved payments, assumed escrow/custody, untested Luganda accuracy, and delivery guarantees are not supplied by the proposed flows. Any later addition needs its own data, operating rules and validation.

No app interface or service has been implemented by adding this document. The next development work should follow the shared records and staged acceptance criteria above. The broker model, direct client-to-seller payments and English/Luganda voice scope are confirmed; provider choice, fees, fulfillment rules and initial catalog/content still need operational inputs before activation.
