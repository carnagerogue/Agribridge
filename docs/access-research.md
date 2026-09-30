# Uganda access and service decisions

Research checked 28 September 2026. Provider rates below are dated public evidence, not binding quotations. The launch team must confirm rates, coverage and terms before provisioning.

## Access strategy

Use a small offline-capable PWA, sponsored SMS/USSD, optional WhatsApp and spoken assistance. These channels share one consent-aware account and support history. No channel works through complete absence of its required network; offline records and downloaded lessons remain available after an initial connected visit.

| Channel | Product purpose | Constraints |
| --- | --- | --- |
| Offline PWA | Farm records, saved learning, task tracking, extension-worker visits | Initial load/sync requires internet. Display saved-at times and pending changes; never imply a cached forecast is current. |
| SMS | Short requested forecasts, urgent alerts, reminders and receipts | Carrier signal, delivery cost and encoding limits. Shared phones expose message content. |
| USSD | Crop/district selection, price lookup, enrolment, callback requests and simple reports | Live cellular session and brief menus. Session timeout/cost make it unsuitable for long lessons. |
| WhatsApp | Farmer questions, optional pictures/voice notes and human handoff | Smartphone and data. Consent, business provisioning and message pricing apply. |
| IVR/callback | Spoken learning and support in locally reviewed languages | Call charges, recordings, staffing and network testing. Do not assume reliable speech recognition in every language. |

GSMA's November 2025 Uganda analysis reported 96% 4G population coverage but 11.46 million unique mobile internet users. It identifies handset affordability, unreliable electricity and limited skills as barriers. UCC reported 10 million WhatsApp subscribers in September 2025. These counts are dated, have different definitions, and must not be treated as interchangeable estimates of unique people. [GSMA Uganda analysis](https://www.gsma.com/newsroom/press-release/gsma-unveils-latest-report-showing-digital-policy-reforms-could-add-ugx-14-6-trillion-to-ugandas-gdp-connect-4-million-more-citizens-by-2030/) · [UCC summary](https://www.ucc.co.ug/new-communications-sector-report-highlights-efforts-to-bridge-access-and-usage-gaps/)

## Provisioning and commercial dependencies

