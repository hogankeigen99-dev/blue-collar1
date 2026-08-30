-- DropForeignKey
ALTER TABLE "CostCodeBenchmark" DROP CONSTRAINT "CostCodeBenchmark_costCodeId_fkey";

-- DropForeignKey
ALTER TABLE "JobCostCode" DROP CONSTRAINT "JobCostCode_costCodeId_fkey";

-- DropForeignKey
ALTER TABLE "OpportunityCostCode" DROP CONSTRAINT "OpportunityCostCode_costCodeId_fkey";

-- AddForeignKey
ALTER TABLE "OpportunityCostCode" ADD CONSTRAINT "OpportunityCostCode_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCostCode" ADD CONSTRAINT "JobCostCode_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCodeBenchmark" ADD CONSTRAINT "CostCodeBenchmark_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

