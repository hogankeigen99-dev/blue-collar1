# CrewSync — Crew, Job & Labor Productivity Manager

An MVP for a self-performing GC to track jobs, crew, scheduling, customers,
and — the core of it — real-time self-perform labor productivity: daily
field hours and quantity logged against a job's estimate, compared back
same-day instead of on the next payroll cycle.

## Primary use case: the 5–10 day, 1–2 crew small project

CrewSync's current focus is a single workflow, built to work correctly end
to end rather than sketch a lot of separate features: **taking a small
(5–10 day, 1–2 crew) project from award through closeout as one operational
home**, with no duplicate data entry between the field, PM, scheduling,
materials/equipment, job costing, change management, billing readiness, and
accounting.

- **Award a project in one pass** (`/jobs/new`, `lib/award-actions.ts`):
  customer, location, contract value, budget by category, cost codes, PM,
  foreman, crew, start/target-completion dates, and any known initial
  materials/equipment/subcontractors are all captured in a single form. That
  one submit auto-generates the project's `jobNumber`, its PRECON startup
  checklist (`lib/checklist.ts`), and the crew's day-by-day schedule for the
  project's date range (`ScheduleAssignment` rows) alongside their formal
  job assignment — so the crew and the schedule board start in sync instead
  of being entered twice and drifting apart (the gap the `CREW_CONFLICT`
  alert exists to catch).
- **The job Command Center is the single operational home**
  (`/jobs/[id]`, data from `lib/project-health.ts`): project number,
  customer, location, contract value, PM, foreman, crew, current stage,
  start/planned-completion dates, current day of project, **Schedule %**
  (time elapsed ÷ planned duration) and **Production %** (actual quantity ÷
  estimated quantity — a genuinely different number, computed and labeled
  separately, not the same figure under two names), estimated/actual labor
  hours and cost with variance, material/equipment/subcontractor
  budget-vs-actual, approved change orders, current contract value,
  projected final cost/gross profit/margin, billing readiness, and current
  exceptions — all on one page, meant to be readable in about 10 seconds.
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
- **The PM Daily Command** (`/today`, `lib/pm-daily-command.ts`) is the
  start-of-day view across every job: for each open exception, what it is,
  why it matters, the impact of leaving it, what to do about it, who owns
  it, and when it's due — not just a bare alert list.
- **Exceptions are computed, not manually flagged** (`lib/alerts.ts`):
  labor overruns, schedule risk, missing field reports, material risk, crew
  conflicts, unapproved change work, billing blockers, margin risk, and
  equipment issues are all derived from the same underlying field/cost
  data — company-wide at `/alerts`, prioritized for action at `/today`, or
  scoped to one job (`getJobAlerts`) on its Command Center.
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
`/today` answers all six PM Daily Command questions for a real exception.

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
- **Change orders** (`/jobs/[id]/change-orders`): a flagged change condition
  opens one automatically (`IDENTIFIED`) → PM prices it → approval adds the
  revenue and cost into job costing automatically.
- **Materials & procurement** (`/jobs/[id]/materials`): a field-flagged need
  opens a request automatically, or a PM can start one directly → approval →
  vendor/PO → ordered → received, with vendor, PO #, and cost tracked at
  each step.
- **Equipment** (`/equipment`): assign owned/rented equipment to jobs for a
  date range, track actual pickup/return and downtime, and see cost against
  budget. Overlapping assignments for the same equipment are flagged, not
  silently allowed.
- **Subcontractor costs**: committed vs. actual per vendor per job, tracked
  inline on the Command Center.
- **Billing readiness**: a computed checklist per job — completion, approved
  change orders, required documents, recent field reports, punch list, and
  no missing costs — so "ready to invoice" is a real answer, not a guess.
- **Invoices** (`/jobs/[id]/invoices`): real invoice records (number, amount,
  date, DRAFT/SENT/PAID) — "billed to date" everywhere in the app is computed
  from these, not a manually-typed running total.
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
six questions for a real exception; and the estimate ↔ actual closed loop —
historical rates rendering live on the Award and Add Budget Line forms, the
`/cost-codes` filters actually filtering, the estimating-accuracy verdict
matching the seeded history, and a job's stage save into Complete recording
a new benchmark with no separate step. Tests are safe to re-run without
resetting between runs (dates are generated fresh each run) but are most
meaningful right after a reset, against the seed data they're written for.

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

The app is a standard Next.js + Prisma project, so Vercel's zero-config
Next.js detection builds and runs it without a `vercel.json` — no build
command override is needed since `npm run build` already runs
`prisma generate` before `next build`, and `postinstall` also runs
`prisma generate` so the client is generated in Vercel's own build
environment (matching its runtime, so no `binaryTargets` override is needed).

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
lib/job-costing.ts              Estimated/committed/actual/projected cost rollup per job
lib/billing.ts                  Billing-readiness checklist computation
lib/alerts.ts                   Exception-alert scan across all jobs, surfaced on /alerts, /today + dashboard
lib/format.ts                   Shared money/date formatting + stage/category labels
lib/command-center-actions.ts   Server Actions for job command-center fields + category budgets
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
lib/change-order-actions.ts     Server Actions for change orders
lib/subcontractor-actions.ts    Server Actions for subcontractor costs
app/api/photos/[id]/route.ts    Serves daily-report photo bytes (stored in Postgres)
app/today/                      PM Daily Command
prisma/schema.prisma  Data model
prisma/seed.ts        Sample data, demo login accounts, and two small-crew-project demo scenarios
                       (Sunrise Duplex live mid-project, Cedar Court closed out) plus a full
                       job-costing/field-ops demo scenario (Riverside Phase 2) and a handful of
                       minimal completed-job history records seeding the estimating-accuracy
                       dashboard with a clean "consistently underestimated" example
tests/e2e/             Playwright E2E suite for the small-crew-project workflow (npm run test:e2e)
playwright.config.ts   E2E test runner config
railway.json          Railway build/deploy config
.github/workflows/    CI
```
