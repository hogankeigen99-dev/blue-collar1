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

### Contract value

- **Source of truth (today):** `Job.contractValue` — a single field, set at
  Award and editable on the Command Center edit form.
- **Derived, not stored:** *current* contract value (`costing.contractValue`
  in `lib/job-costing.ts`) = `Job.contractValue + sum(approved
  ChangeOrder.revenueAmount)`. The Command Center shows both the original
  (`Job.contractValue`) and the derived current figure — this is correct,
  not duplication: one is the signed number, the other is what it computes
  to today.
- **Consumed by:** `lib/job-costing.ts`, `lib/project-health.ts`, billing
  readiness is gated near it, now the Company Command Center and Portfolio
  financial rollups.
- **Finding:** a real `Contract`/Schedule-of-Values entity (proposed in
  `docs/ARCHITECTURE.md` §3.4) is still the right eventual home for
  contract *type*/retainage/SOV — out of scope for this phase, which reads
  `Job.contractValue` + change orders exactly as every existing page
  already does. No new field added here.

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
  readiness, alerts (`MATERIAL_RISK`), now Field activity and Company
  Command's material-risk bucket.

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
  `EquipmentAssignment`, `SubcontractorCost`, `ChangeOrder`, `Invoice`.
- **Consumed by:** Command Center, `lib/project-health.ts`, now every
  company-wide financial view in this phase (Command Center rollup,
  Portfolio, Financials) — all of them call the same `getJobCosting()`
  per job rather than recomputing any of this independently.

### Billing readiness

- **Source of truth:** none stored — computed by `getBillingReadiness()`
  (`lib/billing.ts`) from `Job.stage`, `ChangeOrder`, `DailyReport`,
  `MaterialRequest`, `SubcontractorCost`, `Job.punchListComplete`/
  `requiredDocsComplete`.
- **Consumed by:** Command Center, now the Company Financial View's
  billing-ready/blocked rollup.

### Invoice

- **Source of truth:** `Invoice` — real records (number, amount, date,
  status). "Billed to date" everywhere in the app is
  `sum(SENT + PAID Invoice.amount)`, never a typed total.
- **Created by:** `/jobs/[id]/invoices/new`, gated (in the UI, not
  enforced server-side beyond role) behind billing readiness.
- **Consumed by:** job costing, now Company Financial View's invoiced
  rollup.

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
