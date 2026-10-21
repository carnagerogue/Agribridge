# Buyer marketplace

The public buyer surface is `/buy`; the signed-in farmer/cooperative market workspace remains `/marketplace`. Both use the operational React/Express application and PostgreSQL/PGlite database. Buyers have a separate account and session, rather than receiving a farmer, operator or administrator role.

## Buyer journey

1. Browse produce without signing in. Search by crop, seller business name, variety or district, and filter by crop, district and available kilograms. Only explicitly published, available, unexpired listings from active sellers appear.
2. Create a buyer account or sign in with a Uganda mobile number and password. Signup records the buyer's name, optional business/email details and location. Passwords require at least 14 characters and are stored as salted scrypt hashes. Phone numbers are self-declared: signup does not verify control of the number or link an existing farmer account.
3. Review a fixed-price listing and enter whole kilograms, a delivery/collection location, an optional requested date and a short message. The server derives the seller, price and produce total from the current listing. Transport is excluded; requested handover arrangements still need agreement.
4. Send an order request, then follow the seller's response. A request expires after 48 hours if it has not been accepted. Pending requests do not reserve stock. Acceptance reserves the quantity; fulfillment records handover and keeps that quantity consumed.
5. Cancel a request before acceptance when needed. After acceptance, ask the seller or cooperative team to resolve changes. Cancelled and fulfilled orders are final. Order status does not establish payment.

The UI also offers an explicitly selected sample marketplace. Its fictional profiles, requests and preview transitions stay in browser memory and are cleared by reset/reload. Sample requests are not submitted to the buyer-order API. A failed live request is not silently converted into a sample success.

## Seller publication and response

New and existing supply listings default to **Workspace only**. Recording produce does not publish it. In the signed-in market workspace's **My produce** section, **Publish to buyers** opens a confirmation describing the public fields. Authorized cooperative staff can manage publication for sellers in their organization.

The public projection includes the listing's opaque handle/version, seller business name, crop, variety, declared grade, district/community, harvest window, remaining kilograms and asking price. It excludes seller user/organization/profile IDs, phone numbers, emails, private quality notes, farm coordinates and financial records. Declared grade is not independent certification. Use a public community label rather than household directions in a listing intended for publication.

**Unpublish** stops new public requests without erasing historical requests or releasing accepted commitments. Paused, sold, expired, fully committed or inactive-seller listings are not available for new public orders. Production excludes sample supply and sample seller profiles, including direct requests using a known sample listing handle.

Under **Orders & updates**, **Orders from purchasing clients** lists the seller's incoming requests. Farmers see their own seller orders; authorized staff see orders for their organization. Acceptance, cancellation and fulfillment require explicit confirmation. They do not send a message, move money or issue a refund.

## Identity and API boundaries

Buyer accounts, sessions and replay records are in `buyer_accounts`, `buyer_sessions` and `buyer_idempotency`. They never inherit organization-member permissions. Buyer sessions use a distinct HttpOnly, SameSite=Lax cookie; production uses the Secure `__Host-agribridge_buyer` cookie with root path. Only token hashes are retained in the session table. Logging out revokes that buyer session without changing farmer/staff sessions.

