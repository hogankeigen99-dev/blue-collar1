-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "projectType" TEXT;

-- CreateTable
CREATE TABLE "CostCodeBenchmark" (
    "id" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "projectType" TEXT,
    "foremanWorkerId" TEXT,
    "estimatedQty" DOUBLE PRECISION NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,
    "actualQty" DOUBLE PRECISION NOT NULL,
    "actualHours" DOUBLE PRECISION NOT NULL,
    "estimatedRate" DOUBLE PRECISION,
    "actualRate" DOUBLE PRECISION,
    "variancePct" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCodeBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostCodeBenchmark_costCodeId_idx" ON "CostCodeBenchmark"("costCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCodeBenchmark_jobId_costCodeId_key" ON "CostCodeBenchmark"("jobId", "costCodeId");

-- AddForeignKey
ALTER TABLE "CostCodeBenchmark" ADD CONSTRAINT "CostCodeBenchmark_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCodeBenchmark" ADD CONSTRAINT "CostCodeBenchmark_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCodeBenchmark" ADD CONSTRAINT "CostCodeBenchmark_foremanWorkerId_fkey" FOREIGN KEY ("foremanWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

