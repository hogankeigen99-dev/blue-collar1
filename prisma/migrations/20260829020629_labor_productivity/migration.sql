-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('CY', 'SF', 'LF', 'SQ', 'TON', 'EA', 'HR', 'LS');

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCostCode" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "estimatedQty" DOUBLE PRECISION NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" TEXT NOT NULL,
    "jobCostCodeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "crewSize" INTEGER,
    "hours" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "enteredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JobCostCode_jobId_costCodeId_key" ON "JobCostCode"("jobId", "costCodeId");

-- CreateIndex
CREATE INDEX "ProductionEntry_jobCostCodeId_idx" ON "ProductionEntry"("jobCostCodeId");

-- AddForeignKey
ALTER TABLE "JobCostCode" ADD CONSTRAINT "JobCostCode_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCostCode" ADD CONSTRAINT "JobCostCode_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_jobCostCodeId_fkey" FOREIGN KEY ("jobCostCodeId") REFERENCES "JobCostCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
