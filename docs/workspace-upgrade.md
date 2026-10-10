# Workspace upgrade

Agribridge now gives farmers a daily work view and cooperative staff an overview of team priorities, using the existing permission-scoped records.

## Product changes

- Home shows farm-scoped counts, a due-date-ordered agenda, pending/today/overdue/completed filters, task creation, completion and reopening.
- Task writes keep version checks and the existing offline queue. Queued changes are labelled as awaiting confirmation; the dashboard does not count them as server-confirmed progress.
- Staff see active collections, contacts needing follow-up and unresolved community reports before the agenda. These summaries explicitly cover all farms, independently of the personal work filter.
- Global search finds permitted tools, farms and tasks. Search matches words across names, crops and districts; result links focus the exact farm or task. Ctrl/Cmd+K opens search, Escape dismisses it, and the existing dialog traps and restores focus.
- A shared forest-green sidebar, warm neutral surfaces, consistent controls and responsive layouts carry the visual system across signed-in routes. No extra fonts, image downloads or provider services are required.
- Home, Farms and Settings load on demand. The existing build includes their chunks in the offline asset manifest.
- Home shows loading or reconnect states when records are unavailable. Staff summaries require a connection because cooperative records are deliberately excluded from offline snapshots.

## Visual comparison

The generated desktop concept was compared with rendered 1440px desktop and 390px mobile captures.

| Area           | Implementation decision                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation     | Retained the existing accessible drawer and role-aware groups; applied the concept's forest palette and pale green active marker.                                                |
| Page hierarchy | Retained the headline, compact summary strip, agenda, farm list and conditions rail. Promoted staff priorities above the agenda to give cooperative operations equal prominence. |
| Data density   | Used real records and natural page scrolling; did not constrain task counts or invent numbers to match the illustration.                                                         |
| Agenda         | Used text labels and working complete/reopen buttons in place of illustrative menu dots. Status is conveyed by text as well as color.                                            |
| Weather        | Preserved the actual provider response, source timestamp and unavailable states; omitted the concept's unverified field-work advice.                                             |
| Mobile         | Stacked the columns, used a two-column summary, compact staff rows, 44px task controls and the existing fixed bottom navigation.                                                 |
| Copy           | Preserved recognizable Home/Farms/More tools labels rather than renaming established navigation. Replaced generic journey copy with actions tied to task and collection records. |

## Validation

- TypeScript check and production build.
- 116 frontend unit tests, including agenda boundaries, farm scoping, completion and permission-aware search.
- Browser checks in the local demo: farmer and operator homes; create, complete and reopen a task; farm filtering; preselected farm in the task form; record search and focused farm navigation; mobile drawer, Escape dismissal and mobile search navigation to Harvest.
- Desktop at 1440px, narrow desktop at the normal app viewport, and mobile at 390px. No horizontal page overflow on the checked mobile views; no browser console warnings/errors in the checked session.
- Existing E2E sign-in expectations updated for the new heading. The automated E2E suite was not run in this session; browser checks used the in-app browser.

## Scope

This is a workspace and workflow upgrade. Existing weather, market, messaging and assistant integrations retain their configured capabilities. No hosting resources or paid plans were added. Local screenshots are in `.data/design-review/` and are intentionally not committed.
