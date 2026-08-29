-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PRECON', 'MOBILIZATION', 'ACTIVE', 'PUNCH_LIST', 'CLOSEOUT', 'COMPLETE');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('IDENTIFIED', 'PRICED', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PO_ISSUED', 'ORDERED', 'RECEIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EquipmentOwnership" AS ENUM ('OWNED', 'RENTED');

-- CreateEnum
CREATE TYPE "SubcontractorCostStatus" AS ENUM ('COMMITTED', 'INVOICED', 'PAID');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "billedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "contractValue" DOUBLE PRECISION,
ADD COLUMN     "foremanWorkerId" TEXT,
ADD COLUMN     "pmUserId" TEXT,
ADD COLUMN     "punchListComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredDocsComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stage" "ProjectStage" NOT NULL DEFAULT 'PRECON',
ADD COLUMN     "targetEndDate" TIMESTAMP(3),
ADD COLUMN     "targetStartDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "laborRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "WorkerUnavailability" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBudget" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "estimatedAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "revenueAmount" DOUBLE PRECISION,
    "costAmount" DOUBLE PRECISION,
    "sourceDailyReportId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "crewSize" INTEGER,
    "hours" DOUBLE PRECISION,
    "workCompleted" TEXT,
    "materialNeeded" TEXT,
    "equipmentIssue" TEXT,
    "safetyIssue" TEXT,
    "hasChangeCondition" BOOLEAN NOT NULL DEFAULT false,
    "changeConditionNotes" TEXT,
    "delayReason" TEXT,
    "tomorrowPlan" TEXT,
    "submittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportPhoto" (
    "id" TEXT NOT NULL,
    "dailyReportId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "vendor" TEXT,
    "poNumber" TEXT,
    "unitCost" DOUBLE PRECISION,
    "totalCost" DOUBLE PRECISION,
    "expectedDeliveryDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "ownership" "EquipmentOwnership" NOT NULL DEFAULT 'OWNED',
    "dailyRentalCost" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "actualPickupDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "downtimeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubcontractorCost" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "description" TEXT,
    "committedAmount" DOUBLE PRECISION NOT NULL,
    "actualAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SubcontractorCostStatus" NOT NULL DEFAULT 'COMMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubcontractorCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerUnavailability_workerId_date_key" ON "WorkerUnavailability"("workerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "JobBudget_jobId_category_key" ON "JobBudget"("jobId", "category");

-- CreateIndex
CREATE INDEX "DailyReport_jobId_date_idx" ON "DailyReport"("jobId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_jobId_date_key" ON "DailyReport"("jobId", "date");

-- CreateIndex
CREATE INDEX "DailyReportPhoto_dailyReportId_idx" ON "DailyReportPhoto"("dailyReportId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_equipmentId_startDate_endDate_idx" ON "EquipmentAssignment"("equipmentId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_jobId_idx" ON "EquipmentAssignment"("jobId");

-- AddForeignKey
ALTER TABLE "WorkerUnavailability" ADD CONSTRAINT "WorkerUnavailability_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_pmUserId_fkey" FOREIGN KEY ("pmUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_foremanWorkerId_fkey" FOREIGN KEY ("foremanWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBudget" ADD CONSTRAINT "JobBudget_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_sourceDailyReportId_fkey" FOREIGN KEY ("sourceDailyReportId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportPhoto" ADD CONSTRAINT "DailyReportPhoto_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubcontractorCost" ADD CONSTRAINT "SubcontractorCost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
