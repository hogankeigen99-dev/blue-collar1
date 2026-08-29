import { scopedPrisma } from "@/lib/tenant";

const DAY_MS = 86_400_000;
const NET_TERMS_DAYS = 30;
const FORECAST_BUCKET_DAYS = 7;

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
const BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

function bucketFor(daysOutstanding: number): AgingBucket {
  if (daysOutstanding <= 30) return "0-30";
  if (daysOutstanding <= 60) return "31-60";
  if (daysOutstanding <= 90) return "61-90";
  return "90+";
}

export type AgingRow = {
  jobId: string;
  jobTitle: string;
  jobNumber: string;
  reference: string; // invoice number, or a subcontract/material description
  amount: number;
  anchorDate: Date;
  daysOutstanding: number;
  bucket: AgingBucket;
};

export type AgingReport = {
  rows: AgingRow[];
  bucketTotals: Record<AgingBucket, number>;
  total: number;
};

function buildReport(rows: AgingRow[]): AgingReport {
  const bucketTotals: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const r of rows) bucketTotals[r.bucket] += r.amount;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows: rows.sort((a, b) => b.daysOutstanding - a.daysOutstanding), bucketTotals, total };
}

/** Invoice/Subcontract/MaterialRequest are child records reached through a
 * Job (see lib/tenant.ts) — they carry no companyId of their own, so a
 * direct query needs an explicit jobId-in-scoped-jobs filter, the same
 * pattern lib/company-command.ts uses for its company-wide invoice sum. */
async function getScopedJobIds(prisma: ReturnType<typeof scopedPrisma>): Promise<string[]> {
  const jobs = await prisma.job.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true } });
  return jobs.map((j) => j.id);
}

/**
 * Accounts receivable aging — every SENT (billed, not yet PAID) invoice
 * company-wide, aged from its bill date. Amount is already net of
 * retainage withheld (how Contract/SOV billing computes invoice.amount),
 * so this is what's actually collectible, not the gross pay-app total.
 */
export async function getArAging(companyId: string): Promise<AgingReport> {
  const prisma = scopedPrisma(companyId);
  const now = Date.now();
  const jobIds = await getScopedJobIds(prisma);

  const invoices = await prisma.invoice.findMany({
    where: { status: "SENT", jobId: { in: jobIds } },
    include: { job: { select: { id: true, title: true, jobNumber: true } } },
  });

  const rows: AgingRow[] = invoices.map((inv) => {
    const daysOutstanding = Math.floor((now - inv.date.getTime()) / DAY_MS);
    return {
      jobId: inv.job.id,
      jobTitle: inv.job.title,
      jobNumber: inv.job.jobNumber,
      reference: inv.invoiceNumber,
      amount: inv.amount,
      anchorDate: inv.date,
      daysOutstanding,
      bucket: bucketFor(daysOutstanding),
    };
  });

  return buildReport(rows);
}

/**
 * Accounts payable aging — combines two sources of "we owe this, not yet
 * paid": subcontracts that have been INVOICED by the sub (aged from
 * executedDate, the one date the record actually gives us control over —
 * createdAt is always "just seeded" and would dump everything in 0-30),
 * and received materials with a cost but no paidDate yet (aged from
 * receivedDate).
 */
export async function getApAging(companyId: string): Promise<AgingReport> {
  const prisma = scopedPrisma(companyId);
  const now = Date.now();
  const jobIds = await getScopedJobIds(prisma);

  const [subcontracts, materials] = await Promise.all([
    prisma.subcontract.findMany({
      where: { status: "INVOICED", jobId: { in: jobIds } },
      include: { job: { select: { id: true, title: true, jobNumber: true } }, vendor: { select: { name: true } } },
    }),
    prisma.materialRequest.findMany({
      where: { status: "RECEIVED", totalCost: { not: null }, paidDate: null, jobId: { in: jobIds } },
      include: { job: { select: { id: true, title: true, jobNumber: true } }, vendor: { select: { name: true } } },
    }),
  ]);

  const subRows: AgingRow[] = subcontracts.map((s) => {
    const anchor = s.executedDate ?? s.createdAt;
    const daysOutstanding = Math.floor((now - anchor.getTime()) / DAY_MS);
    return {
      jobId: s.job.id,
      jobTitle: s.job.title,
      jobNumber: s.job.jobNumber,
      reference: `${s.vendor?.name ?? "Unassigned vendor"} — ${s.description ?? "Subcontract"}`,
      amount: s.actualAmount,
      anchorDate: anchor,
      daysOutstanding,
      bucket: bucketFor(daysOutstanding),
    };
  });

  const materialRows: AgingRow[] = materials.map((m) => {
    const anchor = m.receivedDate ?? m.createdAt;
    const daysOutstanding = Math.floor((now - anchor.getTime()) / DAY_MS);
    return {
      jobId: m.job.id,
      jobTitle: m.job.title,
      jobNumber: m.job.jobNumber,
      reference: `${m.vendor?.name ?? "Unassigned vendor"} — ${m.description}`,
      amount: m.totalCost ?? 0,
      anchorDate: anchor,
      daysOutstanding,
      bucket: bucketFor(daysOutstanding),
    };
  });

  return buildReport([...subRows, ...materialRows]);
}

