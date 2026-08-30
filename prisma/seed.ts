import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { startOfWeek, addDays } from "../lib/schedule";
import { generateChecklistForStage } from "../lib/checklist";

/** Job numbers are normally auto-generated at award time (lib/job-number.ts)
 * from the current year — seed data assigns them by hand in the same
 * "{year}-{seq}" shape, per-company, in creation order. */
const SEED_YEAR = new Date().getFullYear();

const prisma = new PrismaClient();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Finds-or-creates a Vendor by name for this company — a small in-process
 * cache so the same vendor named across multiple jobs (e.g. "Summit
 * Concrete Supply" supplying both Riverside Phase 2 and Sunrise Duplex)
 * becomes one real Vendor row, not a duplicate per mention, mirroring
 * lib/vendors.ts's resolveOrCreateVendorId for the real app flow. */
const vendorCache = new Map<string, ReturnType<typeof prisma.vendor.create>>();
function seedVendor(companyId: string, name: string, opts: { trade?: string; contactInfo?: string } = {}) {
  const key = `${companyId}:${name}`;
  if (!vendorCache.has(key)) {
    vendorCache.set(key, prisma.vendor.create({ data: { companyId, name, trade: opts.trade, contactInfo: opts.contactInfo } }));
  }
  return vendorCache.get(key)!;
}

/** Creates a Contract + a default 3-line Schedule of Values (Mobilization
 * 10% / Contract work in place 80% / Final completion & closeout 10%) for a
 * job's contract value — the same shape lib/award-actions.ts creates
 * automatically at Award time going forward. Returns the created lines in
 * that order so callers can reference them for pay applications. `extraLines`
 * mirrors a CO-sourced line the way lib/change-order-actions.ts creates one
 * automatically on approval. */
async function seedContract(
  jobId: string,
  contractValue: number,
  opts: { retainagePct?: number; executedDate?: Date; extraLines?: { description: string; scheduledValue: number; sourceChangeOrderId?: string }[] } = {}
) {
  const contract = await prisma.contract.create({
    data: {
      jobId,
      type: "LUMP_SUM",
      retainagePct: opts.retainagePct ?? 10,
      executedDate: opts.executedDate,
    },
  });
  const mobilization = round2(contractValue * 0.1);
  const closeout = round2(contractValue * 0.1);
  const construction = round2(contractValue - mobilization - closeout);
  const allLines = [
    { description: "Mobilization & general conditions", scheduledValue: mobilization },
    { description: "Contract work in place", scheduledValue: construction },
    { description: "Final completion & closeout", scheduledValue: closeout },
    ...(opts.extraLines ?? []),
  ];
  const lines = [];
  for (const l of allLines) {
    lines.push(
      await prisma.contractLine.create({
        data: {
          contractId: contract.id,
          description: l.description,
          scheduledValue: l.scheduledValue,
          sortOrder: lines.length,
          sourceChangeOrderId: "sourceChangeOrderId" in l ? l.sourceChangeOrderId : undefined,
        },
      })
    );
  }
  return { contract, lines };
}

/** Creates one pay application (Invoice + one InvoiceLine per billed SOV
 * line) from cumulative percent-complete per line — the same math the real
 * pay-app form computes (lib/invoice-actions.ts's createPayApplication), run
 * directly against Prisma since seed data has no request/session to call the
 * server action through. A line is skipped (not billed this pay app) when
 * `newPct` equals `priorPct`. */
async function seedPayApplication(params: {
  jobId: string;
  invoiceNumber: string;
  date: Date;
  status: "DRAFT" | "SENT" | "PAID";
  retainagePct: number;
  lines: { contractLineId: string; scheduledValue: number; priorPct: number; newPct: number }[];
}) {
  const lineData = params.lines
    .filter((l) => l.newPct > l.priorPct)
    .map((l) => {
      const amountToDate = round2((l.newPct / 100) * l.scheduledValue);
      const priorAmount = round2((l.priorPct / 100) * l.scheduledValue);
      const amountThisPeriod = round2(amountToDate - priorAmount);
      const retainageWithheld = round2(amountThisPeriod * (params.retainagePct / 100));
      return {
        contractLineId: l.contractLineId,
        pctCompleteThisPeriod: round2(l.newPct - l.priorPct),
        pctCompleteToDate: l.newPct,
        amountThisPeriod,
        retainageWithheld,
      };
    });
  const amount = round2(lineData.reduce((s, l) => s + l.amountThisPeriod - l.retainageWithheld, 0));
  return prisma.invoice.create({
    data: {
      jobId: params.jobId,
      invoiceNumber: params.invoiceNumber,
      date: params.date,
      status: params.status,
      amount,
      lines: { create: lineData },
    },
  });
}

/** Releases every dollar of retainage currently withheld on a contract's SOV
 * lines — the same "one more pay application, negative retainageWithheld"
 * shape as lib/invoice-actions.ts's releaseRetainage, run directly against
 * Prisma since seed data has no request/session to call the server action
 * through. Only meant to be called on a contract whose pay apps are already
 * seeded (so `lines` carry their real billed retainage). */
async function seedRetainageRelease(params: { jobId: string; contractId: string; invoiceNumber: string; date: Date }) {
  const lines = await prisma.contractLine.findMany({
    where: { contractId: params.contractId },
    include: { invoiceLines: true },
  });
  const lineData = lines
    .map((l) => {
      const held = round2(l.invoiceLines.reduce((s, il) => s + il.retainageWithheld, 0));
      const pctToDate = l.invoiceLines.reduce((max, il) => Math.max(max, il.pctCompleteToDate), 0);
      return { contractLineId: l.id, held, pctToDate };
    })
    .filter((l) => l.held > 0)
    .map((l) => ({
      contractLineId: l.contractLineId,
      pctCompleteThisPeriod: 0,
      pctCompleteToDate: l.pctToDate,
      amountThisPeriod: 0,
      retainageWithheld: -l.held,
    }));
  const amount = round2(lineData.reduce((s, l) => s + l.amountThisPeriod - l.retainageWithheld, 0));
  return prisma.invoice.create({
    data: {
      jobId: params.jobId,
      invoiceNumber: params.invoiceNumber,
      date: params.date,
      status: "PAID",
      amount,
      notes: "Retainage release",
      lines: { create: lineData },
    },
  });
}

async function main() {
  // Two companies so multi-tenant isolation is demonstrable out of the box —
  // logging in as one company's users must never surface the other's data.
  const company = await prisma.company.create({
    data: { name: "CrewSync Demo GC", slug: "crewsync-demo" },
  });
  const otherCompany = await prisma.company.create({
    data: { name: "Second Co Construction", slug: "second-co" },
  });

  const fieldOps = await prisma.division.create({
    data: { companyId: company.id, name: "Field Operations" },
  });

  // The automation engine's templates — company-wide, editable at /settings/checklist-templates.
  await prisma.checklistTemplateItem.createMany({
    data: [
      { companyId: company.id, stage: "PRECON", title: "Confirm contract value and PM assignment", sortOrder: 1 },
      { companyId: company.id, stage: "PRECON", title: "Add cost code budget lines", sortOrder: 2 },
      { companyId: company.id, stage: "PRECON", title: "Assign foreman", sortOrder: 3 },
      { companyId: company.id, stage: "MOBILIZATION", title: "Schedule crew for week 1", sortOrder: 1 },
      { companyId: company.id, stage: "MOBILIZATION", title: "Submit material requirements", sortOrder: 2 },
      { companyId: company.id, stage: "MOBILIZATION", title: "Confirm equipment needs", sortOrder: 3 },
      { companyId: company.id, stage: "ACTIVE", title: "Submit first daily report", sortOrder: 1 },
      { companyId: company.id, stage: "ACTIVE", title: "Confirm cost code budgets are tracking", sortOrder: 2 },
      { companyId: company.id, stage: "PUNCH_LIST", title: "Walk punch list with customer", sortOrder: 1 },
      { companyId: company.id, stage: "PUNCH_LIST", title: "Log punch items as change orders if scope changed", sortOrder: 2 },
      { companyId: company.id, stage: "CLOSEOUT", title: "Confirm punch list complete", sortOrder: 1 },
      { companyId: company.id, stage: "CLOSEOUT", title: "Collect required documents", sortOrder: 2 },
      { companyId: company.id, stage: "CLOSEOUT", title: "Submit final invoice", sortOrder: 3 },
      { companyId: company.id, stage: "COMPLETE", title: "Archive project documents", sortOrder: 1 },
      { companyId: company.id, stage: "COMPLETE", title: "Confirm final invoice paid", sortOrder: 2 },
    ],
  });

  // Demo login accounts — local/dev only, never real production credentials.
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Amanda Reyes",
      email: "admin@crewsync.dev",
      passwordHash: hashPassword("admin12345"),
      role: "ADMIN",
    },
  });
  const priya = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Priya Shah",
      email: "pm@crewsync.dev",
      passwordHash: hashPassword("pm12345678"),
      role: "PM",
    },
  });
  const frankUser = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Frank Delgado",
      email: "foreman@crewsync.dev",
      passwordHash: hashPassword("foreman1234"),
      role: "FOREMAN",
    },
  });
  // A second PM — not a demo login account, just real enough attribution
  // so the "My action center" filter (app/today/page.tsx) has something to
  // actually prove: Priya's own view should exclude Marcus's job/exception,
  // not just render identically to "show all" because she's the only PM.
  const marcus = await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Marcus Webb",
      email: "marcus.webb@crewsync.dev",
      passwordHash: hashPassword("unused-not-a-login-account"),
      role: "PM",
    },
  });

  const alice = await prisma.worker.create({
    data: { companyId: company.id, name: "Alice Johnson", role: "Electrician", phone: "555-0101" },
  });
  const bob = await prisma.worker.create({
    data: { companyId: company.id, name: "Bob Martinez", role: "Plumber", phone: "555-0102" },
  });

  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      name: "Riverside Apartments",
      address: "123 River Rd",
      phone: "555-0200",
    },
  });

  const breakerPanel = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-001`,
      title: "Fix breaker panel",
      description: "Replace faulty breaker in unit 4B",
      address: "123 River Rd, Unit 4B",
      status: "SCHEDULED",
      customerId: customer.id,
      assignments: { create: [{ workerId: alice.id }] },
    },
  });
  await generateChecklistForStage(prisma, breakerPanel.id, "PRECON");

  const leakingPipe = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-002`,
      title: "Leaking pipe under sink",
      description: "Kitchen sink leak, unit 2A",
      address: "123 River Rd, Unit 2A",
      status: "IN_PROGRESS",
      customerId: customer.id,
      assignments: { create: [{ workerId: bob.id }] },
    },
  });
  await generateChecklistForStage(prisma, leakingPipe.id, "PRECON");

  // --- Self-perform labor productivity demo data ---

  const frank = await prisma.worker.create({
    data: {
      companyId: company.id,
      name: "Frank Delgado",
      role: "Concrete Foreman",
      phone: "555-0301",
      laborRate: 62,
      userId: frankUser.id,
    },
  });
  const miguel = await prisma.worker.create({
    data: { companyId: company.id, name: "Miguel Torres", role: "Laborer", phone: "555-0302", laborRate: 38 },
  });

  const concreteSlab = await prisma.costCode.create({
    data: {
      companyId: company.id,
      code: "03 30 00",
      description: "Concrete slab on grade",
      unit: "CY",
    },
  });
  const excavation = await prisma.costCode.create({
    data: {
      companyId: company.id,
      code: "31 23 00",
      description: "Excavation",
      unit: "CY",
    },
  });
  const electricalRoughIn = await prisma.costCode.create({
    data: {
      companyId: company.id,
      code: "26 05 00",
      description: "Electrical rough-in",
      unit: "HR",
    },
  });
  const rebarPlacement = await prisma.costCode.create({
    data: {
      companyId: company.id,
      code: "03 20 00",
      description: "Reinforcing steel placement",
      unit: "TON",
    },
  });

  const harborView = await prisma.customer.create({
    data: { companyId: company.id, name: "Harbor View Development", address: "8800 Harbor View Dr" },
  });

  // A job that came in on budget — anchors the historical rate for the code.
  const harborFoundation = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-003`,
      title: "Harbor View — Foundation Pour",
      description: "Slab on grade for the parking structure foundation",
      address: "8800 Harbor View Dr",
      status: "COMPLETED",
      projectType: "Foundation pour",
      customerId: harborView.id,
      assignments: { create: [{ workerId: frank.id }, { workerId: miguel.id }] },
      contractValue: 310000,
      pmUserId: priya.id,
      foremanWorkerId: frank.id,
      targetStartDate: new Date("2026-07-01"),
      targetEndDate: new Date("2026-07-15"),
      stage: "COMPLETE",
      punchListComplete: true,
      requiredDocsComplete: true,
    },
  });
  // In real use each stage's checklist generates as the job passes through it;
  // for seed data we just generate the stages it demonstrably went through.
  await generateChecklistForStage(prisma, harborFoundation.id, "PRECON");
  await generateChecklistForStage(prisma, harborFoundation.id, "COMPLETE");
  const harborSlabBudget = await prisma.jobCostCode.create({
    data: {
      jobId: harborFoundation.id,
      costCodeId: concreteSlab.id,
      estimatedQty: 200,
      estimatedHours: 170, // 0.85 hrs/CY estimate
    },
  });
  await prisma.productionEntry.createMany({
    data: [
      { jobCostCodeId: harborSlabBudget.id, date: new Date("2026-07-06"), hours: 43, quantity: 51, crewSize: 5, enteredById: frank.id },
      { jobCostCodeId: harborSlabBudget.id, date: new Date("2026-07-07"), hours: 44, quantity: 52, crewSize: 5, enteredById: frank.id },
      { jobCostCodeId: harborSlabBudget.id, date: new Date("2026-07-08"), hours: 43, quantity: 51, crewSize: 5, enteredById: frank.id },
      { jobCostCodeId: harborSlabBudget.id, date: new Date("2026-07-09"), hours: 44, quantity: 51, crewSize: 5, enteredById: frank.id },
    ],
  });
  await prisma.dailyReport.create({
    data: {
      jobId: harborFoundation.id,
      date: new Date("2026-07-09"),
      crewSize: 5,
      hours: 44,
      workCompleted: "Final pour complete, forms stripped, site cleaned up",
      submittedById: frank.id,
    },
  });
  // Closed out and fully paid, including a real retainage release — the
  // full AR-side closeout billing event (lib/invoice-actions.ts's
  // releaseRetainage), not just a 0%-retainage workaround.
  const harborContract = await seedContract(harborFoundation.id, 310000, {
    retainagePct: 10,
    executedDate: new Date("2026-06-20"),
  });
  await seedPayApplication({
    jobId: harborFoundation.id,
    invoiceNumber: "INV-1001",
    date: new Date("2026-07-16"),
    status: "PAID",
    retainagePct: 10,
    lines: harborContract.lines.map((l) => ({ contractLineId: l.id, scheduledValue: l.scheduledValue, priorPct: 0, newPct: 100 })),
  });
  await seedRetainageRelease({
    jobId: harborFoundation.id,
    contractId: harborContract.contract.id,
    invoiceNumber: "INV-1002",
    date: new Date("2026-07-30"),
  });
  // Estimate/actual closed loop: the at-completion benchmark a real
  // COMPLETE transition (lib/command-center-actions.ts) would have
  // snapshotted — this job came in almost exactly on the bid rate.
  await prisma.costCodeBenchmark.create({
    data: {
      jobId: harborFoundation.id,
      costCodeId: concreteSlab.id,
      projectType: "Foundation pour",
      foremanWorkerId: frank.id,
      estimatedQty: 200,
      estimatedHours: 170,
      actualQty: 205,
      actualHours: 174,
      estimatedRate: 170 / 200,
      actualRate: 174 / 205,
      variancePct: (174 / 205 - 170 / 200) / (170 / 200),
    },
  });

  // An in-progress job where the same crew is running well over the estimate —
  // exactly the gap this feature is meant to surface days into Phase 2, not
  // weeks later after Phase 3 has already been poured.
  const riverside2 = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-004`,
      title: "Riverside Apartments — Phase 2 Slab",
      description: "Slab on grade, Phase 2 of the podium deck",
      address: "123 River Rd",
      status: "IN_PROGRESS",
      customerId: customer.id,
      assignments: { create: [{ workerId: frank.id }, { workerId: miguel.id }] },
      contractValue: 620000,
      pmUserId: priya.id,
      foremanWorkerId: frank.id,
      targetStartDate: new Date("2026-08-10"),
      targetEndDate: new Date("2026-09-25"),
      stage: "ACTIVE",
      // Permit lapsed mid-construction — the PERMIT_EXPIRED alert this feeds
      // (lib/alerts.ts) is meant to catch exactly this before an inspector
      // does.
      permitNumber: "RVA-2026-0142",
      permitIssuedDate: new Date("2025-08-20"),
      permitExpirationDate: new Date("2026-08-25"),
    },
  });
  await generateChecklistForStage(prisma, riverside2.id, "PRECON");
  await generateChecklistForStage(prisma, riverside2.id, "ACTIVE");
  // PRECON is behind this job now — mark it done for a realistic demo.
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: riverside2.id, stage: "PRECON" },
    data: { done: true, doneAt: new Date("2026-08-09"), doneById: frank.id },
  });
  const phase2SlabBudget = await prisma.jobCostCode.create({
    data: {
      jobId: riverside2.id,
      costCodeId: concreteSlab.id,
      estimatedQty: 400,
      estimatedHours: 340, // 0.85 hrs/CY estimate, same crew/code as Harbor View
    },
  });
  await prisma.productionEntry.createMany({
    data: [
      { jobCostCodeId: phase2SlabBudget.id, date: new Date("2026-08-24"), hours: 42, quantity: 35, crewSize: 5, enteredById: frank.id, notes: "Rebar congestion slowing pours" },
      { jobCostCodeId: phase2SlabBudget.id, date: new Date("2026-08-25"), hours: 44, quantity: 36, crewSize: 5, enteredById: frank.id },
      { jobCostCodeId: phase2SlabBudget.id, date: new Date("2026-08-26"), hours: 40, quantity: 34, crewSize: 5, enteredById: frank.id },
      { jobCostCodeId: phase2SlabBudget.id, date: new Date("2026-08-27"), hours: 42, quantity: 35, crewSize: 5, enteredById: frank.id, notes: "Same crew, still running hot" },
    ],
  });
  // Budgeted but not yet started — shows up as "Not started" rather than flagged.
  await prisma.jobCostCode.create({
    data: {
      jobId: riverside2.id,
      costCodeId: excavation.id,
      estimatedQty: 300,
      estimatedHours: 90,
    },
  });

  // --- Job costing, field ops, and change-order demo data (Riverside Phase 2) ---

  await prisma.jobBudget.createMany({
    data: [
      { jobId: riverside2.id, category: "LABOR", estimatedAmount: 18700 },
      { jobId: riverside2.id, category: "MATERIAL", estimatedAmount: 165000 },
      { jobId: riverside2.id, category: "EQUIPMENT", estimatedAmount: 9500 },
      { jobId: riverside2.id, category: "SUBCONTRACTOR", estimatedAmount: 48000 },
    ],
  });

  const summitConcrete = await seedVendor(company.id, "Summit Concrete Supply", { trade: "Ready-mix concrete", contactInfo: "555-0801" });
  const metroRebar = await seedVendor(company.id, "Metro Rebar & Supply", { trade: "Rebar supply", contactInfo: "555-0802" });
  await prisma.materialRequest.createMany({
    data: [
      {
        jobId: riverside2.id,
        description: "Ready-mix concrete, 4000 PSI",
        quantity: 140,
        unit: "CY",
        status: "RECEIVED",
        vendorId: summitConcrete.id,
        poNumber: "PO-1042",
        unitCost: 168,
        totalCost: 23520,
        expectedDeliveryDate: new Date("2026-08-24"),
        receivedDate: new Date("2026-08-24"),
        requestedById: frank.id,
      },
      {
        jobId: riverside2.id,
        description: "#4 rebar",
        quantity: 12,
        unit: "TON",
        status: "ORDERED",
        vendorId: metroRebar.id,
        poNumber: "PO-1051",
        unitCost: 1150,
        totalCost: 13800,
        expectedDeliveryDate: new Date("2026-08-27"),
        requestedById: frank.id,
      },
    ],
  });

  const equipment = await prisma.equipment.create({
    data: { companyId: company.id, name: "Concrete pump truck", type: "Pump truck", ownership: "RENTED", dailyRentalCost: 650 },
  });
  await prisma.equipmentAssignment.create({
    data: {
      equipmentId: equipment.id,
      jobId: riverside2.id,
      startDate: new Date("2026-08-24"),
      endDate: new Date("2026-08-28"),
      actualPickupDate: new Date("2026-08-24"),
      downtimeNotes: "Half day lost to a hydraulic leak on 8/26",
    },
  });

  const aceRebar = await seedVendor(company.id, "Ace Rebar Placing", { trade: "Rebar placement", contactInfo: "555-0803" });
  await prisma.subcontract.create({
    data: {
      jobId: riverside2.id,
      vendorId: aceRebar.id,
      description: "Rebar placement, Phase 2 slab",
      committedAmount: 45000,
      actualAmount: 22000,
      status: "INVOICED",
      agreementStatus: "EXECUTED",
      executedDate: new Date("2026-08-10"),
      retainagePct: 10,
      // Deliberately lapsed — demonstrates lib/alerts.ts's COI_EXPIRED check
      // on a job that's still actively running.
      coiExpirationDate: new Date("2026-08-20"),
    },
  });

  const rockReport = await prisma.dailyReport.create({
    data: {
      jobId: riverside2.id,
      date: new Date("2026-08-26"),
      crewSize: 5,
      hours: 40,
      workCompleted: "Poured section C, grid lines 3-6",
      quantityInstalled: "34 CY slab",
      blockers: "Waiting on rock excavation decision before section C4 can finish",
      equipmentIssue: "Pump truck hydraulic leak, ~4 hrs downtime",
      hasChangeCondition: true,
      changeConditionNotes: "Hit rock below spec elevation at grid C4 — needs excavation beyond bid scope",
      submittedById: frank.id,
    },
  });
  await prisma.dailyReport.createMany({
    data: [
      {
        jobId: riverside2.id,
        date: new Date("2026-08-24"),
        crewSize: 5,
        hours: 42,
        workCompleted: "Set forms and poured section A",
        quantityInstalled: "35 CY slab",
        materialNeeded: "More rebar chairs for section B",
        submittedById: frank.id,
      },
      {
        jobId: riverside2.id,
        date: new Date("2026-08-27"),
        crewSize: 5,
        hours: 42,
        workCompleted: "Poured section D",
        tomorrowPlan: "Strip forms on section A, start section E layout",
        submittedById: frank.id,
      },
    ],
  });

  await prisma.changeOrder.create({
    data: {
      jobId: riverside2.id,
      title: "Unforeseen rock excavation at grid C4",
      description: rockReport.changeConditionNotes,
      status: "SUBMITTED",
      revenueAmount: 12000,
      costAmount: 9000,
      sourceDailyReportId: rockReport.id,
      createdById: frank.id,
    },
  });
  const riversideFootingCO = await prisma.changeOrder.create({
    data: {
      jobId: riverside2.id,
      title: "Additional footing at grid C4",
      description: "Owner-requested footing addition for future equipment pad",
      status: "APPROVED",
      revenueAmount: 8500,
      costAmount: 5200,
      approvedAt: new Date("2026-08-25"),
      createdById: frank.id,
    },
  });

  // Mid-project, real retainage — the CO line exists (mirroring the
  // approval automation) but isn't billed yet, a realistic "billed next
  // pay app" state that also shows headroom against the over-billing guard.
  const riversideContract = await seedContract(riverside2.id, 620000, {
    retainagePct: 10,
    executedDate: new Date("2026-08-01"),
    extraLines: [
      { description: `CO: ${riversideFootingCO.title}`, scheduledValue: 8500, sourceChangeOrderId: riversideFootingCO.id },
    ],
  });
  const [riversideMob, riversideConstruction] = riversideContract.lines;

  await seedPayApplication({
    jobId: riverside2.id,
    invoiceNumber: "INV-2001",
    date: new Date("2026-08-15"),
    status: "PAID",
    retainagePct: 10,
    lines: [
      { contractLineId: riversideMob.id, scheduledValue: riversideMob.scheduledValue, priorPct: 0, newPct: 100 },
      { contractLineId: riversideConstruction.id, scheduledValue: riversideConstruction.scheduledValue, priorPct: 0, newPct: 20 },
    ],
  });
  await seedPayApplication({
    jobId: riverside2.id,
    invoiceNumber: "INV-2002",
    date: new Date("2026-08-25"),
    status: "SENT",
    retainagePct: 10,
    lines: [
      { contractLineId: riversideConstruction.id, scheduledValue: riversideConstruction.scheduledValue, priorPct: 20, newPct: 45 },
    ],
  });

  // Accounting handoff: GL mapping so the CSV export is ready to import.
  await prisma.accountingCategoryMapping.createMany({
    data: [
      { companyId: company.id, category: "LABOR", glCode: "6100", glAccountName: "Direct Labor" },
      { companyId: company.id, category: "MATERIAL", glCode: "6200", glAccountName: "Materials" },
      { companyId: company.id, category: "EQUIPMENT", glCode: "6300", glAccountName: "Equipment Rental" },
      { companyId: company.id, category: "SUBCONTRACTOR", glCode: "6400", glAccountName: "Subcontract Costs" },
      { companyId: company.id, category: "OTHER", glCode: "6900", glAccountName: "Other Job Costs" },
    ],
  });
  await prisma.costCode.update({ where: { id: concreteSlab.id }, data: { glCode: "6100-CONC" } });
  await prisma.costCode.update({ where: { id: excavation.id }, data: { glCode: "6100-EXC" } });

  // Crew schedule board demo data — this week's Mon-Thu, so /schedule shows
  // a populated grid immediately (Friday is left open to demo an empty cell).
  const monday = startOfWeek(new Date());
  await prisma.scheduleAssignment.createMany({
    data: [0, 1, 2, 3].flatMap((offset) => [
      { workerId: frank.id, jobId: riverside2.id, date: addDays(monday, offset) },
      { workerId: miguel.id, jobId: riverside2.id, date: addDays(monday, offset) },
    ]),
  });

  // --- The primary small-crew-project demo: a 7-day, 2-3 person foundation
  // & slab job, seeded mid-stream (today is day 5 of 7) so the Command
  // Center, job costing, billing readiness, and exception detection all have
  // something real and current to show the moment the app is seeded — not
  // just a finished job (Harbor View) or an open-ended large one (Riverside
  // Phase 2). Dates are relative to "now" rather than hardcoded so the demo
  // stays mid-stream no matter when the seed is run. ---

  const diego = await prisma.worker.create({
    data: { companyId: company.id, name: "Diego Ramirez", role: "Carpenter Foreman", phone: "555-0401", laborRate: 58 },
  });
  const jamal = await prisma.worker.create({
    data: { companyId: company.id, name: "Jamal Washington", role: "Laborer", phone: "555-0402", laborRate: 34 },
  });

  const mapleStreet = await prisma.customer.create({
    data: { companyId: company.id, name: "Maple Street Holdings", address: "212 Maple St", phone: "555-0500" },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const projectStart = addDays(today, -4); // day 5 of a 7-day project as of "today"
  const projectEnd = addDays(today, 2);

  const sunriseDuplex = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-005`,
      title: "Sunrise Duplex — Foundation & Slab",
      description: "Excavation, footings, and slab-on-grade for a new duplex",
      address: "212 Maple St",
      status: "IN_PROGRESS",
      customerId: mapleStreet.id,
      assignments: { create: [{ workerId: diego.id }, { workerId: jamal.id }] },
      contractValue: 42000,
      pmUserId: priya.id,
      foremanWorkerId: diego.id,
      targetStartDate: projectStart,
      targetEndDate: projectEnd,
      stage: "ACTIVE",
      // Expiring soon but not yet lapsed — the PERMIT_EXPIRED alert's
      // warning tier (30-day lookahead), distinct from Riverside's already-
      // expired critical case above.
      permitNumber: "MPL-2026-0087",
      permitIssuedDate: addDays(today, -300),
      permitExpirationDate: addDays(today, 12),
    },
  });

  await generateChecklistForStage(prisma, sunriseDuplex.id, "PRECON");
  await generateChecklistForStage(prisma, sunriseDuplex.id, "MOBILIZATION");
  await generateChecklistForStage(prisma, sunriseDuplex.id, "ACTIVE");
  // PRECON and MOBILIZATION are behind this job now — mark them done.
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: sunriseDuplex.id, stage: { in: ["PRECON", "MOBILIZATION"] } },
    data: { done: true, doneAt: projectStart, doneById: diego.id },
  });

  await prisma.jobBudget.createMany({
    data: [
      { jobId: sunriseDuplex.id, category: "LABOR", estimatedAmount: 5200 },
      { jobId: sunriseDuplex.id, category: "MATERIAL", estimatedAmount: 9800 },
      { jobId: sunriseDuplex.id, category: "EQUIPMENT", estimatedAmount: 1600 },
      { jobId: sunriseDuplex.id, category: "SUBCONTRACTOR", estimatedAmount: 2800 },
    ],
  });

  // Crew schedule for the full 7-day span — generated alongside the formal
  // crew assignment above, the way lib/award-actions.ts does it for new
  // projects, so this job never exhibits the CREW_CONFLICT gap.
  await prisma.scheduleAssignment.createMany({
    data: Array.from({ length: 7 }, (_, i) => i).flatMap((offset) => [
      { workerId: diego.id, jobId: sunriseDuplex.id, date: addDays(projectStart, offset) },
      { workerId: jamal.id, jobId: sunriseDuplex.id, date: addDays(projectStart, offset) },
    ]),
  });

  const sunriseExcavation = await prisma.jobCostCode.create({
    data: {
      jobId: sunriseDuplex.id,
      costCodeId: excavation.id,
      estimatedQty: 40,
      estimatedHours: 24,
    },
  });
  const sunriseSlab = await prisma.jobCostCode.create({
    data: {
      jobId: sunriseDuplex.id,
      costCodeId: concreteSlab.id,
      estimatedQty: 60,
      estimatedHours: 54, // 0.9 hrs/CY estimate
    },
  });

  // Five daily reports, each created the way lib/daily-report-actions.ts
  // creates one — production entries, the material request, and the change
  // order all link back to the report that generated them (dailyReportId /
  // sourceDailyReportId), the same as a real foreman submission would.
  const sunriseDay1 = await prisma.dailyReport.create({
    data: {
      jobId: sunriseDuplex.id,
      date: addDays(projectStart, 0),
      crewSize: 2,
      workCompleted: "Excavation and layout complete",
      submittedById: diego.id,
    },
  });
  // Day 1 — excavation comes in at/under estimate.
  await prisma.productionEntry.create({
    data: {
      jobCostCodeId: sunriseExcavation.id,
      dailyReportId: sunriseDay1.id,
      date: sunriseDay1.date,
      hours: 22,
      quantity: 40,
      crewSize: 2,
      enteredById: diego.id,
    },
  });
  await prisma.dailyReport.update({ where: { id: sunriseDay1.id }, data: { hours: 22, quantityInstalled: "40 CY Excavation" } });

  // Day 2 — one report flags BOTH a change condition and a material
  // shortage; both become real records automatically, not just a note.
  const sunriseDay2 = await prisma.dailyReport.create({
    data: {
      jobId: sunriseDuplex.id,
      date: addDays(projectStart, 1),
      crewSize: 2,
      hours: 16,
      workCompleted: "Set forms, placed rebar for footings",
      blockers: "Found an old abandoned footing not shown on the plans at the north corner",
      materialNeeded: "Short 3 tons #4 rebar for the slab pour — original delivery undercounted",
      hasChangeCondition: true,
      changeConditionNotes: "Demo and removal of undocumented footing before forms can be set at the north corner",
      submittedById: diego.id,
    },
  });
  await prisma.materialRequest.create({
    data: {
      jobId: sunriseDuplex.id,
      description: "Short 3 tons #4 rebar for the slab pour — original delivery undercounted",
      quantity: 3,
      unit: "TON",
      status: "ORDERED",
      vendorId: metroRebar.id,
      poNumber: "PO-2205",
      unitCost: 1180,
      totalCost: 3540,
      expectedDeliveryDate: addDays(projectStart, 3), // now in the past — overdue
      requestedById: diego.id,
      sourceDailyReportId: sunriseDay2.id,
    },
  });
  await prisma.changeOrder.create({
    data: {
      jobId: sunriseDuplex.id,
      title: "Demo and removal of undocumented footing before forms can be set at the",
      description: "Demo and removal of undocumented footing before forms can be set at the north corner",
      sourceDailyReportId: sunriseDay2.id,
      createdById: diego.id,
    },
  });

  // Day 3 — the slab pour starts and runs hot (the labor slip begins).
  const sunriseDay3 = await prisma.dailyReport.create({
    data: {
      jobId: sunriseDuplex.id,
      date: addDays(projectStart, 2),
      crewSize: 2,
      workCompleted: "Poured footings and started slab section A",
      submittedById: diego.id,
    },
  });
  await prisma.productionEntry.create({
    data: {
      jobCostCodeId: sunriseSlab.id,
      dailyReportId: sunriseDay3.id,
      date: sunriseDay3.date,
      hours: 15,
      quantity: 15,
      crewSize: 2,
      enteredById: diego.id,
    },
  });
  await prisma.dailyReport.update({ where: { id: sunriseDay3.id }, data: { hours: 15, quantityInstalled: "15 CY Concrete slab on grade" } });

  // Day 4 — the shortage resolves and the change order is priced/approved
  // same day: the recovery, driven by the PM acting on what day 2 opened.
  await prisma.materialRequest.updateMany({
    where: { jobId: sunriseDuplex.id, sourceDailyReportId: sunriseDay2.id },
    data: { status: "RECEIVED", receivedDate: addDays(projectStart, 3) },
  });
  await prisma.changeOrder.updateMany({
    where: { jobId: sunriseDuplex.id, sourceDailyReportId: sunriseDay2.id },
    data: { status: "APPROVED", revenueAmount: 2600, costAmount: 1700, approvedAt: addDays(projectStart, 3) },
  });
  const sunriseFootingCO = await prisma.changeOrder.findFirstOrThrow({
    where: { jobId: sunriseDuplex.id, sourceDailyReportId: sunriseDay2.id },
  });
  // Still mid-project (day 5 of 7) — a real Contract/SOV, but not billed yet.
  await seedContract(sunriseDuplex.id, 42000, {
    retainagePct: 10,
    executedDate: addDays(projectStart, -3),
    extraLines: [{ description: `CO: ${sunriseFootingCO.title}`, scheduledValue: 2600, sourceChangeOrderId: sunriseFootingCO.id }],
  });
  const sunriseDay4 = await prisma.dailyReport.create({
    data: {
      jobId: sunriseDuplex.id,
      date: addDays(projectStart, 3),
      crewSize: 2,
      workCompleted: "Rebar arrived, poured slab section B — back on a normal pace",
      submittedById: diego.id,
    },
  });
  await prisma.productionEntry.create({
    data: {
      jobCostCodeId: sunriseSlab.id,
      dailyReportId: sunriseDay4.id,
      date: sunriseDay4.date,
      hours: 15,
      quantity: 15,
      crewSize: 2,
      enteredById: diego.id,
    },
  });
  await prisma.dailyReport.update({ where: { id: sunriseDay4.id }, data: { hours: 15, quantityInstalled: "15 CY Concrete slab on grade" } });

  // Day 5 (today) — continued recovery, plus a fresh equipment issue so the
  // EQUIPMENT_ISSUE alert has something live and unresolved to show.
  const sunriseDay5 = await prisma.dailyReport.create({
    data: {
      jobId: sunriseDuplex.id,
      date: addDays(projectStart, 4),
      crewSize: 2,
      workCompleted: "Poured slab section C, cut short by rain",
      equipmentIssue: "Pump truck losing prime intermittently, slowing today's pour",
      tomorrowPlan: "Finish remaining slab area, weather permitting",
      submittedById: diego.id,
    },
  });
  await prisma.productionEntry.create({
    data: {
      jobCostCodeId: sunriseSlab.id,
      dailyReportId: sunriseDay5.id,
      date: sunriseDay5.date,
      hours: 15,
      quantity: 14,
      crewSize: 2,
      enteredById: diego.id,
      notes: "Rain delay cut the afternoon pour short",
    },
  });
  await prisma.dailyReport.update({ where: { id: sunriseDay5.id }, data: { hours: 15, quantityInstalled: "14 CY Concrete slab on grade" } });

  // Ready-mix concrete was ordered by the PM at award time, not field-flagged
  // — a realistic mix of PM-initiated and field-initiated procurement.
  await prisma.materialRequest.create({
    data: {
      jobId: sunriseDuplex.id,
      description: "Ready-mix concrete, 3500 PSI",
      quantity: 60,
      unit: "CY",
      status: "RECEIVED",
      vendorId: summitConcrete.id,
      poNumber: "PO-2201",
      unitCost: 162,
      totalCost: 9720,
      expectedDeliveryDate: addDays(projectStart, 2),
      receivedDate: addDays(projectStart, 2),
      // PM-ordered and already paid — a paid material next to the
      // still-outstanding rebar-shortage request above, real AP variety
      // rather than everything on this job reading as unpaid by default.
      paidDate: addDays(projectStart, 3),
      requestedById: diego.id,
    },
  });

  const miniExcavator = await prisma.equipment.create({
    data: { companyId: company.id, name: "Mini excavator", type: "Excavator", ownership: "RENTED", dailyRentalCost: 380 },
  });
  await prisma.equipmentAssignment.create({
    data: {
      equipmentId: miniExcavator.id,
      jobId: sunriseDuplex.id,
      startDate: addDays(projectStart, 0),
      endDate: addDays(projectStart, 0),
      actualPickupDate: addDays(projectStart, 0),
      actualReturnDate: addDays(projectStart, 0),
    },
  });
  const pumpTruck = await prisma.equipment.create({
    data: { companyId: company.id, name: "Small line pump", type: "Pump truck", ownership: "RENTED", dailyRentalCost: 420 },
  });
  await prisma.equipmentAssignment.create({
    data: {
      equipmentId: pumpTruck.id,
      jobId: sunriseDuplex.id,
      startDate: addDays(projectStart, 2),
      endDate: projectEnd,
      actualPickupDate: addDays(projectStart, 2),
    },
  });

  const blueLinePumping = await seedVendor(company.id, "Blue Line Concrete Pumping", { trade: "Concrete pumping", contactInfo: "555-0804" });
  await prisma.subcontract.create({
    data: {
      jobId: sunriseDuplex.id,
      vendorId: blueLinePumping.id,
      description: "Pump operator, slab pours",
      committedAmount: 2800,
      actualAmount: 1400,
      status: "INVOICED",
      agreementStatus: "EXECUTED",
      executedDate: projectStart,
      coiExpirationDate: addDays(today, 90),
    },
  });

  // --- A second small-crew project, already closed out, on fixed (not
  // "today"-relative) dates — so the full award-to-closeout arc is visible
  // any time the app is viewed rather than only mid-project like Sunrise
  // Duplex above: a labor slip, a material shortage, a change condition,
  // recovery from all three, and billing readiness actually reaching
  // "ready to invoice" with a paid invoice at the end. ---

  const tasha = await prisma.worker.create({
    data: { companyId: company.id, name: "Tasha Coleman", role: "Concrete Foreman", phone: "555-0403", laborRate: 56 },
  });
  const reggie = await prisma.worker.create({
    data: { companyId: company.id, name: "Reggie Lin", role: "Laborer", phone: "555-0404", laborRate: 32 },
  });
  const ferrisResidence = await prisma.customer.create({
    data: { companyId: company.id, name: "Ferris Residence", address: "77 Cedar Court", phone: "555-0501" },
  });

  const cedarStart = new Date("2026-08-03");
  const cedarEnd = new Date("2026-08-09");

  const cedarCourt = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-006`,
      title: "Cedar Court — Patio & Walkway Slab",
      description: "Excavation and slab-on-grade for a backyard patio and connecting walkway",
      address: "77 Cedar Court",
      status: "COMPLETED",
      projectType: "Residential patio & walkway",
      customerId: ferrisResidence.id,
      assignments: { create: [{ workerId: tasha.id }, { workerId: reggie.id }] },
      contractValue: 28500,
      pmUserId: priya.id,
      foremanWorkerId: tasha.id,
      targetStartDate: cedarStart,
      targetEndDate: cedarEnd,
      stage: "COMPLETE",
      punchListComplete: true,
      requiredDocsComplete: true,
    },
  });

  for (const stage of ["PRECON", "MOBILIZATION", "ACTIVE", "PUNCH_LIST", "CLOSEOUT", "COMPLETE"] as const) {
    await generateChecklistForStage(prisma, cedarCourt.id, stage);
  }
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: cedarCourt.id },
    data: { done: true, doneAt: cedarEnd, doneById: tasha.id },
  });

  await prisma.jobBudget.createMany({
    data: [
      { jobId: cedarCourt.id, category: "LABOR", estimatedAmount: 3200 },
      { jobId: cedarCourt.id, category: "MATERIAL", estimatedAmount: 6800 },
      { jobId: cedarCourt.id, category: "EQUIPMENT", estimatedAmount: 900 },
      { jobId: cedarCourt.id, category: "SUBCONTRACTOR", estimatedAmount: 1200 },
    ],
  });

  await prisma.scheduleAssignment.createMany({
    data: Array.from({ length: 7 }, (_, i) => i).flatMap((offset) => [
      { workerId: tasha.id, jobId: cedarCourt.id, date: addDays(cedarStart, offset) },
      { workerId: reggie.id, jobId: cedarCourt.id, date: addDays(cedarStart, offset) },
    ]),
  });

  const cedarExcavation = await prisma.jobCostCode.create({
    data: { jobId: cedarCourt.id, costCodeId: excavation.id, estimatedQty: 20, estimatedHours: 14 }, // 0.7 hrs/CY
  });
  const cedarSlab = await prisma.jobCostCode.create({
    data: { jobId: cedarCourt.id, costCodeId: concreteSlab.id, estimatedQty: 35, estimatedHours: 30 }, // 0.857 hrs/CY
  });

  // Day 1 — excavation, on pace.
  const cedarDay1 = await prisma.dailyReport.create({
    data: { jobId: cedarCourt.id, date: addDays(cedarStart, 0), crewSize: 2, workCompleted: "Excavation and grading complete", submittedById: tasha.id },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: cedarExcavation.id, dailyReportId: cedarDay1.id, date: cedarDay1.date, hours: 13, quantity: 20, crewSize: 2, enteredById: tasha.id },
  });
  await prisma.dailyReport.update({ where: { id: cedarDay1.id }, data: { hours: 13, quantityInstalled: "20 CY Excavation" } });

  // Day 2 — the shortage and the change condition both surface on one report.
  const cedarDay2 = await prisma.dailyReport.create({
    data: {
      jobId: cedarCourt.id,
      date: addDays(cedarStart, 1),
      crewSize: 2,
      hours: 12,
      workCompleted: "Set forms, began rebar placement",
      blockers: "Waiting on additional rebar before the slab pour can start",
      materialNeeded: "Short 2 tons #4 rebar — original delivery undercounted",
      hasChangeCondition: true,
      changeConditionNotes: "Found a buried irrigation line not shown on plans, needs reroute before the slab pour",
      submittedById: tasha.id,
    },
  });
  await prisma.materialRequest.create({
    data: {
      jobId: cedarCourt.id,
      description: "Short 2 tons #4 rebar — original delivery undercounted",
      quantity: 2,
      unit: "TON",
      status: "ORDERED",
      vendorId: metroRebar.id,
      poNumber: "PO-3301",
      unitCost: 1180,
      totalCost: 2360,
      expectedDeliveryDate: addDays(cedarStart, 3),
      requestedById: tasha.id,
      sourceDailyReportId: cedarDay2.id,
    },
  });
  await prisma.changeOrder.create({
    data: {
      jobId: cedarCourt.id,
      title: "Found a buried irrigation line not shown on plans, needs reroute before",
      description: "Found a buried irrigation line not shown on plans, needs reroute before the slab pour",
      sourceDailyReportId: cedarDay2.id,
      createdById: tasha.id,
    },
  });

  // Day 3 — the slip: rework on the irrigation line eats into pour time, and
  // the pace on the slab that does get poured runs well over estimate.
  const cedarDay3 = await prisma.dailyReport.create({
    data: { jobId: cedarCourt.id, date: addDays(cedarStart, 2), crewSize: 2, workCompleted: "Rerouted irrigation line, began slab pour section A", submittedById: tasha.id },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: cedarSlab.id, dailyReportId: cedarDay3.id, date: cedarDay3.date, hours: 11, quantity: 9, crewSize: 2, enteredById: tasha.id, notes: "Irrigation line rework cut into pour time" },
  });
  await prisma.dailyReport.update({ where: { id: cedarDay3.id }, data: { hours: 11, quantityInstalled: "9 CY Concrete slab on grade" } });

  // Day 4 — recovery starts: rebar arrives, the change order is priced and
  // approved, pace comes back close to estimate.
  await prisma.materialRequest.updateMany({
    where: { jobId: cedarCourt.id, sourceDailyReportId: cedarDay2.id },
    data: { status: "RECEIVED", receivedDate: addDays(cedarStart, 3), paidDate: addDays(cedarStart, 9) },
  });
  await prisma.changeOrder.updateMany({
    where: { jobId: cedarCourt.id, sourceDailyReportId: cedarDay2.id },
    data: { status: "APPROVED", revenueAmount: 2200, costAmount: 1400, approvedAt: addDays(cedarStart, 3) },
  });
  const cedarIrrigationCO = await prisma.changeOrder.findFirstOrThrow({
    where: { jobId: cedarCourt.id, sourceDailyReportId: cedarDay2.id },
  });
  const cedarDay4 = await prisma.dailyReport.create({
    data: { jobId: cedarCourt.id, date: addDays(cedarStart, 3), crewSize: 2, workCompleted: "Rebar arrived, poured slab section B — back to a normal pace", submittedById: tasha.id },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: cedarSlab.id, dailyReportId: cedarDay4.id, date: cedarDay4.date, hours: 9, quantity: 10, crewSize: 2, enteredById: tasha.id },
  });
  await prisma.dailyReport.update({ where: { id: cedarDay4.id }, data: { hours: 9, quantityInstalled: "10 CY Concrete slab on grade" } });

  // Day 5 — continued recovery, slightly ahead of pace to help make up lost ground.
  const cedarDay5 = await prisma.dailyReport.create({
    data: { jobId: cedarCourt.id, date: addDays(cedarStart, 4), crewSize: 2, workCompleted: "Poured slab section C, caught back up to schedule", submittedById: tasha.id },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: cedarSlab.id, dailyReportId: cedarDay5.id, date: cedarDay5.date, hours: 9, quantity: 11, crewSize: 2, enteredById: tasha.id },
  });
  await prisma.dailyReport.update({ where: { id: cedarDay5.id }, data: { hours: 9, quantityInstalled: "11 CY Concrete slab on grade" } });

  // Day 6 — final pour, punch list walk begins.
  const cedarDay6 = await prisma.dailyReport.create({
    data: { jobId: cedarCourt.id, date: addDays(cedarStart, 5), crewSize: 2, workCompleted: "Finished slab pour section D, began punch list walk", submittedById: tasha.id },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: cedarSlab.id, dailyReportId: cedarDay6.id, date: cedarDay6.date, hours: 5, quantity: 5, crewSize: 2, enteredById: tasha.id },
  });
  await prisma.dailyReport.update({ where: { id: cedarDay6.id }, data: { hours: 5, quantityInstalled: "5 CY Concrete slab on grade" } });

  // Day 7 — punch list complete, ready for the customer walkthrough.
  await prisma.dailyReport.create({
    data: {
      jobId: cedarCourt.id,
      date: addDays(cedarStart, 6),
      crewSize: 2,
      workCompleted: "Completed punch list items, site cleaned up, ready for walkthrough",
      submittedById: tasha.id,
    },
  });

  await prisma.materialRequest.create({
    data: {
      jobId: cedarCourt.id,
      description: "Ready-mix concrete, 3500 PSI",
      quantity: 35,
      unit: "CY",
      status: "RECEIVED",
      vendorId: (await seedVendor(company.id, "Cedar Ready Mix", { trade: "Ready-mix concrete" })).id,
      poNumber: "PO-3290",
      unitCost: 160,
      totalCost: 5600,
      expectedDeliveryDate: addDays(cedarStart, 2),
      receivedDate: addDays(cedarStart, 2),
      // Closed out and fully paid — same narrative as the pay app and
      // subcontract below, so nothing here should show up as outstanding AP.
      paidDate: addDays(cedarStart, 9),
      requestedById: tasha.id,
    },
  });

  const cedarMiniExcavator = await prisma.equipment.create({
    data: { companyId: company.id, name: "Compact excavator", type: "Excavator", ownership: "RENTED", dailyRentalCost: 320 },
  });
  await prisma.equipmentAssignment.create({
    data: {
      equipmentId: cedarMiniExcavator.id,
      jobId: cedarCourt.id,
      startDate: cedarStart,
      endDate: cedarStart,
      actualPickupDate: cedarStart,
      actualReturnDate: cedarStart,
    },
  });

  const precisionSawCutting = await seedVendor(company.id, "Precision Saw Cutting", { trade: "Concrete cutting" });
  await prisma.subcontract.create({
    data: {
      jobId: cedarCourt.id,
      vendorId: precisionSawCutting.id,
      description: "Control joint saw-cutting",
      committedAmount: 1200,
      actualAmount: 1200,
      status: "PAID",
      agreementStatus: "CLOSED",
      executedDate: cedarStart,
      retainagePct: 8,
      // AP-side closeout retainage release (lib/subcontract-actions.ts's
      // releaseSubcontractRetainage) — already paid out, not just held.
      retainageReleasedAt: addDays(cedarStart, 10),
    },
  });

  // Closed out and fully paid, including a real retainage release — same
  // full closeout event as Harbor View Foundation above, not a
  // 0%-retainage workaround.
  const cedarContract = await seedContract(cedarCourt.id, 28500, {
    retainagePct: 8,
    executedDate: addDays(cedarStart, -5),
    extraLines: [{ description: `CO: ${cedarIrrigationCO.title}`, scheduledValue: 2200, sourceChangeOrderId: cedarIrrigationCO.id }],
  });
  await seedPayApplication({
    jobId: cedarCourt.id,
    invoiceNumber: "INV-3001",
    date: new Date("2026-08-11"),
    status: "PAID",
    retainagePct: 8,
    lines: cedarContract.lines.map((l) => ({ contractLineId: l.id, scheduledValue: l.scheduledValue, priorPct: 0, newPct: 100 })),
  });
  await seedRetainageRelease({
    jobId: cedarCourt.id,
    contractId: cedarContract.contract.id,
    invoiceNumber: "INV-3002",
    date: addDays(cedarStart, 12),
  });

  // Cedar Court is COMPLETE, so its finished cost-code lines join the
  // estimating history — same automation that fires from the app when a PM
  // moves a job's stage to COMPLETE (see recordBenchmarksForCompletedJob).
  await prisma.costCodeBenchmark.create({
    data: {
      jobId: cedarCourt.id,
      costCodeId: excavation.id,
      projectType: "Residential patio & walkway",
      foremanWorkerId: tasha.id,
      estimatedQty: 20,
      estimatedHours: 14,
      actualQty: 20,
      actualHours: 13,
      estimatedRate: 14 / 20,
      actualRate: 13 / 20,
      variancePct: (13 / 20 - 14 / 20) / (14 / 20),
    },
  });
  await prisma.costCodeBenchmark.create({
    data: {
      jobId: cedarCourt.id,
      costCodeId: concreteSlab.id,
      projectType: "Residential patio & walkway",
      foremanWorkerId: tasha.id,
      estimatedQty: 35,
      estimatedHours: 30,
      actualQty: 35,
      actualHours: 34,
      estimatedRate: 30 / 35,
      actualRate: 34 / 35,
      variancePct: (34 / 35 - 30 / 35) / (30 / 35),
    },
  });

  // Three more completed jobs on the rebar-placement cost code, giving the
  // estimating-accuracy dashboard a clean "consistently underestimated"
  // signal (~19% avg variance, same direction every time) — the concrete
  // slab data above is close enough to the estimate that alone it wouldn't
  // clearly demonstrate that verdict. These are minimal historical anchors:
  // no daily reports, just the cost-code line, one production entry, and
  // the resulting benchmark, as if entered at project close-out.
  const rebarHistoryJobs: { title: string; jobNumber: string; estQty: number; estHours: number; actQty: number; actHours: number }[] = [
    { title: "Cove Street Duplex — Rebar Package", jobNumber: `${SEED_YEAR}-007`, estQty: 8, estHours: 32, actQty: 8, actHours: 38 },
    { title: "Birchwood Row — Rebar Package", jobNumber: `${SEED_YEAR}-008`, estQty: 10, estHours: 40, actQty: 10, actHours: 47 },
    { title: "Elm Terrace — Rebar Package", jobNumber: `${SEED_YEAR}-009`, estQty: 6, estHours: 24, actQty: 6, actHours: 29 },
  ];
  for (const rh of rebarHistoryJobs) {
    const historicJob = await prisma.job.create({
      data: {
        companyId: company.id,
        customerId: harborView.id,
        jobNumber: rh.jobNumber,
        title: rh.title,
        address: "Historical record — no site work tracked",
        stage: "COMPLETE",
        status: "COMPLETED",
        projectType: "Foundation pour",
        pmUserId: priya.id,
        foremanWorkerId: frank.id,
        contractValue: rh.actHours * 95,
      },
    });
    const historicCostCode = await prisma.jobCostCode.create({
      data: { jobId: historicJob.id, costCodeId: rebarPlacement.id, estimatedQty: rh.estQty, estimatedHours: rh.estHours },
    });
    await prisma.productionEntry.create({
      data: {
        jobCostCodeId: historicCostCode.id,
        date: new Date(`${SEED_YEAR - 1}-09-15`),
        hours: rh.actHours,
        quantity: rh.actQty,
        crewSize: 2,
        enteredById: frank.id,
      },
    });
    const estRate = rh.estHours / rh.estQty;
    const actRate = rh.actHours / rh.actQty;
    await prisma.costCodeBenchmark.create({
      data: {
        jobId: historicJob.id,
        costCodeId: rebarPlacement.id,
        projectType: "Foundation pour",
        foremanWorkerId: frank.id,
        estimatedQty: rh.estQty,
        estimatedHours: rh.estHours,
        actualQty: rh.actQty,
        actualHours: rh.actHours,
        estimatedRate: estRate,
        actualRate: actRate,
        variancePct: (actRate - estRate) / estRate,
      },
    });
  }

  // --- Three more simultaneous, currently-active projects (Company
  // Operating Core V1) — each demonstrating one condition cleanly, so the
  // Company Command Center's risk buckets are each populated by a project
  // whose *only* problem is that bucket's problem, not a blend. Dates are
  // relative to "today" (declared above for Sunrise Duplex) so the demo
  // stays current no matter when the seed runs. Riverside Phase 2 above
  // already demonstrates a labor+change-work blend, and Sunrise Duplex a
  // full recovery arc — these three are deliberately narrower. ---

  const carlos = await prisma.worker.create({
    data: { companyId: company.id, name: "Carlos Nguyen", role: "Foreman", phone: "555-0601", laborRate: 54 },
  });
  const sam = await prisma.worker.create({
    data: { companyId: company.id, name: "Sam Patel", role: "Foreman", phone: "555-0602", laborRate: 55 },
  });
  const wanda = await prisma.worker.create({
    data: { companyId: company.id, name: "Wanda Ellis", role: "Foreman", phone: "555-0603", laborRate: 53 },
  });

  const oakridgeMedical = await prisma.customer.create({
    data: { companyId: company.id, name: "Oakridge Medical Group", address: "410 Oakridge Pkwy", phone: "555-0700" },
  });
  const baysideDevelopment = await prisma.customer.create({
    data: { companyId: company.id, name: "Bayside Development LLC", address: "9 Bayside Loop", phone: "555-0701" },
  });
  const fairviewDistrict = await prisma.customer.create({
    data: { companyId: company.id, name: "Fairview School District", address: "500 Fairview Ave", phone: "555-0702" },
  });

  const drywallFraming = await prisma.costCode.create({
    data: { companyId: company.id, code: "09 20 00", description: "Drywall and metal-stud framing", unit: "SF" },
  });
  const roofShingle = await prisma.costCode.create({
    data: { companyId: company.id, code: "07 30 00", description: "Roof shingle replacement", unit: "SQ" },
  });

  // Project A — healthy, on-budget, on-schedule. Should show up nowhere in
  // Company Command's risk buckets.
  const oakridge = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-010`,
      title: "Oakridge Medical Office — TI Buildout",
      description: "Interior tenant improvement — framing, drywall, MEP rough-in",
      address: "410 Oakridge Pkwy, Suite 200",
      status: "IN_PROGRESS",
      projectType: "Commercial TI",
      customerId: oakridgeMedical.id,
      assignments: { create: [{ workerId: carlos.id }, { workerId: alice.id }] },
      contractValue: 100000,
      pmUserId: priya.id,
      foremanWorkerId: carlos.id,
      targetStartDate: addDays(today, -10),
      targetEndDate: addDays(today, 20),
      stage: "ACTIVE",
    },
  });
  await generateChecklistForStage(prisma, oakridge.id, "PRECON");
  await generateChecklistForStage(prisma, oakridge.id, "ACTIVE");
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: oakridge.id, stage: "PRECON" },
    data: { done: true, doneAt: addDays(today, -11), doneById: carlos.id },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: oakridge.id, category: "LABOR", estimatedAmount: 26000 },
      { jobId: oakridge.id, category: "MATERIAL", estimatedAmount: 41000 },
      { jobId: oakridge.id, category: "SUBCONTRACTOR", estimatedAmount: 18000 },
    ],
  });
  const oakridgeDrywall = await prisma.jobCostCode.create({
    data: { jobId: oakridge.id, costCodeId: drywallFraming.id, estimatedQty: 2400, estimatedHours: 480 }, // 0.2 hrs/SF
  });
  for (const offset of [-9, -8, -7, -6]) {
    const rDate = addDays(today, offset);
    const dr = await prisma.dailyReport.create({
      data: { jobId: oakridge.id, date: rDate, crewSize: 2, workCompleted: "Framing and drywall on pace, no issues", submittedById: carlos.id },
    });
    await prisma.productionEntry.create({
      data: { jobCostCodeId: oakridgeDrywall.id, dailyReportId: dr.id, date: rDate, hours: 8, quantity: 40, crewSize: 2, enteredById: carlos.id },
    });
    await prisma.dailyReport.update({ where: { id: dr.id }, data: { hours: 8, quantityInstalled: "40 SF framed and hung" } });
  }
  await prisma.scheduleAssignment.createMany({
    data: [-1, 0, 1].flatMap((offset) => [
      { workerId: carlos.id, jobId: oakridge.id, date: addDays(today, offset) },
      { workerId: alice.id, jobId: oakridge.id, date: addDays(today, offset) },
    ]),
  });
  // Healthy and 10 days in — already through its first pay application,
  // billing cleanly with no drama, distinct from Riverside Phase 2's more
  // complex labor+CO story above.
  const oakridgeContract = await seedContract(oakridge.id, 100000, {
    retainagePct: 10,
    executedDate: addDays(today, -18),
  });
  const [oakridgeMob, oakridgeConstruction] = oakridgeContract.lines;
  await seedPayApplication({
    jobId: oakridge.id,
    invoiceNumber: "INV-4001",
    date: addDays(today, -5),
    status: "PAID",
    retainagePct: 10,
    lines: [
      { contractLineId: oakridgeMob.id, scheduledValue: oakridgeMob.scheduledValue, priorPct: 0, newPct: 100 },
      { contractLineId: oakridgeConstruction.id, scheduledValue: oakridgeConstruction.scheduledValue, priorPct: 0, newPct: 30 },
    ],
  });
  // A second pay app, billed but not yet collected — real 0-30-bucket AR
  // instead of every open invoice living on Riverside Phase 2 alone.
  await seedPayApplication({
    jobId: oakridge.id,
    invoiceNumber: "INV-4002",
    date: addDays(today, -3),
    status: "SENT",
    retainagePct: 10,
    lines: [
      { contractLineId: oakridgeConstruction.id, scheduledValue: oakridgeConstruction.scheduledValue, priorPct: 30, newPct: 55 },
    ],
  });

  // Project C — schedule risk only: production is reasonable, the calendar
  // has simply slipped past the target finish while the job is still open.
  const bayside = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-011`,
      title: "Bayside Retail Pad — Sitework",
      description: "Excavation and grading for a new retail pad site",
      address: "9 Bayside Loop",
      status: "IN_PROGRESS",
      projectType: "Site work",
      customerId: baysideDevelopment.id,
      assignments: { create: [{ workerId: sam.id }, { workerId: bob.id }] },
      contractValue: 210000,
      pmUserId: priya.id,
      foremanWorkerId: sam.id,
      targetStartDate: addDays(today, -35),
      targetEndDate: addDays(today, -3),
      stage: "ACTIVE",
    },
  });
  await generateChecklistForStage(prisma, bayside.id, "PRECON");
  await generateChecklistForStage(prisma, bayside.id, "ACTIVE");
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: bayside.id, stage: "PRECON" },
    data: { done: true, doneAt: addDays(today, -36), doneById: sam.id },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: bayside.id, category: "LABOR", estimatedAmount: 8500 },
      { jobId: bayside.id, category: "EQUIPMENT", estimatedAmount: 12000 },
      { jobId: bayside.id, category: "MATERIAL", estimatedAmount: 25000 },
      { jobId: bayside.id, category: "SUBCONTRACTOR", estimatedAmount: 130000 },
    ],
  });
  const coastalPaving = await seedVendor(company.id, "Coastal Paving Co", { trade: "Paving & sitework", contactInfo: "555-0805" });
  await prisma.subcontract.create({
    data: {
      jobId: bayside.id,
      vendorId: coastalPaving.id,
      description: "Grading, utility tie-ins, and asphalt paving",
      committedAmount: 130000,
      actualAmount: 0,
      status: "COMMITTED",
      agreementStatus: "EXECUTED",
      executedDate: addDays(today, -35),
      retainagePct: 10,
      coiExpirationDate: addDays(today, 60),
    },
  });
  const baysideExcavation = await prisma.jobCostCode.create({
    data: { jobId: bayside.id, costCodeId: excavation.id, estimatedQty: 150, estimatedHours: 110 }, // 0.733 hrs/CY
  });
  for (const [offset, hours, qty] of [
    [-6, 9, 12],
    [-4, 9, 12],
    [-1, 8, 11],
  ] as const) {
    const rDate = addDays(today, offset);
    const dr = await prisma.dailyReport.create({
      data: {
        jobId: bayside.id,
        date: rDate,
        crewSize: 2,
        workCompleted: "Excavation continuing — behind the original finish date after a permit delay in week 2, but production itself is steady",
        submittedById: sam.id,
      },
    });
    await prisma.productionEntry.create({
      data: { jobCostCodeId: baysideExcavation.id, dailyReportId: dr.id, date: rDate, hours, quantity: qty, crewSize: 2, enteredById: sam.id },
    });
    await prisma.dailyReport.update({ where: { id: dr.id }, data: { hours, quantityInstalled: `${qty} CY excavated` } });
  }
  await prisma.scheduleAssignment.createMany({
    data: [-1, 0, 1].flatMap((offset) => [
      { workerId: sam.id, jobId: bayside.id, date: addDays(today, offset) },
      { workerId: bob.id, jobId: bayside.id, date: addDays(today, offset) },
    ]),
  });
  // SOV set up at award; the schedule slip hasn't stopped billing from
  // being possible — one pay app went out early on, still unpaid over a
  // month later, a real 31-60-bucket AR row instead of everything on this
  // job reading as billing-ready-but-untouched.
  const baysideContract = await seedContract(bayside.id, 210000, { retainagePct: 10, executedDate: addDays(today, -37) });
  const [baysideMob] = baysideContract.lines;
  await seedPayApplication({
    jobId: bayside.id,
    invoiceNumber: "INV-5001",
    date: addDays(today, -32),
    status: "SENT",
    retainagePct: 10,
    lines: [{ contractLineId: baysideMob.id, scheduledValue: baysideMob.scheduledValue, priorPct: 0, newPct: 100 }],
  });

  // Project D — material risk only: labor's on pace, but a shingle order is
  // overdue and the crew can't close in the affected area without it.
  const fairview = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-012`,
      title: "Fairview Elementary — Roof Replacement",
      description: "Full roof tear-off and shingle replacement, occupied building",
      address: "500 Fairview Ave",
      status: "IN_PROGRESS",
      projectType: "Roofing",
      customerId: fairviewDistrict.id,
      assignments: { create: [{ workerId: wanda.id }] },
      contractValue: 138000,
      pmUserId: priya.id,
      foremanWorkerId: wanda.id,
      targetStartDate: addDays(today, -15),
      targetEndDate: addDays(today, 15),
      stage: "ACTIVE",
    },
  });
  await generateChecklistForStage(prisma, fairview.id, "PRECON");
  await generateChecklistForStage(prisma, fairview.id, "ACTIVE");
  await prisma.jobChecklistItem.updateMany({
    where: { jobId: fairview.id, stage: "PRECON" },
    data: { done: true, doneAt: addDays(today, -16), doneById: wanda.id },
  });
  await prisma.jobBudget.createMany({
    data: [
      { jobId: fairview.id, category: "LABOR", estimatedAmount: 13000 },
      { jobId: fairview.id, category: "MATERIAL", estimatedAmount: 95000 },
    ],
  });
  const fairviewRoof = await prisma.jobCostCode.create({
    data: { jobId: fairview.id, costCodeId: roofShingle.id, estimatedQty: 80, estimatedHours: 240 }, // 3 hrs/SQ
  });
  const fairviewReportDate = addDays(today, -1);
  const fairviewReport = await prisma.dailyReport.create({
    data: {
      jobId: fairview.id,
      date: fairviewReportDate,
      crewSize: 1,
      workCompleted: "Tear-off and dry-in complete on the north slope, waiting on shingles to close it in",
      materialNeeded: "Shingle delivery is late — crew is idle on the north slope until it arrives",
      submittedById: wanda.id,
    },
  });
  await prisma.productionEntry.create({
    data: { jobCostCodeId: fairviewRoof.id, dailyReportId: fairviewReport.id, date: fairviewReportDate, hours: 24, quantity: 8, crewSize: 1, enteredById: wanda.id },
  });
  await prisma.dailyReport.update({ where: { id: fairviewReport.id }, data: { hours: 24, quantityInstalled: "8 SQ torn off and dried in" } });
  await prisma.materialRequest.create({
    data: {
      jobId: fairview.id,
      description: "30-year architectural shingles, matching color",
      quantity: 80,
      unit: "SQ",
      status: "ORDERED",
      vendorId: (await seedVendor(company.id, "Statewide Roofing Supply", { trade: "Roofing materials" })).id,
      poNumber: "PO-4410",
      unitCost: 210,
      totalCost: 16800,
      expectedDeliveryDate: addDays(today, -6),
      requestedById: wanda.id,
      sourceDailyReportId: fairviewReport.id,
    },
  });
  await prisma.scheduleAssignment.create({ data: { workerId: wanda.id, jobId: fairview.id, date: today } });
  await seedContract(fairview.id, 138000, { retainagePct: 10, executedDate: addDays(today, -17) });

  // --- The bid pipeline (Opportunity -> Bid -> Estimate -> Award) — two
  // wins (each actually converted into a real Job, the same way the Award
  // form's ?opportunityId= prefill does it), two losses and a no-bid with
  // reasons (so win-rate reporting has real decided bids to compute from),
  // and two still-open bids (one with a cost-code line, to show the
  // historical-rate panel live on a bid before it's even submitted). ---

  const wonHarborSitework = await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B001`,
      title: "Harbor View Corporate Campus — Sitework Package",
      customerId: harborView.id,
      source: "Repeat client",
      projectType: "Site work",
      estimatedValue: 340000,
      probability: 80,
      bidDueDate: addDays(today, -20),
      assignedToUserId: priya.id,
      stage: "WON",
    },
  });
  await prisma.opportunityCostCode.create({
    data: { opportunityId: wonHarborSitework.id, costCodeId: excavation.id, estimatedQty: 500, estimatedHours: 365 },
  });
  const harborSiteworkJob = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-013`,
      title: wonHarborSitework.title,
      address: harborView.address,
      status: "SCHEDULED",
      projectType: "Site work",
      customerId: harborView.id,
      contractValue: 340000,
      pmUserId: priya.id,
      targetStartDate: addDays(today, 10),
      targetEndDate: addDays(today, 55),
      stage: "PRECON",
      // Permit already in hand, well ahead of mobilization and nowhere
      // near expiring — the healthy baseline case (no alert).
      permitNumber: "HBV-2026-0311",
      permitIssuedDate: addDays(today, -20),
      permitExpirationDate: addDays(today, 365),
    },
  });
  await prisma.jobCostCode.create({
    data: { jobId: harborSiteworkJob.id, costCodeId: excavation.id, estimatedQty: 500, estimatedHours: 365 },
  });
  await generateChecklistForStage(prisma, harborSiteworkJob.id, "PRECON");
  await prisma.opportunity.update({
    where: { id: wonHarborSitework.id },
    data: { wonJobId: harborSiteworkJob.id },
  });
  // Just awarded, hasn't broken ground yet — the SOV a real Award would
  // create from the bid line, no billing history yet.
  await seedContract(harborSiteworkJob.id, 340000, { retainagePct: 10, executedDate: addDays(today, -2) });

  // Bid leveling, live on this same not-yet-mobilized job: one package
  // already decided (mirrors exactly what lib/subbid-actions.ts's
  // selectSubBidWinner does — SELECTED bid, REJECTED runner-up, a real
  // Subcontract created with sourceSubBidId set), one still open so the
  // demo shows a real in-progress comparison, not just the finished state.
  const titanDemolition = await seedVendor(company.id, "Titan Demolition", { trade: "Demolition", contactInfo: "555-0901" });
  const demoPackage = await prisma.bidPackage.create({
    data: {
      jobId: harborSiteworkJob.id,
      title: "Demolition & site clearing",
      scope: "Clear existing pad and curb work, demo to grade, haul debris off site before excavation mobilizes.",
      dueDate: addDays(today, -8),
      status: "AWARDED",
    },
  });
  const demoWinningBid = await prisma.subBid.create({
    data: {
      bidPackageId: demoPackage.id,
      vendorId: titanDemolition.id,
      amount: 18500,
      status: "SELECTED",
      scopeNotes: "Full clearing to grade, debris hauled and disposed, no salvage credit",
      receivedDate: addDays(today, -10),
    },
  });
  await prisma.subBid.create({
    data: {
      bidPackageId: demoPackage.id,
      vendorId: coastalPaving.id,
      amount: 21000,
      status: "REJECTED",
      scopeNotes: "Clearing to grade only",
      exclusions: "Excludes debris haul-off — billed separately by the ton",
      receivedDate: addDays(today, -9),
    },
  });
  await prisma.subcontract.create({
    data: {
      jobId: harborSiteworkJob.id,
      vendorId: titanDemolition.id,
      description: demoPackage.title,
      committedAmount: 18500,
      agreementStatus: "EXECUTED",
      executedDate: addDays(today, -7),
      retainagePct: 10,
      sourceSubBidId: demoWinningBid.id,
    },
  });

  const greenShield = await seedVendor(company.id, "Green Shield Erosion Control", { trade: "Erosion control", contactInfo: "555-0902" });
  const bayviewSite = await seedVendor(company.id, "Bayview Site Services", { trade: "Site services", contactInfo: "555-0903" });
  const erosionPackage = await prisma.bidPackage.create({
    data: {
      jobId: harborSiteworkJob.id,
      title: "Erosion control & haul-off",
      scope: "Silt fence and inlet protection for the full site perimeter, weekly inspection reports, haul-off of accumulated sediment.",
      dueDate: addDays(today, 5),
      status: "OPEN",
    },
  });
  await prisma.subBid.createMany({
    data: [
      {
        bidPackageId: erosionPackage.id,
        vendorId: greenShield.id,
        amount: 9200,
        status: "RECEIVED",
        scopeNotes: "Silt fence, inlet protection, weekly inspections, haul-off included",
        receivedDate: addDays(today, -2),
      },
      {
        // Lower number, but excludes two things the other bid includes — the
        // whole reason a comparison needs scope/exclusions, not just amount.
        bidPackageId: erosionPackage.id,
        vendorId: bayviewSite.id,
        amount: 8400,
        status: "RECEIVED",
        scopeNotes: "Silt fence and inlet protection only",
        exclusions: "Excludes weekly inspection reports and sediment haul-off",
        receivedDate: addDays(today, -1),
      },
    ],
  });
  await prisma.subBid.create({
    data: {
      bidPackageId: erosionPackage.id,
      vendorId: (await seedVendor(company.id, "Ridgeline Environmental", { trade: "Erosion control" })).id,
      status: "DECLINED",
    },
  });

  const wonFairviewFlooring = await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B002`,
      title: "Fairview District — Gym Floor Replacement",
      customerId: fairviewDistrict.id,
      source: "Repeat client",
      projectType: "Flooring",
      estimatedValue: 52000,
      probability: 75,
      bidDueDate: addDays(today, -8),
      assignedToUserId: priya.id,
      stage: "WON",
    },
  });
  const fairviewFlooringJob = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-014`,
      title: wonFairviewFlooring.title,
      address: fairviewDistrict.address,
      status: "SCHEDULED",
      projectType: "Flooring",
      customerId: fairviewDistrict.id,
      contractValue: 52000,
      pmUserId: priya.id,
      targetStartDate: addDays(today, 25),
      targetEndDate: addDays(today, 35),
      stage: "PRECON",
    },
  });
  await generateChecklistForStage(prisma, fairviewFlooringJob.id, "PRECON");
  await prisma.opportunity.update({
    where: { id: wonFairviewFlooring.id },
    data: { wonJobId: fairviewFlooringJob.id },
  });
  await seedContract(fairviewFlooringJob.id, 52000, { retainagePct: 10, executedDate: addDays(today, -6) });

  // Westgate Plaza — a minimal historical anchor (same pattern as the rebar
  // history jobs above: no daily reports, just billing history) for one
  // purpose only: a slow-paying owner on a job that's already finished, so
  // the 61-90 and 90+ AR aging buckets have real rows instead of staying
  // permanently empty in the demo.
  const meridianRetail = await prisma.customer.create({
    data: { companyId: company.id, name: "Meridian Retail Group", address: "88 Westgate Blvd", phone: "555-0900" },
  });
  const westgatePlaza = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-015`,
      title: "Westgate Plaza — Retail Shell",
      address: "88 Westgate Blvd",
      status: "COMPLETED",
      projectType: "Commercial TI",
      customerId: meridianRetail.id,
      contractValue: 68000,
      pmUserId: priya.id,
      targetStartDate: addDays(today, -130),
      targetEndDate: addDays(today, -100),
      stage: "COMPLETE",
    },
  });
  const westgateContract = await seedContract(westgatePlaza.id, 68000, { retainagePct: 10, executedDate: addDays(today, -132) });
  const [westgateMob, westgateConstruction] = westgateContract.lines;
  await seedPayApplication({
    jobId: westgatePlaza.id,
    invoiceNumber: "INV-6001",
    date: addDays(today, -95),
    status: "SENT",
    retainagePct: 10,
    lines: [{ contractLineId: westgateMob.id, scheduledValue: westgateMob.scheduledValue, priorPct: 0, newPct: 100 }],
  });
  await seedPayApplication({
    jobId: westgatePlaza.id,
    invoiceNumber: "INV-6002",
    date: addDays(today, -78),
    status: "SENT",
    retainagePct: 10,
    lines: [{ contractLineId: westgateConstruction.id, scheduledValue: westgateConstruction.scheduledValue, priorPct: 0, newPct: 100 }],
  });
  const westgateDrywall = await seedVendor(company.id, "Precision Drywall & Ceilings", { trade: "Drywall & ceilings", contactInfo: "555-0901" });
  await prisma.subcontract.create({
    data: {
      jobId: westgatePlaza.id,
      vendorId: westgateDrywall.id,
      description: "Interior partition framing and ceiling grid",
      committedAmount: 14000,
      actualAmount: 14000,
      status: "INVOICED",
      agreementStatus: "EXECUTED",
      executedDate: addDays(today, -70),
      retainagePct: 5,
    },
  });

  await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B003`,
      title: "Bayside Development — Phase 2 Retail Pad",
      customerId: baysideDevelopment.id,
      source: "Plan room",
      projectType: "Site work",
      estimatedValue: 280000,
      probability: 40,
      bidDueDate: addDays(today, -15),
      assignedToUserId: priya.id,
      stage: "LOST",
      lostReason: "Price — lost to a lower bidder",
    },
  });
  await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B004`,
      title: "Oakridge Medical — Expansion Wing",
      customerId: oakridgeMedical.id,
      source: "Referral",
      projectType: "Commercial TI",
      estimatedValue: 410000,
      probability: 35,
      bidDueDate: addDays(today, -12),
      assignedToUserId: priya.id,
      stage: "LOST",
      lostReason: "Schedule — couldn't meet their required timeline",
    },
  });
  await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B005`,
      title: "Downtown Parking Structure — Concrete Package",
      prospectName: "Metro Development Group",
      source: "Plan room",
      projectType: "Commercial concrete",
      estimatedValue: 1200000,
      bidDueDate: addDays(today, -5),
      assignedToUserId: priya.id,
      stage: "NO_BID",
      lostReason: "Outside our current bonding capacity",
    },
  });

  const openCoveStreet = await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B006`,
      title: "Cove Street Duplex — Foundation & Framing",
      prospectName: "New prospect — plan room lead",
      source: "Plan room",
      projectType: "Foundation pour",
      estimatedValue: 145000,
      probability: 55,
      bidDueDate: addDays(today, 10),
      assignedToUserId: priya.id,
      stage: "BIDDING",
    },
  });
  await prisma.opportunityCostCode.create({
    data: { opportunityId: openCoveStreet.id, costCodeId: concreteSlab.id, estimatedQty: 180, estimatedHours: 155 },
  });

  await prisma.opportunity.create({
    data: {
      companyId: company.id,
      bidNumber: `${SEED_YEAR}-B007`,
      title: "Elm Terrace — Site Utilities",
      prospectName: "Referral from Harbor View Development",
      source: "Referral",
      projectType: "Site work",
      estimatedValue: 88000,
      probability: 60,
      bidDueDate: addDays(today, 3),
      assignedToUserId: priya.id,
      stage: "SUBMITTED",
    },
  });

  // A small job PM'd by someone other than Priya — the one thing the
  // company's PM roster otherwise never proves: that "My action center"
  // (app/today/page.tsx) actually filters by pmUserId instead of just
  // rendering identically to "show everyone" because there's only one PM.
  const lakeviewCustomer = await prisma.customer.create({
    data: { companyId: company.id, name: "Lakeview HOA", address: "500 Lakeview Terrace" },
  });
  await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
      jobNumber: `${SEED_YEAR}-016`,
      title: "Lakeview Terrace — Roof Repair",
      address: "500 Lakeview Terrace",
      status: "IN_PROGRESS",
      projectType: "Roofing repair",
      customerId: lakeviewCustomer.id,
      contractValue: 26000,
      pmUserId: marcus.id,
      foremanWorkerId: frank.id,
      targetStartDate: addDays(today, -12),
      targetEndDate: addDays(today, -3),
      stage: "ACTIVE",
    },
  });

  // --- A second, unrelated company — proves cross-tenant isolation works,
  // not just that a companyId column exists. Its admin should never be able
  // to see any of the CrewSync Demo GC data seeded above, and vice versa. ---

  await prisma.user.create({
    data: {
      companyId: otherCompany.id,
      name: "Dana Okafor",
      email: "admin@secondco.dev",
      passwordHash: hashPassword("secondco123"),
      role: "ADMIN",
    },
  });
  const secondCoWorker = await prisma.worker.create({
    data: { companyId: otherCompany.id, name: "Sam Torres", role: "Carpenter", phone: "555-0900" },
  });
  const secondCoCustomer = await prisma.customer.create({
    data: { companyId: otherCompany.id, name: "Lakeside Offices", address: "40 Lakeside Blvd" },
  });
  const secondCoJob = await prisma.job.create({
    data: {
      companyId: otherCompany.id,
      jobNumber: `${SEED_YEAR}-001`,
      title: "Lakeside Offices — Tenant Buildout",
      description: "Interior buildout for suite 300",
      address: "40 Lakeside Blvd, Suite 300",
      status: "SCHEDULED",
      customerId: secondCoCustomer.id,
      assignments: { create: [{ workerId: secondCoWorker.id }] },
    },
  });
  await prisma.costCode.create({
    data: { companyId: otherCompany.id, code: "06 10 00", description: "Rough carpentry", unit: "HR" },
  });
  await prisma.checklistTemplateItem.create({
    data: { companyId: otherCompany.id, stage: "PRECON", title: "Confirm permit set", sortOrder: 1 },
  });
  await generateChecklistForStage(prisma, secondCoJob.id, "PRECON");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
