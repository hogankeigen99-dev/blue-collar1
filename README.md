# CrewSync — Company Operating System

An operating system for a self-performing GC, not a collection of separate
point-solution modules: one connected record of a project from the bid that
won it through the field work, the cost, the billing, and what it teaches
the next estimate — plus a company-wide layer (Command Center, Portfolio,
Financials, Resource view) built entirely as read layers over those same
records, never a second copy of a fact for a dashboard's sake. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full company
lifecycle this is built toward, and
[`docs/OPERATING-DATA-MODEL.md`](docs/OPERATING-DATA-MODEL.md) for exactly
where every business fact actually lives.

## Primary use case: the 5–10 day, 1–2 crew small project

CrewSync's current focus is a single workflow, built to work correctly end
to end rather than sketch a lot of separate features: **taking a small
(5–10 day, 1–2 crew) project from award through closeout as one operational
home**, with no duplicate data entry between the field, PM, scheduling,
materials/equipment, job costing, change management, billing readiness, and
accounting.

- **Award a project in one pass** (`/jobs/new`, `lib/award-actions.ts`):
  customer, location, contract value/type/retainage, budget by category,
  cost codes, PM, foreman, crew, start/target-completion dates, and any
  known initial materials/equipment/subcontractors are all captured in a
  single form. That one submit auto-generates the project's `jobNumber`,
  its PRECON startup checklist (`lib/checklist.ts`), a real `Contract` with
  one starting Schedule of Values line for the entered contract value
  (`/jobs/[id]/contract` — see "Contract, Schedule of Values & billing"
  below), and the crew's day-by-day schedule for the project's date range
  (`ScheduleAssignment` rows) alongside their formal job assignment — so
  the crew and the schedule board start in sync instead of being entered
  twice and drifting apart (the gap the `CREW_CONFLICT` alert exists to
  catch). Reached directly, or pre-filled from a won opportunity
  (`/jobs/new?opportunityId=…` — see "Company Operating Core" below) —
  same form, same one submit, either way.
- **The job Command Center is the single operational home**
  (`/jobs/[id]`, data from `lib/project-health.ts`): project number,
  customer, location, contract value, PM, foreman, crew, current stage,
  start/planned-completion dates, current day of project, **Schedule %**
  (time elapsed ÷ planned duration) and **Production %** (actual quantity ÷
  estimated quantity — a genuinely different number, computed and labeled
  separately, not the same figure under two names), estimated/actual labor
  hours and cost with variance, material/equipment/subcontractor
  budget-vs-actual, approved change orders, current contract value (linked
  to its Schedule of Values), projected final cost/gross profit/margin,
  billing readiness, and current exceptions — all on one page, meant to be
  readable in about 10 seconds.
- **One daily report is the foreman's entire day — nothing entered twice.**
  `/jobs/[id]/daily-reports/new` (`lib/daily-report-actions.ts`) is the only
  place hours, quantity, materials, equipment problems, and change
  conditions are entered; there is no separate "log production" screen.
  One submission:
  - writes labor/quantity straight to `ProductionEntry` for each cost code
    worked that day (resubmitting the same date replaces those entries
    rather than adding to them), which is what actual labor hours/cost,
    Schedule %/Production %, job costing, projected margin, and the labor-
    overrun alert all read from — automatically, with no separate cost entry;
  - opens a `MaterialRequest` from a "material needed" note, instead of a PM
    having to notice the note and re-key it;
  - opens a pending `ChangeOrder` from a flagged change condition, instead of
    a flag someone has to remember to act on;
  - surfaces an equipment problem as a live PM exception.
- **The Company Action Center** (`/today`, `lib/pm-daily-command.ts`) is the
  start-of-day view across every job: for each open exception, what it is,
  why it matters, the impact of leaving it, what to do about it, who owns
  it, and when it's due — not just a bare alert list. (`/alerts` used to be
  a second, thinner page over the same scan; it now redirects here instead
  of maintaining two views of the same data.)
- **Exceptions are computed, not manually flagged** (`lib/alerts.ts`):
  labor overruns, schedule risk, missing field reports, material risk, crew
  conflicts, unapproved change work, billing blockers, margin risk, and
  equipment issues are all derived from the same underlying field/cost
  data — company-wide at `/today`, or scoped to one job (`getJobAlerts`) on
  its Command Center.
- **Two realistic demo projects** ship in the seed data (`prisma/seed.ts`).
  "Sunrise Duplex — Foundation & Slab" is seeded mid-stream (today is day 5
  of 7) with real daily reports — a labor slip, a material shortage and its
  recovery, a field-flagged change condition, and a fresh equipment issue —
  so a fresh seed immediately shows live, computed exceptions on the
  Command Center and `/today`, not an empty or hand-scripted screen. "Cedar
  Court — Patio & Walkway Slab" is the same story already closed out on
  fixed dates: a labor slip and a material shortage that both recover, a
  change condition that gets priced and approved, and billing readiness
  actually reaching "ready to invoice" with a paid invoice — so the
  *positive* outcome of the workflow is visible too, not only jobs still in
  trouble.

This workflow is covered by a real, checked-in Playwright E2E suite
(`tests/e2e/`, `npm run test:e2e`) — award → setup → schedule → mobilize →
daily field update → job cost auto-update → exception detection → change
order (field-flagged → priced → approved, contract value updates) →
materials (auto-request → received) → completion → billing ready → invoice
→ closeout, plus dedicated coverage that one report submission drives
labor/materials/change-orders/exceptions with no duplicate entry, and that
`/today` answers all six Action Center questions for a real exception.

## Company Operating Core

Everything below is a **read layer** over the records the workflow above
already writes — none of it is a second place to enter the same fact.
`docs/OPERATING-DATA-MODEL.md` is the audit that made this a rule rather
than a hope: before any of these were built, every major business concept
was traced to its one source of truth and everything that already reads
it, specifically so a company-wide number and the number on a project's own
Command Center are never two different calculations of the same thing.

- **Company Command Center** (`/`, `lib/company-command.ts`) — "how is the
  company doing right now," for ADMIN/PM: active-operations risk buckets
  (starting soon, nearing completion, behind schedule, labor/margin/
  material risk, equipment issues, unresolved change work), financial
  performance (original → approved COs → current contract, budget,
  committed/actual/projected cost, gross margin, billing-ready value,
  invoiced-to-date, open change-order exposure), labor (estimated/actual/
  projected hours, variance, a real productivity trend computed from the
  same `CostCodeBenchmark` snapshots the estimate/actual loop records — not
  a fabricated sparkline), and resources (crew utilization, equipment
  conflicts). Every tile is `getProjectHealth()`/`getJobCosting()` summed
  across every open job, and every tile links to where that sum came from.
  A FOREMAN account lands on `/field` instead — this page is a leadership
  view, not their home.
