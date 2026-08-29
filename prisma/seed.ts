import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { startOfWeek, addDays } from "../lib/schedule";
import { generateChecklistForStage } from "../lib/checklist";

const prisma = new PrismaClient();

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
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: "Frank Delgado",
      email: "foreman@crewsync.dev",
      passwordHash: hashPassword("foreman1234"),
      role: "FOREMAN",
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
    data: { companyId: company.id, name: "Frank Delgado", role: "Concrete Foreman", phone: "555-0301", laborRate: 62 },
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
  await prisma.costCode.create({
    data: {
      companyId: company.id,
      code: "26 05 00",
      description: "Electrical rough-in",
      unit: "HR",
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
      title: "Harbor View — Foundation Pour",
      description: "Slab on grade for the parking structure foundation",
      address: "8800 Harbor View Dr",
      status: "COMPLETED",
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
  await prisma.invoice.create({
    data: {
      jobId: harborFoundation.id,
      invoiceNumber: "INV-1001",
      amount: 310000,
      date: new Date("2026-07-16"),
      status: "PAID",
    },
  });

  // An in-progress job where the same crew is running well over the estimate —
  // exactly the gap this feature is meant to surface days into Phase 2, not
  // weeks later after Phase 3 has already been poured.
  const riverside2 = await prisma.job.create({
    data: {
      companyId: company.id,
      divisionId: fieldOps.id,
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

  await prisma.materialRequest.createMany({
    data: [
      {
        jobId: riverside2.id,
        description: "Ready-mix concrete, 4000 PSI",
        quantity: 140,
        unit: "CY",
        status: "RECEIVED",
        vendor: "Summit Concrete Supply",
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
        vendor: "Metro Rebar & Supply",
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

  await prisma.subcontractorCost.create({
    data: {
      jobId: riverside2.id,
      vendor: "Ace Rebar Placing",
      description: "Rebar placement, Phase 2 slab",
      committedAmount: 45000,
      actualAmount: 22000,
      status: "INVOICED",
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
  await prisma.changeOrder.create({
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

  await prisma.invoice.createMany({
    data: [
      { jobId: riverside2.id, invoiceNumber: "INV-2001", amount: 150000, date: new Date("2026-08-15"), status: "PAID" },
      { jobId: riverside2.id, invoiceNumber: "INV-2002", amount: 60000, date: new Date("2026-08-25"), status: "SENT" },
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