- **USSD:** Africa's Talking documents shared and dedicated service on MTN and Airtel. Postpaid sessions are funded by the organization, free to the end user. Its 2025 rate card lists UGX 500,000 monthly shared-code maintenance, UGX 45 per 20 seconds and a UGX 250,000 session deposit. Dedicated codes require UCC acquisition and materially higher fees. Start a pilot with a shared postpaid code; confirm current terms. [Official Uganda guide and attached rate card](https://help.africastalking.com/en/articles/8167020-ussd-uganda)
- **SMS:** Published local-traffic basic-tier Uganda pricing lists UGX 27 for MTN and UGX 25 for Airtel per SMS, with separate sender fees. Encoding matters: some characters reduce one-message capacity from 160 to 70. Validate current tax, sender registration and international-traffic classification. Estimate segments, cap spend, track delivery and honor STOP. [Provider pricing](https://africastalking.ug/pricing?lang=en)
- **Voice:** Uganda is listed among supported countries as of April 2026. The price attachment linked by the provider is dated 2023 and needs a fresh quotation. Use short recorded prompts, keypad menus, explicit call consent and human escalation. [Availability](https://help.africastalking.com/en/articles/11532624-countries-offering-voice-product) · [Uganda pricing attachment](https://help.africastalking.com/en/articles/11532634-voice-pricing-uganda)
- **WhatsApp:** Pricing varies by delivered-message category and recipient market. Do not promise permanently free automated support. Meta's business pricing page was accessible, but developer pricing pages were rate-limited during this review; reported upcoming October changes could not be independently resolved against those pages. Obtain the current rate card at launch. Store permission records and respect opt-outs. [Official pricing](https://whatsappbusiness.com/products/platform-pricing/) · [Messaging policy](https://whatsappbusiness.com/policy/)

## Weather that distinguishes forecasts from official warnings

Uganda's Department of Meteorological Services, under MWE, publishes a Weather API for daily, city, marine, seasonal and district forecasts. Forecast/search routes need a server-side bearer token with `forecast:read`. Tokens have configurable daily limits resetting in `Africa/Kampala`. Never put these tokens in frontend code. [Official API documentation](https://wids.mwe.go.ug/portal/api-docs) · [DMS mandate](https://mwe.go.ug/about/departments/meteorological-services)

CAP early warnings are public: `GET https://wids.mwe.go.ug/api/v1/cap/all` returns JSON with `status`, `count`, `feed` and `alerts`. A read-only check during this research returned status `ok` and zero alerts. That check is not an ongoing guarantee that no warnings exist. Preserve issue/expiry/cancellation information, affected areas and the official source. An unavailable feed must not display as an all-clear.

Open-Meteo supplies model forecasts. Its free hosted service is for noncommercial use, up to 10,000 daily requests, without an uptime guarantee. Commercial hosted use requires a subscription; self-hosting is another operational choice. CC BY 4.0 data attribution is required. A service being free to farmers does not automatically make its use noncommercial. Cache at an appropriate geographic resolution and refresh centrally. [Pricing](https://open-meteo.com/en/pricing) · [Licensing](https://open-meteo.com/)

## Learning and environmental reporting

MAAIF publishes extension manuals and guides in English, Luganda, Runyankole, Rutooro, Lugbara, Ateso and Lumasaba. NARO maintains production and farm-management manuals. Organize Academy lessons by crop and growth stage, with sources, version dates, reviewer identity and practical tasks. Commission local agronomic/language review and verify reuse rights before republishing source material. [MAAIF guides](https://www.agriculture.go.ug/acdp-farmer-guides/) · [NARO manuals](https://researchspace.naro.go.ug/communities/d6d6f082-855d-4a06-8351-f6a0cbf7fca7/subcoms-cols)

Community reporting should initially cover environmental observations and referral/cleanup workflows. A standing-water observation is not a malaria case; rainfall is not a diagnosis. WHO's June 2026 manual emphasizes local adaptation, programme oversight, surveillance and community participation. Larval-source management is supplementary to core vector control. Do not instruct blanket drainage, destruction of wetlands or unsupervised chemical application. A future disease-surveillance feature needs a public-health partner and separate governance. [Current WHO manual](https://www.who.int/publications/i/item/9789240123212) · [WHO supplementary-intervention guidance](https://www.who.int/publications-detail-redirect/9789241505604)

## Privacy and offline operation

Uganda's privacy regulations require covered data collectors, processors and controllers to register with PDPO. Launch planning needs a lawful basis, understandable notices, retention rules, responsible providers and processes for access/deletion/breaches. SOC 2 is an organizational assurance outcome; application code does not grant certification. [PDPO regulations](https://pdpo.go.ug/media/2022/03/Data_Protection_and_Privacy_Regulations-2021.pdf)

Browser offline mode is optional. It stores only the caller-selected farmer-safe snapshot in IndexedDB under `organizationId:userId`. Do not persist tokens, CRM contact lists or individual health records. Clear the scope on sign-out or when disabling saved data. Browser local storage is not protection against another person using an unlocked shared device, so explain that tradeoff plainly.

The service worker stores only credentialless public HTML, manifest/icon and hashed app assets. It excludes all `/api` requests, third parties and weather. It registers only for a production build. Vite emits a versioned public asset manifest including lazy route chunks; the build-specific cache changes automatically with shell releases. Queued mutations use FIFO order, original idempotency keys and versions. A conflict/permanent validation failure pauses following changes for review; transient network failures back off. Production replay relies on the API enforcing authentication, tenant authorization, CSRF, idempotency and optimistic concurrency. Offline snapshots use a field allowlist: farmers retain their own farm/task records without free-text notes or support follow-ups; staff retain no operational farm/task/contact records. Logout locks this browser before clearing local identity and saved data, even if the server cannot be reached. The lock clears only through explicit sign-in.

Field validation must include low-end handsets, shared phones, MTN/Airtel, lost connections, interrupted USSD sessions, stale information and spoken/local-language comprehension. Measure completed farmer tasks and successful human referrals, not only app downloads.