- **Pipeline** (`/opportunities`, `lib/opportunities.ts`) — Opportunity →
  Bid → Estimate → Award: what's out to bid, before it's a real project. An
  `Opportunity` is deliberately a separate, lightweight entity from `Job`
  (a healthy GC loses more bids than it wins, and every lost one would
  otherwise burn a `jobNumber` and a Command Center for a project that
  never happened); `OpportunityCostCode` bid lines get the exact same
  historical company/recent/recommended rate panel the Award form already
  shows for a real job. Winning it doesn't create a second job-creation
  code path — it opens `/jobs/new?opportunityId=…`, which prefills title,
  customer, contract value, project type, and every bid line into the same
  Award form every other project goes through; the opportunity is marked
  `WON` and linked to the resulting `Job` only once that Award actually
  submits, so an abandoned tab never falsely wins a bid. A loss (`LOST` or
  a deliberate `NO_BID`) stays queryable forever — win-rate reporting (by
  project type and by estimator/PM, on the pipeline page and as a
  Company Command tile) reads every decided bid a company has ever
  recorded, not a rolling window.
- **Contract, Schedule of Values & billing** (`/jobs/[id]/contract`,
  `/jobs/[id]/invoices`, `lib/contract.ts`/`lib/contract-actions.ts`) —
  the owner-facing billing breakdown, deliberately *not* the same list as
  cost codes (a cost code tracks internal cost; an SOV line like "10%
  Mobilization" is billed to the owner and has no cost-code equivalent).
  Award creates a real `Contract` (type, retainage) with one starting SOV
  line from the entered contract value; a PM can split it into more lines
  afterward. Current contract value everywhere in the app — Command
  Center, Portfolio, Financials — is now `sum(ContractLine.scheduledValue)`
  instead of a typed number. Approving a `ChangeOrder` adds a matching SOV
  line automatically (and removes it again if un-approved before it's been
  billed) — the SOV can't drift out of sync with approved change work.
  Billing itself is a real progress-billing pay application (the AIA
  G702/G703 pattern): enter this period's cumulative % complete per SOV
  line and the amount due and retainage withheld are computed live, not
  typed — `Invoice.amount` is `sum(InvoiceLine.amountThisPeriod) -
  sum(InvoiceLine.retainageWithheld)`, and billing readiness gained a "no
  SOV line billed past its scheduled value" check, re-derived from the raw
  billing records rather than trusted. Retainage *release* — the closeout
  event that pays out everything withheld — is now real, modeled as one
  more pay application: `lib/invoice-actions.ts`'s `releaseRetainage`
  (a "Release retainage" button on `/jobs/[id]/invoices`, gated to a job
  at Closeout/Complete) creates an `Invoice` whose lines carry zero new
  work and *negative* `retainageWithheld`, so the same computed-amount
  formula bills exactly what's owed back and `getRetainageSummary` nets
  itself to zero once that invoice is sent — no separate release flag.
- **Vendors & subcontracts** (`/vendors`, `lib/vendors.ts`) — a real
  vendor/subcontractor master record instead of a free-text name typed
  fresh on every material request or subcontractor line, so "how much have
  we committed to this vendor across every job" is a real query, not a
  string-matching exercise. Committed/actual spend and job count are
  computed live per vendor across `MaterialRequest` and `Subcontract`, the
  same "compute, don't store" pattern as job costing. A `Subcontract` is a
  real agreement now — its own lifecycle (`DRAFT`/`EXECUTED`/`CLOSED`),
  distinct from billing status (committed/invoiced/paid) — with
  certificate-of-insurance tracking that's wired to a real exception
  (`lib/alerts.ts`'s `COI_EXPIRED`: an executed subcontract on a still-open
  job whose COI has lapsed or is about to), not a dead field. A new vendor
  is found-or-created inline the moment its name is typed on the
  material-request, subcontract, or Award forms — the same pattern already
  used for a new `Customer` at Award time, no second "go create the
  vendor" trip. A subcontract's own retainage can be released once it's
  fully `PAID` (`lib/subcontract-actions.ts`'s `releaseSubcontractRetainage`,
  a button on `/jobs/[id]/subcontracts`) — unlike the owner-side release
  above, a subcontract has no line-item billing history to net against, so
  this sets `retainageReleasedAt` explicitly instead.
- **Cash** (`/cash`, `lib/cash.ts`) — company-wide AR/AP aging (0-30/
  31-60/61-90/90+), a retainage summary both directions, and an 8-week
  cash forecast, computed live over `Invoice`/`Subcontract`/
  `MaterialRequest` — no new ledger. AP aging ages a subcontract from its
  `executedDate` (not `createdAt`, which for most rows is just "when the
  agreement was entered") and a received material from `receivedDate`,
  filtering out anything already marked `paidDate` — a new field that
  finally distinguishes "received" (a real cost the moment it lands) from
  "paid" (off the books), set from a date input right next to "Received"
  on the materials page. The forecast is built on one explicit,
  documented simplification — Net-30 from each row's own aging date, not
  a schedule-driven projection, since `SchedulePhase`-level target billing
  dates don't exist yet. The Company Command Center carries an AR/AP/
  net-position tile group linking here. This section's own 61/90-day aging
  boundary now also drives `lib/alerts.ts`'s `AR_SEVERELY_OVERDUE`/
  `AP_SEVERELY_OVERDUE` exceptions — company Action Center and per-job
  Command Center, regardless of the job's stage (money owed doesn't stop
  mattering once a project is done).
- **Permit tracking** (`Job.permitNumber`/`permitIssuedDate`/
  `permitExpirationDate`, editable from a job's "Edit command center"
  form) — replaces the old checklist-only "Confirm permit set" checkbox
  with real structured data, and drives a `PERMIT_EXPIRED` exception the
  same way `COI_EXPIRED` already works: critical once lapsed, warning
  inside a 30-day lookahead, only on jobs that aren't done.
- **Bid packages** (`/jobs/[id]/bid-packages`, `lib/subbids.ts`) —
  subcontractor bid leveling: a scope of work goes out to multiple subs
  (`BidPackage`), each invited sub gets a real `Vendor` record
  (found-or-created inline, same pattern as everywhere else) and a
  `SubBid` — `INVITED` with no amount until a quote actually comes back,
  then `RECEIVED` with its own scope notes and exclusions so bids compare
  on what they actually cover, not dollar amount alone (the compare page
  sorts cheapest-first). Selecting a winner is one action:
  `lib/subbid-actions.ts`'s `selectSubBidWinner` marks it `SELECTED`,
  rejects every other still-open bid on the package, and creates a real
  `Subcontract` with the vendor and committed amount carried over —
  `sourceSubBidId` set, nothing re-typed — which flows straight into the
  existing job-cost forecast with zero new code there. Job-scoped, post-
  Award only, same scoping `Vendor`/`Subcontract` already use.
- **Project Portfolio** (`/projects`, `lib/portfolio.ts`) — one row per
  project, filterable by PM/foreman/project type/stage/risk, sortable, with
  the same columns the Command Center already computes per job (schedule %,
  production %, labor variance, projected final cost/margin, open
  change-order value, billing status). Clicking a row opens the existing
  job Command Center — there's no second, separate project detail page.
- **Company Financials** (`/financials`, `lib/company-financials.ts`) — the
  operating financial view before accounting closes the month: company
  totals through original → approved COs → current contract → budget →
  committed → actual → projected final cost → gross profit/margin, broken
  down by cost category, plus which projects are losing margin, projected
  over budget, or blocked from billing. PM/ADMIN only. Not a general-ledger
  replacement — `/accounting`'s GL-mapped CSV export and the Sage Intacct
  connector remain the accounting handoff.
- **Resource Command** (`/company/resources`, `lib/resources.ts`) — who's
  scheduled where today, who's available, where the schedule board and the
  formal crew roster disagree (the company-wide version of the
  `CREW_CONFLICT` check), which projects start soon and still have zero
  crew on the roster, and where every piece of equipment currently is.
  Aggregates the existing `ScheduleAssignment`/`JobAssignment`/
  `WorkerUnavailability`/`EquipmentAssignment` tables — no new scheduling
  system underneath it.
- **Field activity** (`/field`, `lib/field-activity.ts`) — for ADMIN/PM, a
  company-wide feed of recent daily reports with blockers/material-needs/
  equipment-issues/change-conditions flagged, filterable by job, so field
  reality doesn't require opening every project to see. **For a signed-in
  FOREMAN, this same route is their home**: their own assigned project(s)
  today, today's scheduled crew, the cost-code work plan with live
  estimated-vs-actual, and one-tap links to the daily update/materials/
  change orders — resolved from a real link between their login and their
  crew record (`Worker.userId`, added this phase — `User` and `Worker` were
  previously unconnected, so this is genuine new plumbing, not a new
  abstraction), not a guess or a generic list.
- **Global search** (`/search`, `lib/search.ts`) — one search box (in the
  nav for ADMIN/PM) across projects, opportunities, project/bid numbers,
  customers, workers, cost codes, change orders, material requests,
  equipment, and document titles. Plain case-insensitive `contains`
  queries against existing tables — no external search infrastructure.
- **Navigation is organized around how the company works, not the data
  model** — Command, Pipeline, Estimating, Action Center, Projects, Field,
  Schedule, Financials, Cash, Company (a hub for Resources/Workers/
  Customers/Equipment/Divisions), Settings — grouped by who actually uses
  each link day to day (Pipeline+Estimating adjacent for the estimator's
  world, Financials+Cash adjacent for accounting's) rather than
  alphabetically or one link per model. FOREMAN gets a deliberately short
  nav (Today, Schedule, sign out) — no executive/accounting/estimating
  complexity a foreman doesn't need.
- **Role-aware, not role-forked**: every view above reads the same company/
  project records regardless of who's looking — there's no separate
  "executive database" or "accounting copy." What differs by role is which
  views are reachable and what the root URL shows, not the underlying data.
- **Each persona lands somewhere that answers "what do I do right now,"
  not a menu to hunt through** — a pilot-readiness pass over the five
  named personas (Executive, PM, Estimator, Foreman, Accounting):
  - **Executive** (ADMIN): `/` — the company-wide Command Center, unchanged.
  - **PM**: `/` now redirects to `/today` as **My action center** —
    `lib/pm-daily-command.ts`'s `CommandItem` carries `pmUserId`, and the
    page filters to the signed-in PM's own jobs by default (`?all=1` opts
    into the full company-wide Action Center — what ADMIN always sees). The
    nav's "Command" link still reaches the full Company Command Center
    explicitly via `/?view=command`, the same escape hatch the redirect
    itself checks for.
  - **Estimator**: `/opportunities` (Pipeline) now opens with a "Needs
    attention" panel — bids due within 7 days, and open bids with no
    cost-code lines yet — computed from the same pipeline rows the table
    below already fetches, unfiltered by whatever the page's own filter
    widget is set to. Cross-linked to `/cost-codes` (historical rates) and
    back, so the two are one workspace, not two unrelated nav items.
  - **Accounting**: `/cash` now opens with a "Needs action" panel —
    `lib/cash.ts`'s new `getReleasableRetainageJobs` (a job at Closeout/
    Complete still holding retainage on either side) plus the existing
    `AR_SEVERELY_OVERDUE`/`AP_SEVERELY_OVERDUE` alerts, each linking
    straight to where the action happens (`/jobs/[id]/invoices` or
    `/jobs/[id]/subcontracts`). Cross-linked to `/accounting` (GL export
    mapping) and back.
  - **Foreman**: `/field`, unchanged — already the tightest of the five
    (personal assignment, crew, work plan, quick actions), the template
    the other four moved toward.

