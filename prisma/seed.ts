import { prisma } from "../lib/prisma";
import { seedDemoCompany, seedSecondCompany } from "../lib/demo-seed";

async function main() {
  await seedDemoCompany();
  await seedSecondCompany();
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
