# CrewSync — Crew, Job & Labor Productivity Manager

An MVP for a self-performing GC to track jobs, crew, scheduling, customers,
and — the core of it — real-time self-perform labor productivity: daily
field hours and quantity logged against a job's estimate, compared back
same-day instead of on the next payroll cycle.

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
- **Jobs**: create, view, list, update status, assign one or more workers, delete
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
  - **Historical productivity** (`/cost-codes`) — actual hrs/unit aggregated
    across every job that has ever used a cost code, so estimators can pull
    the company's own actuals instead of bidding from gut feel or generic
    unit-cost books.

- **Job Command Center** (`/jobs/[id]`): every job's operational home —
  contract value, PM, foreman, target dates, project stage, schedule progress
  (derived from cost-code productivity), and links out to every sub-workflow
  below, all on one page.
- **Full job costing**: estimated vs. committed vs. actual vs. projected
  dollars per category (labor, material, equipment, subcontractor, other),
  rolled up into projected final cost, gross profit, and margin. Labor is
  priced from real logged hours × each worker's rate and projected from the
  job's current productivity burn rate; the rest use committed/actual data
  from the workflows below. A budget can be set per category from the job page.
- **Daily field reports** (`/jobs/[id]/daily-reports`): one fast form per job
  per day — crew size, hours, quantity installed, work completed, photos,
  blockers, material needed, equipment issue, safety issue, change condition,
  delay reason, and tomorrow's plan. Submitting again for the same date
  updates it in place.
- **Change orders** (`/jobs/[id]/change-orders`): field flags a change
  condition on a daily report → becomes a change order → PM prices it →
  approval adds the revenue and cost into job costing automatically.
- **Materials & procurement** (`/jobs/[id]/materials`): field request → PM
  approval → vendor/PO → ordered → received, with vendor, PO #, and cost
  tracked at each step.
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
lib/productivity.ts            Variance/status calc + historical productivity query
lib/productivity-actions.ts    Server Actions for cost codes/budget lines/production entries/CSV import
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
lib/alerts.ts                   Exception-alert scan across all jobs, surfaced on /alerts + dashboard
lib/format.ts                   Shared money/date formatting + stage/category labels
lib/command-center-actions.ts   Server Actions for job command-center fields + category budgets
lib/daily-report-actions.ts     Server Action for daily field reports (with photo upload)
lib/materials-actions.ts        Server Actions for material requests
lib/equipment-actions.ts        Server Actions for equipment + job assignment (with conflict warning)
lib/change-order-actions.ts     Server Actions for change orders
lib/subcontractor-actions.ts    Server Actions for subcontractor costs
app/api/photos/[id]/route.ts    Serves daily-report photo bytes (stored in Postgres)
prisma/schema.prisma  Data model
prisma/seed.ts        Sample data, demo login accounts, and a full job-costing/field-ops demo scenario
railway.json          Railway build/deploy config
.github/workflows/    CI
```
