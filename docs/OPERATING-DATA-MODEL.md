# CrewSync Operating Data Model — Source of Truth Audit

Before Company Operating Core V1 added any company-wide view, every major
business concept in the app was audited here: where it's actually stored,
who's allowed to create/change it, everything downstream that reads it, and
whether it's live data or an intentional point-in-time snapshot. This is
what let the Company Command Center, Portfolio, Financials, Resources,
Field, and Pipeline views get built as **read layers over existing
records** — nothing in this document produces a new number that didn't
already have exactly one home.

Keep this current. When a new business concept gets a home, add it here in
the same shape before wiring a second consumer to it.

---

### Opportunity (the bid pipeline)

- **Source of truth:** `Opportunity` (`prisma/schema.prisma`) — the front
  door, before there's a real project. Deliberately a separate, lightweight
  entity from `Job`, not an early project stage: a healthy GC loses more
  bids than it wins, and every lost one would otherwise burn a `jobNumber`
  and a Command Center for a project that never happened.
- **Created by:** `lib/opportunity-actions.ts` (`createOpportunity`).
  `OpportunityCostCode` (the pre-award estimate lines) is deliberately
  parallel to `JobCostCode`, not a shared table — `JobCostCode`'s shape and
  every query built on it already assumes a real, awarded `Job`.
- **Updated by:** `updateOpportunity` (fields; stage only moves within
  `OPPORTUNITY`/`BIDDING`/`SUBMITTED` there), `markOpportunityLost` (stage
  → `LOST`/`NO_BID`), or `awardProject` (stage → `WON`, `wonJobId` set) —
  each stage transition has exactly one place it happens, the same rule
  `Job.stage` follows.
