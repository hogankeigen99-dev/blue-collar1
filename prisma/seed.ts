import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const alice = await prisma.worker.create({
    data: { name: "Alice Johnson", role: "Electrician", phone: "555-0101" },
  });
  const bob = await prisma.worker.create({
    data: { name: "Bob Martinez", role: "Plumber", phone: "555-0102" },
  });

  const customer = await prisma.customer.create({
    data: {
      name: "Riverside Apartments",
      address: "123 River Rd",
      phone: "555-0200",
    },
  });

  await prisma.job.create({
    data: {
      title: "Fix breaker panel",
      description: "Replace faulty breaker in unit 4B",
      address: "123 River Rd, Unit 4B",
      status: "SCHEDULED",
      customerId: customer.id,
      assignments: { create: [{ workerId: alice.id }] },
    },
  });

  await prisma.job.create({
    data: {
      title: "Leaking pipe under sink",
      description: "Kitchen sink leak, unit 2A",
      address: "123 River Rd, Unit 2A",
      status: "IN_PROGRESS",
      customerId: customer.id,
      assignments: { create: [{ workerId: bob.id }] },
    },
  });

  // --- Self-perform labor productivity demo data ---

  const frank = await prisma.worker.create({
    data: { name: "Frank Delgado", role: "Concrete Foreman", phone: "555-0301" },
  });
  const miguel = await prisma.worker.create({
    data: { name: "Miguel Torres", role: "Laborer", phone: "555-0302" },
  });

  const concreteSlab = await prisma.costCode.create({
    data: {
      code: "03 30 00",
      description: "Concrete slab on grade",
      unit: "CY",
    },
  });
  const excavation = await prisma.costCode.create({
    data: {
      code: "31 23 00",
      description: "Excavation",
      unit: "CY",
    },
  });
  await prisma.costCode.create({
    data: {
      code: "26 05 00",
      description: "Electrical rough-in",
      unit: "HR",
    },
  });

  const harborView = await prisma.customer.create({
    data: { name: "Harbor View Development", address: "8800 Harbor View Dr" },
  });

  // A job that came in on budget — anchors the historical rate for the code.
  const harborFoundation = await prisma.job.create({
    data: {
      title: "Harbor View — Foundation Pour",
      description: "Slab on grade for the parking structure foundation",
      address: "8800 Harbor View Dr",
      status: "COMPLETED",
      customerId: harborView.id,
      assignments: { create: [{ workerId: frank.id }, { workerId: miguel.id }] },
    },
  });
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

  // An in-progress job where the same crew is running well over the estimate —
  // exactly the gap this feature is meant to surface days into Phase 2, not
  // weeks later after Phase 3 has already been poured.
  const riverside2 = await prisma.job.create({
    data: {
      title: "Riverside Apartments — Phase 2 Slab",
      description: "Slab on grade, Phase 2 of the podium deck",
      address: "123 River Rd",
      status: "IN_PROGRESS",
      customerId: customer.id,
      assignments: { create: [{ workerId: frank.id }, { workerId: miguel.id }] },
    },
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