**A note on scope**: "Estimator" and "Accounting" are treated as *views*
any ADMIN/PM can reach (Estimating → `/cost-codes`, Financials →
`/financials`), not new login roles — this app still has exactly three
roles (`ADMIN`/`PM`/`FOREMAN`). A dedicated estimator or accounting role is
a small, real addition if a company using this actually separates those
jobs day to day; it wasn't added speculatively this phase.

This layer is covered by its own Playwright suite
(`tests/e2e/company-operating-core.spec.ts`): every new page renders with
live data and the right role sees the right thing; a Company Command
number and the Financials page's version of the same number agree; a
project flagged on the Portfolio drills into a job page whose own contract
value matches; and — the two things this phase is only real if both
hold — a foreman's daily report ripples into the company-wide labor-hours
total with no second entry anywhere, and completing a job's stage removes
it from Company Command with no separate "archive from dashboard" step.
The Pipeline gets its own suite too
(`tests/e2e/opportunity-pipeline.spec.ts`): the seeded win rate computes
correctly; a new bid line shows the same historical-rate panel live; a
loss removes an opportunity from the open pipeline while keeping it in
full history; and — the one this phase is only real if it holds — winning
an opportunity prefills the real Award form with its title, contract
value, and every bid line, and the resulting Job carries those cost codes
through with no re-entry. Contract/SOV/billing has its own suite too
(`tests/e2e/contract-billing.spec.ts`): a job's Schedule of Values total
ties out with its Command Center's current contract value; Award creates
a Contract with one starting SOV line from the entered terms; approving a
change order adds a SOV line automatically with no separate entry;
manually adding a line grows the scheduled total; and a pay application's
live-computed amount and retainage match what's actually saved and shown
on the invoices page afterward. Vendor/subcontract procurement has its own
suite too (`tests/e2e/vendor-procurement.spec.ts`): the vendor directory
aggregates committed/actual spend across every job a vendor appears on and
flags an expired COI; that same expired COI shows up as a real exception
on the still-active job it belongs to; adding a subcontract with a brand
new vendor name creates a real `Vendor` record findable straight from the
directory, and executing the agreement records when automatically; and a
material request can be assigned an existing vendor from the picker, not
retyped. Cash has its own suite too (`tests/e2e/cash.spec.ts`): AR aging
spreads across all four buckets with the 90+ and 61-90 rows landing on the
seeded slow-paying-owner job; the retainage summary shows both directions;
the 8-week forecast renders with an overdue call-out for what's already
past the Net-30 assumption; the Company Command Center's AR/AP/net-position
tile links through; and marking a received material paid on the materials
page removes it from AP aging. Bid packages have their own suite too
(`tests/e2e/subbid.spec.ts`): the awarded package shows its winning and
rejected bids and links straight to the real subcontract it created; the
still-open package's bids sort cheapest-first with exclusions visible for
comparison; and the full live flow — create a package, invite a
found-or-created vendor, record a quote with scope notes and exclusions,
select the winner — produces a real `Subcontract` with no re-entry, whose
committed cost shows up on the job's own cost table immediately. The three
"fix the gaps" additions have their own suite too
(`tests/e2e/closeout-gaps.spec.ts`): an expired permit is a critical
exception and one expiring soon is a warning, while a healthy permit
raises none; a fully closed-out job shows its retainage was actually
released (not just zeroed out) on both the owner side and a subcontract's
side; a job still holding retainage at Closeout can release it live from
the invoices page — a real pay application with no re-entry; and a
severely overdue pay application is a critical exception on its own job
and shows up on the company Action Center. The role-by-role pilot-
readiness pass has its own suite too (`tests/e2e/role-workspaces.spec.ts`):
a PM lands on their own Action Center rather than the company dashboard,
and its "My jobs" filter actually excludes another PM's job (not just
identical because there's only one PM in most demos) until "Show every
project" is clicked; a PM can still reach the full Command Center from the
nav; ADMIN still lands there by default; the Pipeline's "Needs attention"
panel surfaces a bid due this week and one still missing cost-code lines,
cross-linked to historical rates and back; Cash's "Needs action" panel
surfaces releasable retainage and severely-overdue AR/AP as one list,
cross-linked to the GL export mapping and back; and a Foreman's minimal
nav and personal home are unaffected by any of it. One more
suite runs the whole connected lifecycle end to end in a single test
(`tests/e2e/z-full-operating-system.spec.ts`, deliberately named to run
last — it wins an Opportunity and completes a Job, which moves company-wide
aggregates other suites assert exact values for): Opportunity → Bid →
Award → Contract/SOV → Schedule/Crew → Equipment → Daily Report →
Materials/Vendor → Subcontract → Change Order → Job Cost → Billing →
Cash (AR/AP) → Closeout → Historical Estimate, with the same numbers
cross-checked across the Command Center, Contract page, Financials, and
Cash.