- **Consumed by:** the Pipeline (`/opportunities`), win-rate reporting
  (`lib/opportunities.ts`'s `getWinRateReport` — Historical Intelligence),
  Company Command's pipeline tile, global search.
- **Live or snapshot:** live while open; a decided (`WON`/`LOST`/`NO_BID`)
  opportunity's own fields stop changing but it stays queryable forever —
  win-rate history must never shrink just because a bid is old.
- **Finding:** the moment it's `WON`, an opportunity's title/customer/
  estimated value/project type/bid lines flow into the *existing* Award
  form (`app/jobs/new/page.tsx`'s `?opportunityId=` prefill) instead of a
  second job-creation code path — `awardProject` is still the only place a
  `Job` is ever created, exactly as it already was documented below.

### Project

- **Source of truth:** `Job` (`prisma/schema.prisma`).
- **Created by:** `lib/award-actions.ts` (`awardProject`) — the one-pass
  Award flow, whether reached directly or via a won Opportunity. No other
  path creates a `Job`.
- **Updated by:** `lib/command-center-actions.ts` (`updateJobCommandCenter`)
  — contract value, PM, foreman, division, dates, stage, project type,
  punch-list/docs flags. All other job-adjacent writes (materials, change
  orders, daily reports, ...) update their own child records, never `Job`
  fields directly.
- **Consumed by:** literally everything else in this document.
- **Live or snapshot:** live.

### Customer

- **Source of truth:** `Customer`.
- **Created by:** `/customers/new`, or inline at Award time
  (`newCustomerName` on the Award form creates one if no existing customer
  is selected).
- **Updated by:** no edit UI exists yet (create-only today).
- **Consumed by:** `Job.customerId`, shown on Command Center, Portfolio.
- **Live or snapshot:** live.

### Contract & Schedule of Values

- **Source of truth:** `Contract` (1:1 with `Job`) + `ContractLine` — the
  owner-facing billing breakdown, `docs/ARCHITECTURE.md` §3.4's design,
  built. `Job.contractValue` still exists as the frozen number entered at
  Award — never rewritten afterward, kept purely as the historical
  "originally awarded" baseline `lib/company-financials.ts` and
  `lib/project-health.ts` already reported before this phase.
- **Deliberately not the same list as cost codes** — a cost code tracks
  internal cost; an SOV line like "10% Mobilization" is billed to the owner
  and has no cost-code equivalent. Two real, different lists, same
  reasoning as "Crew assignment vs. worker assignment" below.
- **Created by:** `lib/award-actions.ts` (`awardProject`) — every newly
  awarded job with a contract value gets a `Contract` and one starting SOV
  line (`"{title} — original contract"`) automatically, no second setup
  step. `lib/contract-actions.ts`'s `addContractLine` splits or extends it
  by hand afterward (e.g. into Mobilization/Construction/Closeout).
- **Updated by:** three places, each with exactly one job —
  `lib/contract-actions.ts` (`updateContract` for type/retainage/executed
  date, `addContractLine`/`deleteContractLine` for manual SOV lines) and
  `lib/change-order-actions.ts` (`updateChangeOrder`), which upserts a
  `ContractLine` tagged `sourceChangeOrderId` the moment a `ChangeOrder` is
  approved — and deletes it again if the change order is un-approved before
  anything has been billed against it. The SOV can never drift out of sync
  with approved change work because nothing else is allowed to touch a
  CO-sourced line.
- **Derived, not typed:** *current* contract value
  (`costing.contractValue` in `lib/job-costing.ts`) =
  `sum(Contract.lines.scheduledValue)` when a job has a real `Contract` —
  the same "compute, don't type" upgrade `Invoice.amount` got below.
  Falls back to `Job.contractValue + sum(approved ChangeOrder.revenueAmount)`
  only for the handful of minimal historical-anchor seed jobs that were
  never given a real `Contract` (they exist purely to feed estimating
  history, not to be billed).
- **Consumed by:** `lib/job-costing.ts`, `lib/project-health.ts`, `lib/billing.ts`
  (the over-billing check below), the Company Command Center, Portfolio,
  and Financials rollups — none of them changed how they read
  `costing.contractValue`, only what feeds it did.
- **Live or snapshot:** live.

### Project stage

- **Source of truth:** `Job.stage` (`ProjectStage` enum).
- **Updated by:** `lib/command-center-actions.ts`, the only write path —
  every stage-triggered automation (checklist generation, and the
  estimate/actual loop's benchmark recording on reaching `COMPLETE`) fires
  from that single Server Action.
- **Consumed by:** checklist generation (`lib/checklist.ts`), billing
  readiness, benchmark recording (`lib/productivity-benchmarks.ts`),
  Command Center, Portfolio, Company Command's stage-bucket counts.
- **Live or snapshot:** live.

### Project type

- **Source of truth:** `Job.projectType` (free text, added for the
  estimate/actual loop).
- **Updated by:** Award form, Command Center edit form.
- **Consumed by:** historical-productivity/estimating-accuracy filters
  (`lib/productivity-benchmarks.ts`), now Portfolio filtering.
- **Live or snapshot:** live.

### PM / Foreman

- **Source of truth:** `Job.pmUserId` (→ `User`) / `Job.foremanWorkerId`
  (→ `Worker`) — **two different tables**, not a naming inconsistency:
  `User` is a login account, `Worker` is a schedulable crew member, and a
  PM is assumed to be an office role (`User`) while a foreman is a field
  role tracked the same way any other crew member is (`Worker`).
- **Finding, addressed this phase:** until now there was no link between a
  `User` who logs in as `FOREMAN` and the `Worker` record that's actually
  assigned to jobs — the seed's foreman login and the seed's foreman
  *Worker* were namesake-only, unconnected rows. Added `Worker.userId`
  (nullable, unique) this phase specifically so a signed-in foreman's
  "today" home can be their real assignment, not a guess. See
  `prisma/migrations/20260830100000_worker_user_link/`.
- **Consumed by:** Command Center, Portfolio, Company Command's resource
  rollup, the new Field/foreman home.

### Crew assignment vs. worker assignment — two real, different concepts

- **`JobAssignment`** — the *roster*: this worker is formally on this job
  (long-lived, not date-specific). Created at Award time from the checked
  worker list, editable nowhere else today.
- **`ScheduleAssignment`** — the *day grid*: this worker works this job on
  this specific date. Created by `lib/schedule-actions.ts`, one row per
  worker per date, DB-unique per `(workerId, date)` so nobody can be
  double-booked across two jobs the same day.
- **Not duplication — an intentional pair.** `CREW_CONFLICT`
  (`lib/alerts.ts`) exists specifically to catch when these two disagree
  (someone on the schedule board for a job they're not formally assigned
  to). Collapsing them would delete the check they make possible. The new
  Company Resource Command (§ below) reads both, on purpose, the same way
  the existing per-job Command Center already does.

### Cost code

- **Source of truth:** `CostCode` — a company-wide master list (code,
  description, unit). Created at `/cost-codes/new`. Never job-specific.
- **Consumed by:** `JobCostCode` (a job's use of it), `CostCodeBenchmark`
  (its history), the accounting GL mapping.

### Estimated quantity / estimated hours

- **Source of truth:** `JobCostCode.estimatedQty` /
  `JobCostCode.estimatedHours` — the budget line, one row per
  `(jobId, costCodeId)`.
- **Created by:** Award form, or `/jobs/[id]/cost-codes/new` (with the
  historical-rate panel now assisting the number, not overriding it).
- **Updated by:** no edit path exists once created — matches this app's
  general "the estimate is what it is; if it's wrong, that's what the
  benchmark is for" stance. CSV import creates new lines, doesn't edit
  existing ones.

### Actual hours / actual quantity / production rate

- **Source of truth:** none directly — **intentionally derived**, live,
  every read, from `ProductionEntry` rows via `computeProgress()`
  (`lib/productivity.ts`). `ProductionEntry` itself is written exactly
  once per `(jobCostCodeId, dailyReportId)` by
  `lib/daily-report-actions.ts` — a foreman's daily report is the only
  place hours/quantity get entered, resubmitting the same date's report
  updates the existing entry rather than adding a second one.
- **Consumed by:** productivity status per line, `lib/job-costing.ts`
  (actual/projected labor cost), `lib/project-health.ts`, now Company
  Command's labor rollup and Portfolio's actual/projected labor columns.
- **Finding:** this is the reference example for "one fact, one place" in
  the whole app — nothing proposed this phase stores actual hours a
  second time anywhere; every new company-wide number re-derives it the
  same way `lib/job-costing.ts` already does.

### Material request

- **Source of truth:** `MaterialRequest` — full status lifecycle
  (`REQUESTED→APPROVED→PO_ISSUED→ORDERED→RECEIVED`).
- **Created by:** a PM directly, or automatically from a daily report's
  "material needed" field (`lib/daily-report-actions.ts`) — the same
  no-duplicate-entry rule as production.
- **Consumed by:** job costing (committed/actual material cost), billing
  readiness, alerts (`MATERIAL_RISK`), Field activity, Company Command's
  material-risk bucket, the Vendor directory's material-spend rollup, and
  now `lib/cash.ts`'s AP aging.
- **Finding (prior phase):** `vendor` used to be a free-text string, typed
  fresh on every request with no guarantee two PMs spelled the same
  supplier the same way. It's now `vendorId`, a real FK to `Vendor` — see
  below.
- **Finding (this phase):** `receivedDate` meant "this cost is real" for
  job costing, but nothing distinguished "received and paid" from
  "received and still owed" — the same field was being asked to answer
  two different questions. Added `paidDate` (nullable, same "unset =
  hasn't happened" shape as every other date on this model): a `RECEIVED`
  row with `totalCost` set and `paidDate` still null is real outstanding
  AP; setting `paidDate` (a checkbox-equivalent date input next to
  "Received" on the materials page) is the whole "mark this bill paid"
  action — no separate flow.

### Vendor

- **Source of truth:** `Vendor` — name, trade, contact info. A genuine
  tenant-root model (own `companyId`, like `Customer`/`CostCode`), not a
  child of anything.
- **Created by:** `/vendors/new` directly, or inline the moment someone
  types a new name on the material-request, subcontract, or Award forms
  (`lib/vendors.ts`'s `resolveOrCreateVendorId` finds-or-creates by name —
  the same inline-create pattern the Award form already used for a new
  `Customer`). No second "go create the vendor first" trip.
- **Consumed by:** `MaterialRequest.vendorId`, `Subcontract.vendorId`, the
  `/vendors` directory (committed/actual spend and job count computed live
  across both, never stored), `lib/alerts.ts`'s `COI_EXPIRED` check, global
  search.
- **Live or snapshot:** live — a vendor's own record can be edited
  (trade/contact info) without touching any commitment already tied to it.
- **Migration note:** the free-text `vendor` strings on `MaterialRequest`
  and `SubcontractorCost` were backfilled into real `Vendor` rows (one per
  distinct name per company) in the same migration that added the FK
  columns, then the string columns were dropped — nullable-column →
  backfill → drop, the same non-destructive shape `Job.jobNumber`'s
  migration used earlier in this project. Every pre-existing commitment
  still points at a real vendor after the migration; nothing was silently
  orphaned.

### Subcontract (formerly SubcontractorCost — promoted into a real agreement)

- **Source of truth:** `Subcontract` — committed vs. actual dollars (as
  before), plus what's genuinely new: `agreementStatus`
  (`DRAFT`/`EXECUTED`/`CLOSED` — has this actually been signed yet?),
  `retainagePct`, and `coiExpirationDate`.
- **Two independent status tracks, both real:** `status` is billing/payment
  progress (committed only, invoiced, paid); `agreementStatus` is the
  contract's own lifecycle. A subcontract can be fully `EXECUTED` while
  still only `COMMITTED` (nothing invoiced yet), or `CLOSED` while still
  being paid down — these are different facts, deliberately not merged
  into one status field.
- **Created by:** `lib/subcontract-actions.ts`'s `createSubcontract`
  (`/jobs/[id]/subcontracts/new`) directly, or by `lib/award-actions.ts`
  for an initial subcontractor row entered at Award time (started
  `EXECUTED` there — a committed cost entered at Award already implies an
  agreed scope, not a draft).
- **Updated by:** `updateSubcontract` — billing status, agreement status,
  actual amount, COI expiration date. Executing it for the first time
  (`agreementStatus` → `EXECUTED`) records `executedDate` automatically;
  never a separate typed field.
- **Consumed by:** job costing (committed/actual subcontractor cost,
  unchanged), the Vendor directory, and — the genuinely new consumer —
  `lib/alerts.ts`'s `COI_EXPIRED` check: an `EXECUTED` subcontract on a
  still-open job whose certificate of insurance has lapsed or is about to
  is a real compliance/liability gap, not a decorative field. A `DRAFT`
  agreement (work hasn't started) or `CLOSED` one (already done) doesn't
  trigger it.
- **Live or snapshot:** live.

### Equipment assignment

- **Source of truth:** `EquipmentAssignment` (planned + actual
  pickup/return dates). Overlap-checked at creation
  (`lib/equipment-actions.ts`).
- **Consumed by:** job costing (committed vs. actual equipment cost),
  alerts (`EQUIPMENT_ISSUE`, from a daily report's equipment-issue field —
  note this is a *separate* fact from `EquipmentAssignment` itself: an
  assignment conflict and a field-reported equipment problem are different
  things, correctly not merged), now Company Resource Command.

### Change condition vs. change order — sequential, not duplicate

- **Change condition:** a fact captured on a `DailyReport`
  (`hasChangeCondition`/`changeConditionNotes`) — what the foreman
  observed in the field.
- **Change order:** `ChangeOrder`, auto-created `IDENTIFIED` the moment a
  change condition is flagged (`lib/daily-report-actions.ts`), then priced
  and approved by a PM (`lib/change-order-actions.ts`).
- **Not two copies of the same fact** — the daily report is the origin
  event, the change order is the priced/approved business object it turns
  into. Approving one updates `ChangeOrder.status`/`revenueAmount`/
  `costAmount`, which is what `lib/job-costing.ts` reads — the daily
  report's own text is never re-read for cost.
- **Consumed by:** job costing (current contract value, change-order
  cost), billing readiness, alerts (`UNAPPROVED_CHANGE_WORK`), now Company
  Command's change-order exposure figure.

### Job cost / projected final cost / projected margin

- **Source of truth:** none stored — fully computed, every read, by
  `getJobCosting()` (`lib/job-costing.ts`) from `JobBudget`,
  `JobCostCode`+`ProductionEntry`, `MaterialRequest`,
  `EquipmentAssignment`, `Subcontract`, `ChangeOrder`, `Invoice`.
- **Consumed by:** Command Center, `lib/project-health.ts`, now every
  company-wide financial view in this phase (Command Center rollup,
  Portfolio, Financials) — all of them call the same `getJobCosting()`
  per job rather than recomputing any of this independently.
- **Finding (integration pass):** `JobBudget.estimatedAmount` per category
  is typed once on the Award form, but LABOR's estimate was a raw dollar
  guess with zero connection to the cost-code `estimatedHours` rows
  entered on that same form — the same estimating intent expressed twice,
  in two different units, with nothing tying them together. The Award
  form (`app/jobs/new/award-form.tsx`) now suggests the Labor budget live
  as `sum(cost-code estimatedHours) × company-average active-worker
  $/hr` — applied automatically, edit the field to override — so the PM
  isn't asked to separately guess a number the app can already derive.
  MATERIAL/EQUIPMENT/SUBCONTRACTOR budgets stay independently typed on
  purpose: unlike LABOR, they have their own initial-commitment rows on
  the same form (materials/equipment/subs), but a category budget is
  meant to be the full-project cap, not just what's entered at Award —
  deriving it from the initial rows alone would understate it.

### Billing readiness

- **Source of truth:** none stored — computed by `getBillingReadiness()`
  (`lib/billing.ts`) from `Job.stage`, `ChangeOrder`, `DailyReport`,
  `MaterialRequest`, `Subcontract`, `Job.punchListComplete`/
  `requiredDocsComplete`, and now `Contract`/`ContractLine`/`InvoiceLine`
  for the "no SOV line billed past its scheduled value" check — re-derived
  from the raw `InvoiceLine` rows rather than trusted, even though
  `createPayApplication` already refuses to create an over-100%-complete
  line in the first place.
- **Consumed by:** Command Center, the Company Financial View's
  billing-ready/blocked rollup.

### Invoice / pay application

- **Source of truth:** `Invoice` + `InvoiceLine` — a real pay application,
  one `InvoiceLine` per `ContractLine` billed that period, the AIA
  G702/G703 pattern (this period's % complete, amount earned, retainage
  withheld). "Billed to date" everywhere in the app is still
  `sum(SENT + PAID Invoice.amount)`, but that `amount` is now itself
  computed — `sum(InvoiceLine.amountThisPeriod) - sum(InvoiceLine.retainageWithheld)`
  — instead of typed in directly, the same upgrade `contractValue` got
  above. A SOV line's own "billed to date" (shown on the contract and
  invoices pages) is `sum(its InvoiceLine.amountThisPeriod)` — gross earned
  value, not net of retainage, since retainage is cash withheld from
  payment, not a discount on progress.
- **Created by:** `lib/invoice-actions.ts`'s `createPayApplication`
  (`/jobs/[id]/invoices/new`), gated (in the UI, not enforced server-side
  beyond role) behind billing readiness. Requires a `Contract` with at
  least one SOV line to exist first — every job Awarded with a contract
  value has one automatically.
- **Consumed by:** job costing, the Company Financial View's invoiced
  rollup, the contract page's per-line billed-to-date/remaining.
- **Deliberately out of scope this phase:** retainage *release* — the
  final billing event that pays out what was withheld across the whole
  job — isn't modeled. `docs/ARCHITECTURE.md`'s Phase 3 (Closeout
  maturity) is the right eventual home for that prompt; every seeded job
  that's fully closed out and paid was given 0% retainage instead, so the
  "fully paid, fully closed" demo state stays honest without faking a
  release event that doesn't exist yet.

### Cash

- **Source of truth:** none — a pure computed rollup, `lib/cash.ts`, over
  rows that already exist: `Invoice`/`InvoiceLine` for AR,
  `Subcontract`/`MaterialRequest` for AP. No new ledger, same
  "consolidated fetch, computed once" pattern as `lib/project-health.ts`
  and `lib/company-financials.ts`, scaled to company level.
- **AR aging:** every `SENT` (billed, not yet `PAID`) `Invoice`, aged from
  `invoice.date`, bucketed 0-30/31-60/61-90/90+.
- **AP aging:** two sources, same four buckets. `Subcontract` rows with
  `status: INVOICED`, aged from `executedDate ?? createdAt` —
  deliberately not `createdAt` alone, which for most rows is "whenever the
  agreement was entered," not when the bill actually came in.
  `MaterialRequest` rows with `status: RECEIVED`, a real `totalCost`, and
  `paidDate` still null, aged from `receivedDate ?? createdAt`.
- **Retainage summary:** `heldByOwner` —
  `sum(InvoiceLine.retainageWithheld)` across `SENT`/`PAID` invoices, what
  the owner hasn't released back to us yet. `heldFromSubs` —
  `sum(actualAmount * retainagePct)` across `INVOICED`/`PAID`
  subcontracts, what we're holding back from subs on work already billed.
  Neither is a release schedule — retainage release stays unmodeled (see
  §Invoice / pay application below).
- **Forecast:** 8 weeks by default, `expectedIn`/`expectedOut` per week,
  built on one explicit, labeled simplification — each outstanding AR/AP
  row is assumed to collect/pay on a Net-30 basis from its own aging
  anchor. A row already past that 30-day mark reports as overdue instead
  of landing in a future week. Not schedule-driven (that would need
  `SchedulePhase`-level target billing dates, which don't exist — §3.6 of
  `docs/ARCHITECTURE.md` is still Partial); real math over real
  outstanding rows, not a fabricated curve.
- **Tenant scoping note:** `Invoice`/`Subcontract`/`MaterialRequest` are
  child records with no `companyId` of their own (see `lib/tenant.ts`), so
  a company-wide query needs an explicit `jobId: { in: scopedJobIds }`
  filter — `lib/cash.ts` fetches the company's own job ids first via the
  scoped client, then filters every child-model query by that set, the
  same pattern `lib/company-command.ts` already uses for its company-wide
  invoice sum.
- **Consumed by:** `/cash` (aging tables, retainage summary, forecast),
  the Company Command Center's AR/AP/net-position tile group.

### Historical productivity vs. estimating benchmark — snapshot feeding a live query, not duplication

- **`CostCodeBenchmark`** is the snapshot: one row per `(jobId,
  costCodeId)`, written once, automatically, the moment a job reaches
  `COMPLETE` (`lib/productivity-benchmarks.ts`'s
  `recordBenchmarksForCompletedJob`, called from
  `lib/command-center-actions.ts`). Deliberately not live — an in-progress
  job's partial numbers must not dilute the historical rate the next
  estimate gets compared against.
- **"Historical productivity"** (`/cost-codes`) and the company/recent/
  recommended rate panels are live queries **over** that snapshot table —
  `getFilteredHistoricalProductivity`/`getAllCostCodeRatesMap`/
  `getEstimatingAccuracy`, all in the same file. There is exactly one
  stored fact (`CostCodeBenchmark`) and several live views of it — this is
  the pattern every other "company rollup" in this phase follows.

---

## What this audit changed

One real gap, fixed: **`Worker.userId`** (§ PM/Foreman above) — genuinely
missing plumbing, not a new abstraction; without it, a personalized
Foreman home would have had to fake "today's assignment" instead of
reading it.

Everything else in this document was already a single source of truth
with a clean read path. **No other new tables were added** to build the
Company Operating Core — every company-wide view in that phase is a new
*query* over data that already had exactly one home, following the same
shape `getJobCosting`/`getProjectHealth`/`getAlerts` already established
per job, scaled to the whole company.

**Pipeline phase (Opportunity → Bid → Estimate → Award):** two new tables
this time, `Opportunity` and `OpportunityCostCode` — a genuinely new
business concept (what's being chased before it's a real project), not a
duplicate of anything above. Both are documented in full under
§ Opportunity. The win here is the same shape as `Worker.userId`: the
Award form already existed, so a won opportunity's data flows into it
through the same `?opportunityId=` prefill rather than a second
job-creation path.

**Contract / Schedule of Values / Billing phase:** three new tables —
`Contract`, `ContractLine`, `InvoiceLine` — replacing what
`docs/ARCHITECTURE.md` §3.4/§3.12 had flagged as the flat `contractValue`
field's and typed-`Invoice.amount`'s remaining "compute, don't type" gaps.
Nothing about how the rest of the app *reads* current contract value or
billed-to-date changed — `getJobCosting()` and `Invoice.amount` are still
exactly the fields every downstream consumer already read; only what feeds
them stopped being manually typed. The one new automation this phase adds
(a `ChangeOrder`'s approval creating and un-creating its own `ContractLine`)
follows the same "one write path per fact" rule as every stage transition
in this document.

**Procurement phase (Vendor / Subcontract):** one new table — `Vendor` —
plus `SubcontractorCost` promoted (renamed, in place, existing rows
preserved) into `Subcontract` with a real agreement lifecycle and COI
compliance field. This is the flip side of the Contract/SOV phase's
pattern: instead of a flat field being replaced by a computed rollup, a
*free-text string* (`vendor`) is replaced by a real record with its own
identity, so "how much have we committed to this vendor across every job"
and "is anyone's insurance about to lapse" become real queries instead of
a string-matching exercise. Both `MaterialRequest.vendor` and
`SubcontractorCost.vendor` pointed at the same missing entity — one
`Vendor` table serves both, not two parallel ones.
