import { scopedPrisma } from "@/lib/tenant";
import { computeProgress, type ProductivityStatus } from "@/lib/productivity";
import { dateKey } from "@/lib/schedule";

const DAY_MS = 86_400_000;
const DEFAULT_FEED_DAYS = 7;

export type FieldReportSummary = {
  id: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  date: Date;
  crewSize: number | null;
  hours: number | null;
  quantityInstalled: string | null;
  workCompleted: string | null;
  blockers: string | null;
  materialNeeded: string | null;
  equipmentIssue: string | null;
  safetyIssue: string | null;
  hasChangeCondition: boolean;
  submittedByName: string | null;
};

/**
 * Company-wide field activity feed — every daily report across every open
 * job in the window, newest first. This is a read layer over DailyReport,
 * the same table lib/daily-report-actions.ts already writes to exactly
 * once per job per day; nothing here creates a second record of what
 * happened in the field.
 */
export async function getFieldActivityFeed(companyId: string, opts: { jobId?: string; days?: number } = {}): Promise<FieldReportSummary[]> {
  const prisma = scopedPrisma(companyId);
  const days = opts.days ?? DEFAULT_FEED_DAYS;
  const since = new Date(Date.now() - days * DAY_MS);

  const reports = await prisma.dailyReport.findMany({
    where: {
      date: { gte: since },
      jobId: opts.jobId,
      job: { status: { not: "CANCELLED" } },
    },
    include: { job: { select: { jobNumber: true, title: true } }, submittedBy: true },
    orderBy: { date: "desc" },
  });

  return reports.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    jobNumber: r.job.jobNumber,
    jobTitle: r.job.title,
    date: r.date,
    crewSize: r.crewSize,
    hours: r.hours,
    quantityInstalled: r.quantityInstalled,
    workCompleted: r.workCompleted,
    blockers: r.blockers,
    materialNeeded: r.materialNeeded,
    equipmentIssue: r.equipmentIssue,
    safetyIssue: r.safetyIssue,
    hasChangeCondition: r.hasChangeCondition,
    submittedByName: r.submittedBy?.name ?? null,
  }));
}

export type ForemanCostCodeLine = {
  costCodeId: string;
  code: string;
  description: string;
  unit: string;
  estimatedQty: number;
  estimatedHours: number;
  actualQty: number;
  actualHours: number;
  status: ProductivityStatus;
};

export type ForemanJobToday = {
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  stage: string;
  crewToday: string[];
  costCodes: ForemanCostCodeLine[];
  reportSubmittedToday: boolean;
  yesterdaysPlan: string | null;
};

export type ForemanToday = {
  workerId: string | null;
  workerName: string | null;
  jobs: ForemanJobToday[];
};

/**
 * The Foreman's "today" home — resolved from the signed-in User's linked
 * Worker record (Worker.userId), not guessed. If there's no link (a
 * FOREMAN-role login with no matching crew-member record), jobs comes back
 * empty and the page says so honestly instead of showing someone else's
 * work or a generic company-wide list.
 */
export async function getForemanToday(companyId: string, userId: string): Promise<ForemanToday> {
  const prisma = scopedPrisma(companyId);
  const worker = await prisma.worker.findFirst({ where: { userId } });
  if (!worker) return { workerId: null, workerName: null, jobs: [] };

  const todayKey = dateKey(new Date());
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const yesterday = new Date(today.getTime() - DAY_MS);

  const jobs = await prisma.job.findMany({
    where: {
      status: { not: "CANCELLED" },
      stage: { notIn: ["COMPLETE"] },
      OR: [{ foremanWorkerId: worker.id }, { assignments: { some: { workerId: worker.id } } }, { scheduleAssignments: { some: { workerId: worker.id, date: today } } }],
    },
    include: {
      costCodes: { include: { entries: true, costCode: true } },
      scheduleAssignments: { where: { date: today }, include: { worker: true } },
      dailyReports: { where: { date: { in: [today, yesterday] } } },
    },
  });

  const foremanJobs: ForemanJobToday[] = jobs.map((job) => ({
    jobId: job.id,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    stage: job.stage,
    crewToday: job.scheduleAssignments.map((sa) => sa.worker.name),
    costCodes: job.costCodes.map((jcc) => {
      const progress = computeProgress(jcc.estimatedQty, jcc.estimatedHours, jcc.entries);
      return {
        costCodeId: jcc.costCodeId,
        code: jcc.costCode.code,
        description: jcc.costCode.description,
        unit: jcc.costCode.unit,
        estimatedQty: jcc.estimatedQty,
        estimatedHours: jcc.estimatedHours,
        actualQty: progress.actualQty,
        actualHours: progress.actualHours,
        status: progress.status,
      };
    }),
    reportSubmittedToday: job.dailyReports.some((r) => r.date.getTime() === today.getTime()),
    yesterdaysPlan: job.dailyReports.find((r) => r.date.getTime() === yesterday.getTime())?.tomorrowPlan ?? null,
  }));

  return { workerId: worker.id, workerName: worker.name, jobs: foremanJobs };
}