## Stack

- [Next.js 16](https://nextjs.org/) (App Router, Server Actions)
- [Prisma](https://www.prisma.io/) + PostgreSQL
- Tailwind CSS
- Session auth via signed cookies (no external auth provider)

## Features (MVP scope)

- **Auth & roles**: email/password login, signed HTTP-only session cookie,
  three roles (`ADMIN`, `PM`, `FOREMAN`). Every route requires sign-in;
  job/worker/customer/estimate management is PM/ADMIN-only, while logging
  daily production and updating job status is open to any signed-in role —
  enforced server-side in the Server Actions themselves, not just hidden in
  the UI.
- **Jobs**: award in one pass (`/jobs/new` — see "Primary use case" above),
  view, list, update status, delete
- **Workers**: add crew members with role/contact info
- **Customers**: add customer records with address/contact info
- **Crew schedule** (`/schedule`): a weekly grid — workers as rows, days as
  columns — showing which job each crew member is on. One worker can only be
  on one job per day (DB-enforced), so a dispatcher can't accidentally
  double-book a crew across concurrent jobs the way a whiteboard or
  spreadsheet lets happen. Assigning supports a multi-day range in one save,
  and warns (without blocking) when a worker is marked unavailable that day
  or when the change displaces them from a different job.
- **Worker availability** (`/workers/[id]`): mark a worker unavailable for a
  date (PTO, sick, other commitment) — checked by the scheduler above — and
  see their upcoming schedule and labor rate.
- **Exception alerts** (`/alerts`, and the top 5 on the dashboard): a live
  scan across every job for labor overruns, schedule risk, missing field
  reports, material risk, crew conflicts, unapproved change work, billing
  blockers, and margin risk — grouped by severity, each linking to its job.
- **Dashboard**: job counts by status, upcoming/recent jobs, top exception alerts
- **Cost codes & labor productivity**: the field-to-cost-to-estimate loop for
  self-perform crews:
  - **Cost codes** — a master list (code, description, unit of measure) shared
    across every job.
  - **Budget lines** — attach a cost code to a job with the estimate's
    quantity and hours (e.g. 400 CY at 340 hrs), so field actuals have
    something to be measured against. Can be added one at a time, or
    **bulk-imported from a CSV** (`code,estimatedQty,estimatedHours`) so a
    whole estimate loads in one shot instead of line by line.
  - **Daily production log** — a foreman logs crew hours and quantity
    installed per cost code per day. No payroll-cycle lag: actual hrs/unit,
    variance vs. the estimate, and an on-pace/watch/over-budget status
    recompute immediately on save.
  - **Estimate ↔ actual closed loop** — the company's own completed-job
    history feeds back into the next estimate instead of living only in a
    read-only report:
    - **Historical productivity, live at estimate time**: adding a budget
      line (`/jobs/[id]/cost-codes/new`) or a cost-code row on the Award
      form shows that code's **company-wide rate** (all-time weighted
      hrs/unit), its **recent-job rate** (last 3 completed jobs), and a
      **recommended rate** (prefers the recent-job rate once 2+ jobs exist,
      falls back to the company rate otherwise) — with a one-click "Use
      recommended" that fills the estimated hours from the entered quantity.
    - **Filterable history** (`/cost-codes`): the same historical table,
      filterable by project type, crew (foreman), quantity range, and
      completion-date range — so "what does this crew actually run on a
      job this size" is a filter, not a spreadsheet pivot.
    - **At-completion benchmarks**: the moment a job's stage is set to
      Complete, its finished cost-code lines (estimate vs. actual qty/hours/
      rate/variance) are snapshotted into a `CostCodeBenchmark` record —
      automatically, the same save that moves the stage, no separate
      "record this job" step. Deliberately a point-in-time table rather
      than aggregating live, in-progress `ProductionEntry` rows, so a job
      that's only 20% done can't dilute the historical rate estimators
      actually bid from.
    - **Estimating accuracy dashboard** (`/cost-codes`): per cost code,
      average estimated vs. actual rate across completed jobs, average
      variance, and a verdict —
      *consistently underestimated/overestimated*, *accurate*, or
      *inconsistent* — so a PM/estimator can see exactly which cost codes
      the company's bids are systematically wrong on, not just that margin
      came in soft somewhere.
    - **PM forecast**: "Projected hrs"/"Projected labor cost" on the job
      Command Center and its labor-productivity table are the honest
      at-completion forecast — actual rate × estimated quantity once work
      has started, the estimate itself before that — not just a running
      total of hours logged so far.

- **Job Command Center** (`/jobs/[id]`): every job's operational home — see
  "Primary use case" above for the full field list (project number, contract
  value, PM/foreman/crew, stage, dates, current day of project, Schedule %
  vs. Production %, labor hours/cost with variance, cost-category
  budget-vs-actual, change orders, projected final cost/profit/margin,
  billing readiness, and current exceptions) — plus links out to every
  sub-workflow below.
- **Full job costing**: estimated vs. committed vs. actual vs. projected
  dollars per category (labor, material, equipment, subcontractor, other),
  rolled up into projected final cost, gross profit, and margin. Labor is
  priced from real logged hours × each worker's rate and projected from the
  job's current productivity burn rate; the rest use committed/actual data
  from the workflows below. A budget can be set per category from the job page.
- **Daily field reports** (`/jobs/[id]/daily-reports/new`): one fast form per
  job per day — crew size, labor/quantity per cost code (writes straight to
  `ProductionEntry`, driving job cost automatically), work completed,
  photos, blockers, material needed, equipment issue, safety issue, change
  condition, delay reason, and tomorrow's plan. Submitting again for the
  same date updates it in place — no separate production-log step. See
  "Primary use case" above for what a material need, an equipment issue,
  and a change condition on this form each set in motion automatically.
- **Contract & Schedule of Values** (`/jobs/[id]/contract`): a real
  contract (type, retainage %, executed date) with an owner-facing SOV —
  deliberately not the same list as cost codes. Award creates one starting
  SOV line from the entered contract value automatically; split it into
  more lines, or let it grow on its own as change orders are approved.
- **Change orders** (`/jobs/[id]/change-orders`): a flagged change condition
  opens one automatically (`IDENTIFIED`) → PM prices it → approval adds the
  revenue and cost into job costing automatically, **and** adds a matching
  line to the Schedule of Values automatically — removed again if the
  change order is un-approved before it's been billed.
- **Materials & procurement** (`/jobs/[id]/materials`): a field-flagged need
  opens a request automatically, or a PM can start one directly → approval →
  vendor/PO → ordered → received, with a real `Vendor` record (picked from
  the company directory or typed fresh inline), PO #, and cost tracked at
  each step.
- **Equipment** (`/equipment`): assign owned/rented equipment to jobs for a
  date range, track actual pickup/return and downtime, and see cost against
  budget. Overlapping assignments for the same equipment are flagged, not
  silently allowed.
- **Subcontracts** (`/jobs/[id]/subcontracts`): a real subcontract
  agreement per vendor per job — committed vs. actual, retainage %, an
  agreement lifecycle (draft → executed → closed), a COI expiration
  date that actually drives an exception if it lapses on a job still
  running, and a "Release retainage" action once the subcontract is
  fully paid.
- **Billing readiness**: a computed checklist per job — completion, approved
  change orders, required documents, recent field reports, punch list, no
  missing costs, and no Schedule of Values line billed past its scheduled
  value — so "ready to invoice" is a real answer, not a guess.
- **Pay applications** (`/jobs/[id]/invoices`): real progress billing
  against the Schedule of Values — the AIA G702/G703 pattern. Enter this
  period's cumulative % complete per SOV line; the amount due and
  retainage withheld are computed live and on submit, never typed.
  "Billed to date" everywhere in the app is computed from these
  (`Invoice.amount = sum(InvoiceLine.amountThisPeriod) -
  sum(InvoiceLine.retainageWithheld)`), not a manually-typed running
  total. At Closeout/Complete, a "Release retainage" action bills one more
  pay application — zero new work, negative retainage — that pays out
  everything withheld across the SOV.
- **Accounting handoff** (`/accounting`): maps each cost category and cost
  code to your accounting system's GL code, then every job has a one-click
  **CSV export** (labor/material/equipment/subcontractor actuals, approved
  change orders, and invoices, all GL-coded) — built to integrate with an
  existing accounting system (QuickBooks, Sage, Foundation, etc.) via import,
  not to replace it. The export sits behind a connector abstraction
  (`lib/accounting/` — an `AccountingConnector` interface, one
  `CsvAccountingConnector` implementation today) specifically so a direct
  API connector for one of those systems is a new class implementing the
  same interface against the same `AccountingExportData`, not a rewrite
  of the export route.
- **Sage Intacct connector** (`/settings/integrations`): a real OAuth 2.0
  connection (`lib/accounting/sage-oauth.ts`), not a stub — an admin clicks
  "Connect," is redirected to Sage's real authorization endpoint, and the
  resulting per-company access/refresh tokens are stored encrypted
  (auto-refreshed when they expire). Once connected, a job page gets a
  "Push to Sage Intacct" action (a POST, deliberately not a GET link — it
  has a side effect on Sage's side, so it can't be safe/idempotent the way
  the CSV download is) that posts a journal entry via Sage's REST API.
  **Honesty note on the object-push payload**: the OAuth endpoints
  (`api.intacct.com/ia/api/v1/oauth2/{authorize,token}`) are verified
  against Sage's own documentation and the full connect flow — authorize
  redirect → callback → token exchange → encrypted storage → auto-refresh —
  is live-tested end-to-end. The journal-entry object endpoint and its
  field names (`lib/accounting/sage-connector.ts`) are this app's
  best-supported reading of Sage's documented `/objects/{module}/{object}`
  REST pattern, but developer.sage.com's exact journal-entry schema
  couldn't be fetched to confirm from this build environment — validate a
  test posting against your own Sage sandbox before relying on it for real
  entries. App-level `SAGE_INTACCT_CLIENT_ID`/`SECRET` (one registration
  for CrewSync itself, from developer.sage.com/intacct) are required before
  any company can connect.
- **AI features** (`lib/ai/`, Claude Sonnet 5): three real features, not
  canned responses — every one is hidden entirely (not shown-but-broken)
  until `ANTHROPIC_API_KEY` is set, and a direct API call without a key
  returns a clear 503 rather than fabricating a response.
  - **Summarize field reports** (a job's Daily Reports page): condenses the
    last 14 daily reports into a PM-readable summary, flagging blockers,
    safety issues, and change conditions first.
  - **Draft change order** (New Change Order form): turns a foreman's rough
    field notes into a professional title + description.
  - **Ask about this job** (job detail page): a Q&A panel grounded in that
    job's real costing, billing-readiness checks, change orders, material
    requests, subcontractor costs, invoices, and recent daily reports — the
    model is instructed to say so rather than guess when the data doesn't
    answer the question, and answers only from what's in that context, not
    general knowledge. This is deliberately the one AI surface built this
    phase for "predict overruns / detect schedule risk / recommend crew
    moves / identify missing billing items" — a PM can ask directly rather
    than each needing its own bespoke, pre-baked feature; a dedicated
    proactive-narrative version of any of those remains a natural next
    phase. Every AI call needs a real `ANTHROPIC_API_KEY`
    (console.anthropic.com — separate from any Claude Code login, billed to
    your own account) — untested against a live key from this build
    environment for the same reason as the Sage connector above (no live
    credential), but the request/response handling, error paths, and UI
    gating are all real and exercised.
- **Automation engine**: stage-triggered checklists. A company-wide,
  admin-editable template (`/settings/checklist-templates`) defines what
  checklist items exist per project stage; the moment a job is created
  (PRECON) or moves into a new stage, that stage's items are generated on the
  job automatically — visible and checkable right on the Command Center. The
  same trigger point is where the other automations in the "job awarded →
  closeout" chain already live: exception alerts are the automated overrun/
  risk detection, and billing readiness is the automated "is the billing
  package ready" check.
- **Permit tracking**: a structured permit number, issued date, and
  expiration date on the job (editable from "Edit command center"),
  replacing a checklist-only "confirm permit set" checkbox with real data.
  Feeds a `PERMIT_EXPIRED` exception — critical once lapsed, warning inside
  a 30-day lookahead — on any job that isn't done yet.
- **Documents** (`/jobs/[id]/documents`): drawings, contracts, RFIs,
  submittals, field photos, safety docs, closeout files, and warranties,
  categorized and living against the job record — any signed-in role can
  upload (a foreman shouldn't need a PM to attach a safety doc), PM/ADMIN
  can delete.
- **Enterprise permissions slice**: an audit log recording who did what,
  visible both per-job (`/jobs/[id]/activity`) and company-wide
  (`/settings/activity`) for the events with no single job to attach to
  (user/API-key/webhook/SSO/integration changes). Covers every mutation
  that's money-, status-, identity-, or security-relevant: job stage,
  status, and contract-value changes; job deletions; budget lines set;
  change-order approvals and rejections; invoices created, sent, and paid;
  material-request PO issuance and receipt; subcontractor costs invoiced
  and paid; GL/cost-code mapping changes; documents deleted; and every
  user, API key, webhook, SSO config, and integration-credential change
  (created, revoked, activated/paused, password reset). Deliberately
  *not* audited: routine, non-financial roster CRUD (creating a worker,
  customer, cost code, checklist item, or material/change-order request
  before it has a dollar amount or approval attached to it) — logging
  every create would bury the events that actually matter in noise. A
  read-only public API
  (`/api/v1/jobs`) authenticated by a Bearer API key (`/settings/api-keys` —
  the plaintext key is shown exactly once, at creation, then only its hash
  is stored); and webhooks (`/settings/webhooks`) that POST an HMAC-SHA256-
  signed JSON payload to your endpoint on job-stage-changed, change-order-
  approved, invoice-sent, and daily-report-submitted. A failed delivery
  isn't just logged and forgotten — it retries with exponential backoff (1m,
  5m, 30m, 2h, 12h; 6 attempts total, `lib/webhook-retry.ts`) before being
  marked dead-lettered, with a "Retry now" action and dead-letter status
  visible per delivery on the webhooks page. The retry queue only advances
  when something calls `POST /api/cron/webhook-retries` (Bearer
  `CRON_SECRET`) — point a scheduler (Railway cron, GitHub Actions, same
  pattern as `docs/BACKUP_RECOVERY.md`) at it every few minutes. Verified
  live: a delivery to a forced-failing endpoint walked through all 6
  attempts to dead-lettered, then recovered via "Retry now" once the
  endpoint was fixed.
- **Multi-tenant company isolation**: `Company` is the hard security
  boundary — every tenant-scoped query and write goes through a Prisma
  Client Extension (`lib/tenant.ts`, `scopedPrisma(companyId)`) that injects
  `companyId` into every query automatically and refuses `findUnique`/
  `findUniqueOrThrow` on tenant models outright (an id alone can't be scoped
  after the fact — `findFirst` is used instead everywhere). Child records
  (daily reports, change orders, invoices, materials, documents, schedule
  assignments, and more) don't carry their own `companyId` — they inherit
  isolation from their parent Job/Worker/Customer, so every action that
  creates or updates one from a client-supplied parent id re-verifies that
  parent belongs to the caller's company first. Verified live: two seeded
  companies (`npm run db:seed`) cannot see each other's jobs, workers, or
  customers; direct job-id guessing 404s instead of leaking; a company-
  scoped API key only returns that company's jobs; an uploaded document is
  unreachable cross-tenant.
- **Divisions** (`/settings/divisions`): organizational segmentation within
  a company — not a security boundary, just a way to group jobs and workers
  by region or business line, with a division picker on job/worker forms and
  a filter on the jobs list.
- **SSO** (`/settings/sso`, `/settings/users`): a real OIDC authorization-
  code-flow implementation with PKCE (`lib/oidc.ts`) — discovery, the
  authorize redirect, token exchange, and `id_token` verification against
  the IdP's JWKS all genuinely happen, not stubbed. It's
  bring-your-identity-to-a-provisioned-account, not self-signup: an admin
  creates the login account first at `/settings/users` with sign-in method
  "SSO", and it's linked to the IdP's `sub` claim by email on that person's
  first sign-in — an IdP token can never mint itself an account or a role
  that wasn't already provisioned here. Client secrets are encrypted at
  rest (`lib/crypto.ts`, AES-256-GCM, `CREDENTIALS_ENCRYPTION_KEY`).
  Verified live end-to-end against a standards-compliant local test IdP
  (config, provisioning, the full redirect → callback → session round trip,
  and the "no account provisioned" rejection path all exercised for real);
  connecting a real customer IdP (Okta, Entra, Google Workspace, etc.) only
  needs its issuer URL and OAuth client credentials in `/settings/sso`.

Not in scope for this MVP: invoicing/payments themselves (billing readiness
tells you *when*, not how to generate the invoice), notifications (alerts are
pull, not push — no email/SMS yet), and estimate imports from external
takeoff/estimating software (cost-code budget lines can be CSV-imported, but
full estimate line items are entered directly).

- **Backup & recovery**: `npm run db:backup` / `npm run db:restore`
  (`scripts/backup.sh` / `scripts/restore.sh`) — a real, round-trip-tested
  `pg_dump`/`pg_restore` plan, not an in-app "backup now" button pretending
  to guarantee consistency it can't. Full runbook, RPO/RTO, retention, and
  scheduling (Railway cron or GitHub Actions) in
  [`docs/BACKUP_RECOVERY.md`](docs/BACKUP_RECOVERY.md) — including what it
  deliberately doesn't cover (point-in-time recovery needs your Postgres
  provider's own continuous-WAL feature; this is the portable secondary
  copy on top of that, not a replacement for it).

**Deliberately not built yet**: Autodesk Construction Cloud and
BuildingConnected connectors — explicitly deferred (by request) in favor of
finishing the Sage Intacct connector first. QuickBooks and Foundation stay
at the credential-storage-scaffolding stage `/settings/integrations` has
had since the enterprise-security phase (a form to save a client ID/secret,
encrypted at rest, that doesn't connect to anything) — same reasoning as
Sage before this phase: a real connector needs a real API integration
behind it, not a form that implies one exists.

## Local development

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env   # set DATABASE_URL, generate an AUTH_SECRET (see below)
npm run db:migrate     # applies migrations, creates the schema
npm run db:seed        # adds sample workers/customers/jobs/cost codes and demo login accounts
npm run dev
```

App runs at http://localhost:3000 — you'll be redirected to `/login`.

Generate `AUTH_SECRET` with `openssl rand -base64 32`; it signs session
cookies, so use a different value per environment and never commit a real one.

### Demo accounts (from `npm run db:seed`)

| Role    | Email               | Password    |
|---------|---------------------|-------------|
| ADMIN   | admin@crewsync.dev  | admin12345  |
| PM      | pm@crewsync.dev     | pm12345678  |
| FOREMAN | foreman@crewsync.dev| foreman1234 |

These are local/dev seed data only — never reuse them for a real deployment.

### End-to-end tests

```bash
npx prisma migrate reset --force   # fresh schema + seed data the tests read
npm run dev                        # in one terminal
npm run test:e2e                   # in another — runs tests/e2e/*.spec.ts headless
```

Covers the small-crew-project workflow end to end: the award → setup →
schedule → mobilize → daily update → job cost → exception detection →
change order → materials → completion → billing ready → invoice → closeout
lifecycle; that one daily report drives labor/materials/change-orders/
exceptions automatically with no duplicate entry; that `/today` answers its
six questions for a real exception; the estimate ↔ actual closed loop —
historical rates rendering live on the Award and Add Budget Line forms, the
`/cost-codes` filters actually filtering, the estimating-accuracy verdict
matching the seeded history, and a job's stage save into Complete recording
a new benchmark with no separate step; and the Company Operating Core —
every new company-wide page renders with live, cross-checked data, role
routing sends a FOREMAN to `/field` and everyone else to Company Command,
and — the two propagation/drill-down checks the phase is only real if both
pass — a foreman's daily report moves the company-wide labor-hours total
with no second entry anywhere, and completing a job's stage removes it
from Company Command with no separate cleanup step. Tests are safe to
re-run without resetting between runs (dates are generated fresh each run,
and the one test that mutates a job's stage awards its own throwaway job
rather than touching seeded data) but are most meaningful right after a
reset, against the seed data they're written for.

## Deploying

### Railway

1. Create a new Railway project from this GitHub repo.
2. Add a **PostgreSQL** plugin to the project — Railway sets `DATABASE_URL`
   automatically for services in the same project (reference it as
   `${{Postgres.DATABASE_URL}}` on the app service if not linked automatically).
3. Set an `AUTH_SECRET` variable on the app service (`openssl rand -base64 32`).
4. Railway auto-detects the build/start commands from `railway.json`:
   - Build: `npm run build` (runs `prisma generate` then `next build`)
   - Deploy: `npm run db:deploy && npm start` (applies pending migrations, then starts the server)
5. Deploy. On each push to the connected branch, Railway rebuilds and runs
   migrations automatically before starting the app.

### Vercel

The app is a standard Next.js + Prisma project. `vercel.json` pins
`{"framework": "nextjs"}` explicitly — Vercel's zero-config framework
detection didn't reliably pick this up on an imported project in practice
(it built fine but then looked for a static `public/` output directory and
failed), so don't remove that file assuming auto-detection covers it.
`npm run build` already runs `prisma generate` before `next build`, and
`postinstall` also runs `prisma generate` so the client is generated in
Vercel's own build environment (matching its runtime, so no
`binaryTargets` override is needed).

1. Import the repo into a new Vercel project.
2. Set **Environment Variables** on the project: `DATABASE_URL` and
   `AUTH_SECRET` (`openssl rand -base64 32`).
3. Migrations aren't run automatically by Vercel the way `railway.json` runs
   them on Railway — run `npx prisma migrate deploy` yourself (locally
   against the same `DATABASE_URL`, or from a CI step) before/after each
   deploy that adds a migration.
4. **Connection pooling**: Vercel functions are short-lived and can open many
   concurrent Postgres connections under load, which a plain Postgres
   instance's connection limit won't absorb well. Point `DATABASE_URL` at a
   pooled connection string (e.g. your provider's PgBouncer/pooler endpoint,
   or Neon/Supabase's pooled URL) rather than a direct one.

### GitHub

- Push/PR to `main` triggers `.github/workflows/ci.yml`, which spins up a
  throwaway Postgres service, applies migrations, lints, and builds — a
  merge gate before Railway deploys. `AUTH_SECRET` isn't needed for the CI
  build (every route is dynamically rendered, so it's only read at request
  time, not build time).

## Project structure

```
app/                          Next.js App Router pages — dashboard, alerts, jobs (+ command center,
                               daily reports, materials, change orders), equipment, workers
                               (+ availability), customers, cost codes, schedule, login
proxy.ts                      Route protection — redirects signed-out requests to /login
lib/prisma.ts                 Shared Prisma client
lib/actions.ts                 Server Actions for jobs/workers/customers
lib/productivity.ts            Per-cost-code variance/status calc + at-completion projected hours
lib/productivity-benchmarks.ts Estimate <-> actual closed loop: records CostCodeBenchmark snapshots
                                on job completion; company/recent/recommended rates; filterable
                                historical productivity; company-wide estimating-accuracy verdicts
lib/schedule.ts                Week/date helpers + per-job color coding for the schedule grid
lib/schedule-actions.ts        Server Action to assign a worker's day (or a multi-day range),
                                warning on unavailability/displacement without blocking
lib/availability-actions.ts    Server Actions to mark/clear a worker's unavailable dates
lib/auth.ts                    Session token signing/verification (Web Crypto — Edge-runtime safe)
lib/password.ts                Password hashing (Node crypto — server-actions/seed only)
lib/auth-actions.ts            Login/logout Server Actions
lib/session.ts                 getSession/requireSession/requireRole/requirePageRole helpers
lib/csv.ts                     Small CSV parser for the budget-line importer
lib/job-costing.ts              Estimated/committed/actual/projected cost rollup per job -- current
                                 contract value sourced from Contract/ContractLine (the SOV) when
                                 a job has one, falling back to the flat field + change orders
lib/billing.ts                  Billing-readiness checklist computation, incl. "no SOV line
                                 billed past its scheduled value"
lib/alerts.ts                   Exception-alert scan across all jobs, surfaced on /today + dashboard
                                 -- includes PERMIT_EXPIRED and AR/AP_SEVERELY_OVERDUE
lib/format.ts                   Shared money/date formatting + stage/category labels
lib/command-center-actions.ts   Server Actions for job command-center fields (incl. permit number/
                                 issued/expiration dates) + category budgets
lib/award-actions.ts            Server Action for the one-pass "award a project" flow (/jobs/new)
lib/job-number.ts               Next "{year}-{seq}" project number per company
lib/project-health.ts           Consolidated Command Center data (schedule %/production %/labor
                                 variance/cost categories/change orders/billing/exceptions) in one fetch
lib/pm-daily-command.ts         Enriches getAlerts() with why/impact/action/owner/due for /today
lib/daily-report-actions.ts     Server Action for daily field reports — the single place labor/quantity
                                 (writes ProductionEntry), material needs, equipment issues, and change
                                 conditions are entered, with photo upload
lib/materials-actions.ts        Server Actions for cost codes/budget lines/CSV import
lib/productivity-actions.ts     Server Actions for material requests and status updates
lib/equipment-actions.ts        Server Actions for equipment + job assignment (with conflict warning)
lib/change-order-actions.ts     Server Actions for change orders -- approval also upserts a
                                 ContractLine for the approved revenue, un-approval removes it
app/api/photos/[id]/route.ts    Serves daily-report photo bytes (stored in Postgres)
app/today/                      Company Action Center
app/alerts/                     Redirects to /today (folded in, not a separate view)

--- Company Operating Core (all read layers over the tables above) ---
lib/company-command.ts          Company Command Center rollup (/): active-operations risk buckets,
                                 financial performance, labor, resources -- summed from
                                 getProjectHealth()/getJobCosting() per open job, nothing stored
lib/portfolio.ts                Project Portfolio (/projects): one row per job, same numbers as
                                 that job's own Command Center, filterable/sortable
lib/company-financials.ts       Company Financials (/financials): category rollup + losing-margin/
                                 over-budget/billing-blocked project lists
lib/resources.ts                Resource Command (/company/resources): cross-project crew/equipment
                                 view aggregated from existing schedule/assignment/equipment tables
lib/field-activity.ts           Field activity feed (/field) for ADMIN/PM; the same route resolves
                                 a signed-in FOREMAN's personalized "today" home via Worker.userId
lib/search.ts                   Global search (/search): case-insensitive contains() across jobs,
                                 customers, workers, cost codes, change orders, materials, equipment,
                                 document titles
app/company/                    Company hub page + Resource Command
app/projects/                   Project Portfolio
app/financials/                 Company Financials
app/field/                      Field activity feed / Foreman home
app/search/                     Global search

--- The bid pipeline (Opportunity -> Bid -> Estimate -> Award) ---
lib/opportunity-number.ts       Next "{year}-B{seq}" bid number -- a separate sequence from
                                 jobNumber so a lost bid never consumes or gaps a real one
lib/opportunity-actions.ts      Server Actions: createOpportunity, updateOpportunity,
                                 addOpportunityCostCode, markOpportunityLost -- WON is set by
                                 awardProject instead (lib/award-actions.ts), not a separate action
lib/opportunities.ts            Pipeline list, single-opportunity detail, and getWinRateReport
                                 (by project type / by estimator -- Historical Intelligence)
app/opportunities/              Pipeline list, new-opportunity form, and the bid workspace (bid
                                 lines with the same historical-rate panel the Award form uses,
                                 Mark Won -> /jobs/new?opportunityId=, Mark Lost/No-bid)
app/jobs/[id]/cost-codes/new/budget-line-fields.tsx  Reused as-is by
                                 app/opportunities/[id]/cost-codes/new/ -- one historical-rate
                                 component, two forms that post to different Server Actions

--- Contract, Schedule of Values & billing ---
lib/contract.ts                 Read layer: getContract() (SOV lines + billed-to-date/remaining
                                 per line) and ensureContract(), the defensive find-or-create used
                                 by the change-order automation
lib/contract-actions.ts         Server Actions: updateContract (type/retainage/executed date),
                                 addContractLine/deleteContractLine (manual SOV lines)
lib/invoice-actions.ts          createPayApplication -- one InvoiceLine per billed SOV line,
                                 amount/retainage computed from cumulative % complete, never typed.
                                 releaseRetainage -- the closeout billing event: one more pay
                                 application with zero new work and negative retainageWithheld
lib/invoice-number.ts           Next "INV-{jobNumber}-{seq}" pay-application number per job
app/jobs/[id]/contract/         View/edit the Contract & Schedule of Values
app/jobs/[id]/invoices/new/pay-app-lines.tsx  Client component: live-computed amount/retainage
                                 per SOV line as % complete is typed, before submit

--- Vendors & subcontracts ---
lib/vendors.ts                  Read layer: getVendors() (directory with live committed/actual
                                 spend + COI status per vendor), getVendor() (detail), and
                                 resolveOrCreateVendorId() -- the shared inline find-or-create
                                 used by the material-request, subcontract, and Award forms
lib/vendor-actions.ts           Server Actions: createVendor, updateVendor
lib/subcontract-actions.ts      Server Actions: createSubcontract, updateSubcontract (billing
                                 status, agreement status, actual amount, COI expiration) --
                                 renamed from lib/subcontractor-actions.ts as part of promoting
                                 SubcontractorCost into Subcontract. releaseSubcontractRetainage --
                                 sets retainageReleasedAt once a PAID subcontract's retainage is
                                 paid out (no line-item history to net against, unlike the AR side)
app/vendors/                    Vendor directory, new-vendor form, vendor detail (linked
                                 subcontracts + material requests)
app/jobs/[id]/subcontracts/     Subcontract list + new-subcontract form -- promoted out of the
                                 job Command Center's old inline section, same reasoning as
                                 change orders/materials/invoices already having their own pages

--- Cash ---
lib/cash.ts                     Read layer: getArAging/getApAging (0-30/31-60/61-90/90+ buckets),
                                 getRetainageSummary (both directions -- nets a released Invoice
                                 line to zero automatically; excludes a released Subcontract via
                                 retainageReleasedAt), getReleasableRetainageJobs (per-job, not just
                                 a total -- the Accounting workspace's "Needs action" list),
                                 getCashForecast (8-week, Net-30 assumption from each row's own
                                 aging date) -- a computed rollup, no new ledger
app/cash/                       AR/AP aging tables, "Needs action" (releasable retainage +
                                 severely-overdue AR/AP), retainage summary, 8-week forecast --
                                 company-wide, ADMIN/PM only

--- Bid packages (subcontractor bid leveling) ---
lib/subbids.ts                  Read layer: getBidPackages() (list w/ low/high/received-count per
                                 job), getBidPackage() (full compare view, bids sorted cheapest-
                                 first, not-yet-quoted last)
lib/subbid-actions.ts           Server Actions: createBidPackage, inviteSubBid (resolveOrCreate
                                 VendorId, same inline find-or-create as everywhere else),
                                 updateSubBid (record a quote's amount/scopeNotes/exclusions, or
                                 mark declined), selectSubBidWinner (one transaction: SELECTED,
                                 rejects every other open bid, creates the real Subcontract with
                                 sourceSubBidId set, closes the package AWARDED)
app/jobs/[id]/bid-packages/     Package list, new-package form, and the compare/detail page --
                                 invite a sub, record what came back, select the winner

prisma/schema.prisma  Data model
prisma/seed.ts        Sample data, demo login accounts, seven simultaneous active/completed
                       projects each demonstrating one condition cleanly for the Company Command
                       Center (healthy, labor risk, schedule risk, material risk, change-work
                       exposure, billing-ready, and historical-intelligence-feeding), a bid
                       pipeline (two wins each converted to a real Job, two losses and a no-bid
                       with reasons, two still-open bids), a real Contract + Schedule of Values on
                       every job with a contract value (multi-line, retainage, CO-sourced lines),
                       real multi-period pay-application history on several of them (spread across
                       every AR aging bucket, including a Westgate Plaza slow-paying-owner scenario
                       for the 61-90/90+ buckets), a real Vendor directory (every material/
                       subcontract commitment tied to one, not a free-text name) with one vendor's
                       certificate of insurance deliberately lapsed to demonstrate the COI_EXPIRED
                       alert live and a mix of paid/unpaid received materials for AP variety, a
                       subcontractor bid-leveling scenario on the Harbor Sitework job (one package
                       already awarded -- a real Subcontract created from the winning bid, the
                       runner-up rejected -- and one still open with two competing quotes, one
                       cheaper but missing scope the other includes, plus a declined invite), plus
                       the small-crew-project and estimate/actual-loop demo scenarios from earlier
                       phases
docs/ARCHITECTURE.md            Full company-lifecycle design (Lead/Bid through Executive Command)
                                 -- the Opportunity pipeline and Contract/SOV/Billing are Phase 1,
                                 and Vendor/Subcontract procurement, Cash, and SubBid are all three
                                 now-shipped halves of Phase 2
docs/OPERATING-DATA-MODEL.md    Source-of-truth audit for every major business concept -- what
                                 this phase's company-wide views were built against
tests/e2e/             Playwright E2E suite (npm run test:e2e) -- small-crew-project workflow,
                       estimate/actual closed loop, and Company Operating Core (including data
                       propagation and drill-down checks)
playwright.config.ts   E2E test runner config
railway.json          Railway build/deploy config
.github/workflows/    CI
```