| Endpoint                                       | Access and behavior                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/buyer/catalog`                       | Public sanitized catalog; filters `q`, `crop`, `district`, `minQuantityKg`, plus `limit`/`offset` pagination. |
| `POST /api/buyer/signup`                       | Strict signup input, phone uniqueness and a new buyer session.                                                |
| `POST /api/buyer/login`                        | Phone/password sign-in with a fresh buyer session.                                                            |
| `GET /api/buyer/session`                       | Current buyer profile and session CSRF token.                                                                 |
| `POST /api/buyer/logout`                       | Revokes the current buyer session and clears its cookie.                                                      |
| `GET /api/buyer/orders`                        | Only the authenticated buyer's requests. Client-supplied buyer IDs are not accepted as a filter.              |
| `POST /api/buyer/orders`                       | Creates a request from `supplyId`, `listingVersion`, quantity, location, optional requested date and message. |
| `PATCH /api/buyer/orders/:id`                  | The owning buyer can cancel a still-requested order using its current version.                                |
| `GET /api/marketplace/buyer-orders`            | Existing farmer/staff authentication; seller/organization-scoped incoming orders.                             |
| `PATCH /api/marketplace/buyer-orders/:id`      | Authorized seller/staff transition with the current order version.                                            |
| `POST /api/marketplace/supply/:id/publication` | Authorized seller/staff publication change with the current supply version.                                   |

Unsafe buyer requests require the configured exact `Origin`. Authenticated changes also require `X-Buyer-CSRF-Token`, distinct from farmer/staff CSRF. Order changes and publication changes require a UUID `Idempotency-Key`; retrying the same action reads its durable result, while reusing the key with different content returns a conflict. Seller endpoints retain ordinary application session and CSRF requirements.

Requests snapshot crop, variety, grade, location, harvest dates and price on the server. Stale listing versions, changed terms, inactive sellers, unavailable supply and invalid requested dates are rejected. Accepted/fulfilled quantities from both `market_orders` and `buyer_orders` share one stock calculation. Every acceptance and supply edit uses the same supply-row lock before changing commitments. A quantity cannot be reduced below either system's commitments; fulfillment does not make that stock available again.

Order request, audit and replay changes commit transactionally. The public catalog never includes orders or buyer delivery details; those are available only to the requesting buyer and the authorized seller scope.

## WhatsApp boundaries

The public WhatsApp preview offers a scripted buyer journey; its account, voice-note and payment examples are fictional and stay in memory. It does not register a real buyer, record speech, contact a seller or make a payment.

When the real WhatsApp channel is provisioned and the existing market-conversation feature flag is enabled, `BUY`, `BUYER` or `PURCHASE` starts a private purchasing inquiry. It asks for buyer/business details, destination district, crop, variety, kilograms, grade and need-by date. An expiring, version-bound confirmation is required before saving. `BROWSE Maize` or `BROWSE Maize | Nakaseke` retrieves the sanitized, seller-published public produce projection. `BUYERS crop` remains the farmer-facing buyer-demand command. `HUMAN` and `STOP` remain available; media and automated speech need a person or a future supported provider.

Channel inquiries do not create web passwords or buyer sessions, reserve stock, create accepted orders, verify phone ownership for an application account, or grant ongoing alert permission. Their phone identity comes only from the authenticated provider callback. Staff can review the private inquiry via `GET /api/marketplace/channel/buying-inquiries` and acknowledge/close it via `PATCH /api/marketplace/channel-buying/:id`; the aggregate channel-registration view also includes buying inquiries. These actions do not send messages.

## Deployment and remaining activation

Migration 7 appends the buyer tables, stock references and opt-in publication column; previously stored listings remain unpublished. Apply it using the normal migration workflow before starting with `DATABASE_MIGRATIONS=verify`. Never edit an applied migration or deploy older code against the newer schema. See [deployment](deployment.md) for backups, verified-TLS PostgreSQL and controlled upgrades.

The web buyer flow requires the ordinary operational HTTPS deployment and database, but no WhatsApp or payment keys. A fresh production catalog can be empty until real sellers deliberately publish current listings. Public buyer orders are separate from the existing organization-member payment-event schema: checkout, automatic payment confirmation and payment-notification delivery remain disabled for these orders until a supported direct-to-seller provider is integrated. Requested, accepted and fulfilled states are not payment receipts.

Phone verification, buyer password recovery/account management, seller verification, provider checkout, agreed delivery operations, production retention/deletion maintenance and consented live provider tests remain operational or future integration work. Existing provider setup does not establish those capabilities.

Relevant checks are `server/tests/buyer.test.ts`, `server/tests/buyer-orders.test.ts` and the migration suite. Tests use local PGlite by default; the order and migration suites also support `TEST_DATABASE_URL` for disposable PostgreSQL databases. This change passed all nine buyer-order tests and all 15 migration tests on PostgreSQL 17 with certificate-verified TLS, including competing internal/public order acceptance. Passing local checks does not establish a hosted rollout or a real provider transaction.
