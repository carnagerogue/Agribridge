# Agribridge implementation contract

This repository began with a README only. Build a working, low-bandwidth agricultural operations product with explicit local demo mode and a secure production path. Brand: Agribridge. Uganda first. Do not claim certification, live market prices, automatic pest diagnosis, health surveillance, or active telecom delivery without verified integrations.

## Stack and ownership

- Root package: React + TypeScript + Vite web app, Express TypeScript API. Node 22. Frontend served at 5173, API at 3001, Vite proxy `/api`.
- Backend uses PostgreSQL in production (`DATABASE_URL`) and PGlite on disk locally. Database abstraction uses parameterized SQL over one typed table per record type, changed only through numbered migrations in `server/migrations/`. Do not put PGlite in browser bundle.
- Root agent owns package manifests, frontend, public PWA, design, and integration. Backend agent owns `server/` except `server/channels/`. Channel agent owns `server/channels/` and channel docs/tests. Coordinate contracts via messages.
- Demo server: `AGRIBRIDGE_DEMO=true`; localhost development only. `POST /api/auth/demo` `{role:'farmer'|'operator'|'admin'}` establishes real HttpOnly session and returns `{user}`. Production refuses demo mode and no demo identity exists unless explicitly enabled. Dedicated demo tenant contains clearly identified sample data. Switching demo role is demo-only.

## API contracts

All JSON. GET `/api/health` -> `{status,mode}`. Errors `{error:{code,message}}`. API auth uses opaque cookie sessions, server-side roles, CSRF on mutations, rate limits, tenant scoping, validation, allowlisted updates, audit events. GET `/api/auth/session` -> `{user,csrfToken}` or 401; auth/demo also returns csrfToken. User `{id,name,role,organizationId,organizationName}`. Sign-in POST `/api/auth/login` `{email,password}`. Logout POST `/api/auth/logout`. Every non-auth mutation sends `X-CSRF-Token` from session. Production bootstrap administrator via CLI/environment; no public admin registration.

GET `/api/bootstrap` -> `{farms,tasks,contacts,marketPrices,offers,deals,reports,lessons,progress,messages,settings}`. Each entity has string `id`, ISO `createdAt` and `updatedAt`, numeric `version` for optimistic concurrency where mutable. All demo sources clearly `sample`.

- `farms`: `{id,name,district,latitude,longitude,areaAcres,crop,plantedAt,ownerName,stage,notes,version}`. POST `/api/farms`, PATCH `/api/farms/:id`.
- `tasks`: `{id,farmId,title,dueDate,category,status:'pending'|'completed',notes,version}`. POST `/api/tasks`, PATCH `/api/tasks/:id`.
- `contacts`: `{id,name,phone,district,type:'farmer'|'buyer'|'cooperative'|'supplier',crop,stage:'new'|'active'|'follow_up',preferredChannel:'sms'|'whatsapp'|'voice'|'ussd',consent:boolean,notes,version}`. Operators only POST/PATCH `/api/contacts`. GET/bootstrap farmer must not expose other farmers' contact data.
- `marketPrices`: `{id,crop,market,district,priceUgx,unit:'kg',observedAt,source,status:'sample'|'reported'|'verified',version}`. Operators POST/PATCH `/api/market-prices`. No simulated data called live.
- `offers`: `{id,crop,quantityKg,priceUgx,district,sellerName,description,status:'available'|'reserved'|'sold',version}`. POST/PATCH `/api/offers`. Ownership enforced. No actual payments implemented as settled.
- `deals`: `{id,buyer,crop,quantityKg,priceUgx,destination,incoterm:'EXW'|'FCA'|'FOB'|'CIF'|'DAP',stage:'inquiry'|'qualified'|'contracted'|'in_transit'|'delivered',checklist:string[],notes,version}`. Operator POST/PATCH `/api/deals`. Export readiness checklist, not customs clearance or payment processing.
- `reports`: `{id,kind:'crop_pest'|'crop_disease'|'standing_water',district,farmId?,description,status:'submitted'|'reviewing'|'resolved',latitude?,longitude?,version}`. POST/PATCH `/api/reports`. Farmers see own reports. Operators can triage. No individual malaria/patient information. Public aggregate precision suppressed; no public exact pins.
- `lessons`: `{id,crop,title,summary,durationMinutes,level,sections:[{heading,body}],quiz:{question,options:string[],answerIndex,explanation},sourceTitle,sourceUrl,reviewStatus:'draft'|'reviewed'}`. Readable GET `/api/lessons` public, field guide drafts labelled awaiting agronomist review.
- `progress`: `{id,lessonId,completed,score}`. PUT `/api/progress/:lessonId` `{answerIndex}` (grade server side; don't accept arbitrary passed claims).
- `messages`: `{id,contactId,channel,body,status:'queued'|'sent'|'delivered'|'failed'|'not_configured',createdAt}`. Operator POST `/api/messages` `{contactId,body,channel}`; consent and active provider required. Never pretend delivered.
- `settings`: `{language:'en'|'lg'|'sw',lowDataMode:boolean,preferredChannel:'sms'|'whatsapp'|'voice'|'ussd',notifications:boolean}`. PUT `/api/settings`.

GET `/api/weather?latitude=...&longitude=...` -> `{source,fetchedAt,latitude,longitude,current:{temperature,description},days:[{date,min,max,rainChance,rainMm}],advisories:[{severity,title,body}],stale:false}`. Timeout/cache/error handling. Open-Meteo external model forecast, not ground observation. No invented weather fallback. Provider error returns unavailable; browser may show timestamped prior cache. Official Uganda weather warnings only when provider configured.

GET `/api/admin/overview` -> `{counts,audit:[{id,action,entityType,createdAt,actorName}],integrations:[{id,name,status,detail}]}`. Admin/operator roles appropriately scoped, no secret values. Health content supports environmental hazard reporting and referral only.

Frontend API helpers unwrap direct entities (`POST/PATCH` -> entity), bootstrap object direct. Send `version` on PATCH; server 409 on conflicts. `Idempotency-Key` UUID on queued create/PATCH requests; per user+tenant keyed replay. Bootstrap includes current user role permissions.

## User journeys

Farmer: Today tasks, farm profile/season, weather by district or consented precise position, crop field guides + quizzes, market comparison + offers, environmental/crop report, access settings. Operator: CRM + follow-ups, verify prices, trade readiness, report triage, delivery status, audit/integration readiness. Mobile has persistent four-item navigation, More menu, 44px+ controls, plain language. Core text lessons and app shell work offline after first load. User-specific local data scoped to user/tenant; clear on logout; no persistent contact/health data by default.

## Release truth

Product code and local demo can be built here. National launch additionally needs hosting, real identity onboarding, telecom sender/shortcode approval, paid or self-hosted weather agreement, agronomist/language review, security assessment, backup/restore drill, load tests and ongoing operations. SOC 2 is an audited organization/process outcome, not a code claim.