export type RetainageSummary = {
  heldByOwner: number; // AR side: retainage the owner is withholding from us, not yet released
  heldFromSubs: number; // AP side: retainage we're withholding from subs on work already billed
};

/**
 * Retainage held on each side — not a release schedule (retainage release
 * remains unmodeled, same limitation carried from the Contract/SOV phase),
 * just what's currently being withheld.
 */
export async function getRetainageSummary(companyId: string): Promise<RetainageSummary> {
  const prisma = scopedPrisma(companyId);
  const jobIds = await getScopedJobIds(prisma);

  const [lines, subs] = await Promise.all([
    prisma.invoiceLine.findMany({
      where: { invoice: { status: { in: ["SENT", "PAID"] }, jobId: { in: jobIds } } },
      select: { retainageWithheld: true },
    }),
    prisma.subcontract.findMany({
      where: { status: { in: ["INVOICED", "PAID"] }, retainagePct: { not: null }, jobId: { in: jobIds } },
      select: { actualAmount: true, retainagePct: true },
    }),
  ]);

  const heldByOwner = lines.reduce((s, l) => s + l.retainageWithheld, 0);
  const heldFromSubs = subs.reduce((s, c) => s + c.actualAmount * ((c.retainagePct ?? 0) / 100), 0);

  return { heldByOwner, heldFromSubs };
}

export type ForecastWeek = {
  weekStart: Date;
  label: string;
  expectedIn: number;
  expectedOut: number;
  net: number;
};

export type CashForecast = {
  weeks: ForecastWeek[];
  overdueIn: number; // AR already past the Net-30 assumption as of today
  overdueOut: number; // AP already past the Net-30 assumption as of today
};

/**
 * A weekly cash forecast built on one explicit, labeled simplification: a
 * Net-30 assumption from each outstanding row's own aging anchor (invoice
 * date for AR, executedDate/receivedDate for AP) — not the architecture
 * doc's more ambitious "Schedule/Contract pacing" model, which would need
 * per-phase target billing dates that don't exist yet (SchedulePhase is
 * still §3.6 Partial). Real math over real rows, not a fabricated curve.
 */
export async function getCashForecast(companyId: string, weeks = 8): Promise<CashForecast> {
  const [ar, ap] = await Promise.all([getArAging(companyId), getApAging(companyId)]);
  const now = Date.now();
  const netTermsMs = NET_TERMS_DAYS * DAY_MS;

  const weekBuckets: ForecastWeek[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(now + i * FORECAST_BUCKET_DAYS * DAY_MS);
    return {
      weekStart,
      label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      expectedIn: 0,
      expectedOut: 0,
      net: 0,
    };
  });

  let overdueIn = 0;
  let overdueOut = 0;

  for (const row of ar.rows) {
    const expected = row.anchorDate.getTime() + netTermsMs;
    if (expected <= now) {
      overdueIn += row.amount;
      continue;
    }
    const weekIdx = Math.floor((expected - now) / (FORECAST_BUCKET_DAYS * DAY_MS));
    if (weekIdx < weeks) weekBuckets[weekIdx].expectedIn += row.amount;
  }

  for (const row of ap.rows) {
    const expected = row.anchorDate.getTime() + netTermsMs;
    if (expected <= now) {
      overdueOut += row.amount;
      continue;
    }
    const weekIdx = Math.floor((expected - now) / (FORECAST_BUCKET_DAYS * DAY_MS));
    if (weekIdx < weeks) weekBuckets[weekIdx].expectedOut += row.amount;
  }

  for (const w of weekBuckets) w.net = w.expectedIn - w.expectedOut;

  return { weeks: weekBuckets, overdueIn, overdueOut };
}

export { BUCKETS as AGING_BUCKETS };
