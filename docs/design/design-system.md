# Agribridge visual specification

Primary reference: `desktop-concept.png`, generated for this implementation with the built-in image generation tool. Full product app, not a marketing site. Mobile reference generated separately in the same system. The complete prompt is recorded in the task conversation; key brief: Uganda farmer + cooperative app; low bandwidth; plain text; broad whitespace; forest green, sage and white; clear source/freshness states; no invented live information.

## Tokens and composition

- White main surface `#ffffff`; sage sidebar `#f4f8f5`; primary text `#142c27`; muted `#64746d`; forest action `#214f3c`; selected pale green `#e2eee6`; borders `#e3e9e5`; forecast yellow `#fffae4`.
- Self-contained system sans stack. No remote font request. Heading 40/1.15 on desktop, 32/1.15 mobile; secondary 19px; body and controls 14px; supporting text 12px. High contrast, minimum 44px touch targets and visible focus.
- 232px fixed sidebar; 64px top bar; 32px content gutters; max content width 1400px. Header + dark green introductory band; 1.7:1 two-column action and forecast layout. Fine single borders, radius 12px; no stacked nested card grids.
- Lucide outlined icons, 20px, 1.7px stroke, currentColor. Sprout identity vector; no production raster assets needed. Decorative farmland contours are optional desktop SVG curves; hidden on mobile and low-data mode.
- Sidebar: Today, My farms, Weather, Markets, Learn, Community; Operations: Farmers & CRM, Trade desk, Messages, Administration; bottom Connection & settings. Role-gated operations. Mobile bottom bar: Today, My farms, Learn, More; drawer for other destinations.
- Motion 140ms fade only. Honor reduced-motion. No automatic media or third-party fonts/map tiles.

## Above-fold copy inventory

Agribridge; organization name; Workspace; Today; Demo workspace (only actual demo); A good day to grow.; Your farm, your next steps. All in one place.; Add a farm; Small steps. Stronger harvests.; Start with your farm. Build a plan that works for you.; View my farms; Your next steps; View all; Weather at a glance; Nakaseke (selected district); Connect for a fresh forecast; Source and update time shown with every forecast; Open weather; A little learning goes a long way; Stay connected; SMS; USSD; WhatsApp; Choose how we reach you.

Seed entity names/tasks derive from real sample database and may change. Date labels computed, no fake current weather. The generated illustration's tiny decorative slogan is deliberately omitted: it adds data and no user value. Notification icon opens real pending-task/report destinations. Context and states may add connection status, draft labels, validation, sample disclaimers, empty states and persistence feedback as functional requirements.

## Shared page families

- Farm/weather: split open lists and supporting details. Farm create/edit and task forms use accessible modal dialogs.
- Markets/CRM/trade: searchable/filterable responsive row tables, substantive entity details/edit, explicit sample/verification status; tabular numbers and UGX units.
- Academy: crop-filtered article/lesson list, full reader, source and review status, graded quiz, progress.
- Community: report list + report form, no public household pins or patient records. Triaging for authorized staff.
- Messages: contact + channel + compose, consent visibility, delivery status; USSD simulator clearly labelled test mode.
- Administration: counts from data, audit rows, integration readiness. No fabricated uptime/security scores.
- Settings: reachability choices, opt-in offline storage, queued changes with retry/discard and conflict messages; explicit shared-device considerations.

## Verification

Compare layout, type, color, spacing, list anatomy, controls and responsive hierarchy against references. Capture desktop and mobile. Distinguish fidelity review from functional tests.

Intentional implementation differences: navigation adds the requested farm assistant, season planner and harvest workflows; operations remain hidden from farmers. Real persisted tasks and guide titles replace illustration copy, and completed tasks no longer appear on Today. Desktop type follows the compact 40px specification rather than the oversized concept lettering. On mobile the decorative landscape is omitted and harvest tables become stacked records, keeping all quality/allocation states readable without sideways scrolling. Weather call-to-action text distinguishes an available connection from reconnecting. These differences support data truth, inclusion and the expanded product scope while retaining the sage/forest palette, whitespace, task-first hierarchy and four-item mobile navigation.
