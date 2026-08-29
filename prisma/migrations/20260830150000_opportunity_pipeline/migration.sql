-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('OPPORTUNITY', 'BIDDING', 'SUBMITTED', 'WON', 'LOST', 'NO_BID');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bidNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "prospectName" TEXT,
    "source" TEXT,
    "projectType" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "probability" INTEGER,
    "bidDueDate" TIMESTAMP(3),
    "stage" "OpportunityStage" NOT NULL DEFAULT 'OPPORTUNITY',
    "lostReason" TEXT,
    "assignedToUserId" TEXT,
    "wonJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityCostCode" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "estimatedQty" DOUBLE PRECISION NOT NULL,
    "estimatedHours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OpportunityCostCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_wonJobId_key" ON "Opportunity"("wonJobId");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_companyId_bidNumber_key" ON "Opportunity"("companyId", "bidNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityCostCode_opportunityId_costCodeId_key" ON "OpportunityCostCode"("opportunityId", "costCodeId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_wonJobId_fkey" FOREIGN KEY ("wonJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCostCode" ADD CONSTRAINT "OpportunityCostCode_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCostCode" ADD CONSTRAINT "OpportunityCostCode_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

