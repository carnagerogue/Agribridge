# From agricultural information to useful field operations

Research and implementation notes, 28 September 2026. These are product design decisions, not a claim that an application alone creates income growth.

## What the evidence changes

**Buyer access must accompany quality improvement.** Four field experiments with Ugandan maize farmers found that improving quality alone did not earn a return in the studied market; access to a market paying for quality increased productivity and farming income. That supports connecting learning, recorded quality and a real buyer's quantity requirement. It does not establish a guaranteed result for another district, crop or this software. [Bold, Ghisolfi, Nsonzi and Svensson, American Economic Review, 2022](https://www.aeaweb.org/articles?id=10.1257/aer.20210122)

**A high market price is not a farm budget.** FAO distinguishes forward planning from recorded results, and cash budgets from economic budgets that also value non-cash resources. Our inference: a farmer needs household reserve, expected saleable quantity and explicit costs beside a price. The app therefore labels its calculations cash estimates, not comprehensive profit; unpaid family labour, depreciation and other omitted costs can materially change the answer. [FAO, farm enterprise and activity budgeting, sections 4.3.1 and 4.3.6–4.3.8](https://www.fao.org/4/W7365E/w7365e07.htm)

**Internal review is not export certification.** UNBS's August 2023 maize-export notice describes formal sampling, laboratory analysis, traceable batches and certification documentation. Our inference: storing a lot code, measurement method and test reference helps preparation but does not grant clearance. Applicable current requirements must be confirmed with the authority and destination buyer before shipment. [UNBS maize exporter notice](https://www.unbs.go.ug/readmore-slider.php?banner=&sl=415)

**Measure participation in completed sales, not account registrations.** WFP's 2026 aggregation indicator focuses on targeted farmers actually contributing to collective sales, using organizational commodity and sales records. Our inference: a cooperative dashboard should distinguish contributors and dispatched quantities from merely listed stock. Neither a dispatch record nor the number of contributors proves buyer acceptance or payment. [WFP farmer aggregation indicator](https://monitoringhandbook.manuals.wfp.org/wfp-indicator-compendium/docs/wfp-outcome-template-2026-12)

## Workflow 1: a season's cash plan and records

An authenticated farmer, or an authorized cooperative operator assisting that farmer, can:

1. Link a season to a farm and enter their own crop, area, planting/harvest dates and expected harvest.
2. Reserve part of that expectation for household use; enter their expected selling price and planned costs, including contingency.
3. See projected cash margin and break-even price based on those assumptions. Nothing supplies an AI-guessed yield, planting date or promised price.
4. Record harvested quantity, actual costs, sale quantity/value and money reportedly received.
5. Compare the plan with the entered record. Missing actual costs remain visibly different from recorded zero cost.

Calculations use whole UGX totals. Planned revenue is `(expected harvest − household reserve) × expected price`; planned cash margin subtracts planned costs and contingency. Break-even price rounds up the planned cost divided by saleable quantity. With no saleable quantity, break-even is unavailable. Recorded cash balance is money reportedly received minus entered actual costs; it is incomplete when costs remain missing.

This is not a payment processor, audited ledger, tax report, credit score or investment recommendation. Sale entries do not automatically reconcile a separate harvest lot or prove money moved. No financial or private farm records are exposed in the unauthenticated USSD menu.

## Workflow 2: harvest evidence into a buyer collection

1. Record a whole harvest lot against its farmer's farm and, optionally, season. Quantity, harvest date, storage location, bag count and any measured moisture result are explicit entries.
2. A staff member reviews the lot. Acceptance is labelled an internal quality decision with reviewer, time and limitations; a moisture value does not establish food safety, absence of aflatoxin, grade or export eligibility.
3. The cooperative creates a buyer collection with a target quantity, proposed price, destination and pickup details. Only accepted, matching-crop lots can be allocated.
4. The database prevents the same whole lot being pledged to multiple collections. Changes to an allocated lot are blocked. A material change to an unallocated lot removes its prior acceptance unless staff explicitly re-review it.
5. Confirmation requires enough allocated supply. Confirmed commercial terms and lots cannot be silently changed. Cancellation releases stock; dispatch is final and retains the commitment. The historical manifest preserves quantities and review metadata even if a cancelled lot later changes.

This provides coordination and traceability inside one organization. It does not guarantee physical custody, actual stock availability, buyer demand, pickup, border clearance, delivery acceptance or settlement. Staff must reconcile physical stock and separate sale records before committing it. Partial-lot splitting, warehouse receipts, independent laboratory verification and external inventory reconciliation remain future work.

## Start where connectivity is weakest

The assisted-service path matters as much as the web form: a person requests one callback through USSD; an assigned operator records the plan or lot against the correct farmer while assisting them. Phone-first account provisioning does not require an email address. A shared handset should not keep private cooperative financial or contact records cached.

USSD and SMS still need network service and a provisioned carrier/gateway. No channel solves an area with no coverage. Use scheduled cooperative visits or locally recorded paper notes with later authorized entry there. Current USSD supports public information, consent withdrawal and a confirmed callback request, not authenticated financial entry. Voice and local-language services require operational provisioning and field-tested translations; they are not claimed live.

## Honest pilot and release gates

Pilot the workflows with a small number of cooperatives and crops before expanding. Establish a baseline and follow complete seasons. Track recorded actual-cost completeness, pending callback age, accepted/rejected lots, documented quality issues, distinct contributing farmers, dispatched quantities, buyer acceptance and independently checked receipts. Do not treat planning totals or demo data as achieved outcomes.

Research supports the problem and product direction, not an income forecast. Evaluating attributable impact needs an appropriate comparison design, representative recruitment and attention to who is excluded. Administrative records alone can overstate adoption and miss farmers without devices, literacy, membership or transport.

Release prerequisites include agronomist-reviewed local content; staff ownership of callbacks and quality review; current buyer and export requirements; privacy/consent processes; tested telecom delivery; secure managed PostgreSQL and backups; and concurrency/load tests against that actual deployment. This repository is neither SOC 2 certified nor a nationwide operating service.
