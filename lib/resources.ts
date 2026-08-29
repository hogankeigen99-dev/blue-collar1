import { scopedPrisma } from "@/lib/tenant";
import { dateKey } from "@/lib/schedule";

const DAY_MS = 86_400_000;
const UPCOMING_START_DAYS = 14;

export type CrewAssignmentToday = {
  workerId: string;
  workerName: string;
  workerRole: string | null;
  jobId: string;
  jobTitle: string;
  jobNumber: string;
};

export type WorkerConflict = {
  workerId: string;
  workerName: string;
  jobs: { jobId: string; jobTitle: string }[];
};

export type UpcomingStart = {
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  targetStartDate: Date;
  foremanName: string | null;
  crewAssignedCount: number;
};

export type EquipmentToday = {
  equipmentId: string;
  name: string;
  type: string | null;
  jobId: string;
  jobTitle: string;
  startDate: Date;
  endDate: Date;
  status: "on_job" | "overdue_return";
};

export type ResourceCommand = {
  crewAssignmentsToday: CrewAssignmentToday[];
  availableWorkersToday: { workerId: string; workerName: string; role: string | null }[];
  unavailableWorkersToday: { workerId: string; workerName: string; reason: string | null }[];
  workerConflicts: WorkerConflict[];
  upcomingStarts: UpcomingStart[];
  equipmentOut: EquipmentToday[];
  equipmentAvailable: { equipmentId: string; name: string; type: string | null }[];
};

/**
 * The cross-project resource view — who's working where today, who's free,
 * where a schedule/roster disagreement exists, what's starting soon and
 * still needs crew, and where every piece of equipment currently is.
 * Every field is read straight from ScheduleAssignment/JobAssignment/
 * WorkerUnavailability/EquipmentAssignment — the same tables the existing
 * per-job schedule and equipment pages already write to; nothing here is a
 * new source of truth, only a company-wide view across them.
 */
export async function getResourceCommand(companyId: string): Promise<ResourceCommand> {
  const prisma = scopedPrisma(companyId);
  const now = Date.now();
  const today = new Date(`${dateKey(new Date(now))}T00:00:00.000Z`);

  const [scheduledToday, allActiveWorkers, unavailableToday, openJobs, equipmentOutRows, allEquipment] = await Promise.all([
    prisma.scheduleAssignment.findMany({
      where: { date: today },
      include: { worker: true, job: { select: { id: true, title: true, jobNumber: true } } },
    }),
    prisma.worker.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.workerUnavailability.findMany({ where: { date: today }, include: { worker: true } }),
    prisma.job.findMany({
      where: { status: { not: "CANCELLED" }, stage: { not: "COMPLETE" } },
      include: { assignments: true, foreman: true },
    }),
    prisma.equipmentAssignment.findMany({
      where: { actualReturnDate: null },
      include: { equipment: true, job: { select: { id: true, title: true } } },
    }),
    prisma.equipment.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const crewAssignmentsToday: CrewAssignmentToday[] = scheduledToday.map((sa) => ({
    workerId: sa.workerId,
    workerName: sa.worker.name,
    workerRole: sa.worker.role,
    jobId: sa.job.id,
    jobTitle: sa.job.title,
    jobNumber: sa.job.jobNumber,
  }));

  const assignedWorkerIds = new Set(scheduledToday.map((sa) => sa.workerId));
  const unavailableWorkerIds = new Set(unavailableToday.map((u) => u.workerId));
  const availableWorkersToday = allActiveWorkers
    .filter((w) => !assignedWorkerIds.has(w.id) && !unavailableWorkerIds.has(w.id))
    .map((w) => ({ workerId: w.id, workerName: w.name, role: w.role }));
  const unavailableWorkersToday = unavailableToday.map((u) => ({
    workerId: u.workerId,
    workerName: u.worker.name,
    reason: u.reason,
  }));

  // Worker conflicts: scheduled on a job today without a formal roster
  // assignment to it — the company-wide version of the per-job
  // CREW_CONFLICT alert, aggregated by worker across every job at once.
  const jobById = new Map(openJobs.map((j) => [j.id, j]));
  const conflictsByWorker = new Map<string, WorkerConflict>();
  for (const sa of scheduledToday) {
    const job = jobById.get(sa.jobId);
    if (!job) continue;
    const formallyAssigned = job.assignments.some((a) => a.workerId === sa.workerId);
    if (formallyAssigned) continue;
    const existing = conflictsByWorker.get(sa.workerId);
    const jobEntry = { jobId: job.id, jobTitle: job.title };
    if (existing) existing.jobs.push(jobEntry);
    else conflictsByWorker.set(sa.workerId, { workerId: sa.workerId, workerName: sa.worker.name, jobs: [jobEntry] });
  }

  // Upcoming starts: jobs not yet mobilized, starting soon, with how much
  // crew is already on the roster for them (0 is the actionable signal).
  const upcomingStarts: UpcomingStart[] = openJobs
    .filter((j) => j.stage === "PRECON" || j.stage === "MOBILIZATION")
    .filter((j) => j.targetStartDate && j.targetStartDate.getTime() - now <= UPCOMING_START_DAYS * DAY_MS && j.targetStartDate.getTime() >= now - DAY_MS)
    .map((j) => ({
      jobId: j.id,
      jobNumber: j.jobNumber,
      jobTitle: j.title,
      targetStartDate: j.targetStartDate!,
      foremanName: j.foreman?.name ?? null,
      crewAssignedCount: j.assignments.length,
    }))
    .sort((a, b) => a.targetStartDate.getTime() - b.targetStartDate.getTime());

  const equipmentOut: EquipmentToday[] = equipmentOutRows.map((a) => ({
    equipmentId: a.equipmentId,
    name: a.equipment.name,
    type: a.equipment.type,
    jobId: a.job.id,
    jobTitle: a.job.title,
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.endDate.getTime() < now ? "overdue_return" : "on_job",
  }));
  const outEquipmentIds = new Set(equipmentOutRows.map((a) => a.equipmentId));
  const equipmentAvailable = allEquipment
    .filter((e) => !outEquipmentIds.has(e.id))
    .map((e) => ({ equipmentId: e.id, name: e.name, type: e.type }));

  return {
    crewAssignmentsToday,
    availableWorkersToday,
    unavailableWorkersToday,
    workerConflicts: Array.from(conflictsByWorker.values()),
    upcomingStarts,
    equipmentOut,
    equipmentAvailable,
  };
}
