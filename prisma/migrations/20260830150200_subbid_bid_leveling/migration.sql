-- CreateEnum
CREATE TYPE "BidPackageStatus" AS ENUM ('OPEN', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubBidStatus" AS ENUM ('INVITED', 'RECEIVED', 'SELECTED', 'REJECTED', 'DECLINED');

-- AlterTable
ALTER TABLE "Subcontract" ADD COLUMN     "sourceSubBidId" TEXT;

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "BidPackageStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubBid" (
    "id" TEXT NOT NULL,
    "bidPackageId" TEXT NOT NULL,
    "vendorId" TEXT,
    "amount" DOUBLE PRECISION,
    "status" "SubBidStatus" NOT NULL DEFAULT 'INVITED',
    "scopeNotes" TEXT,
    "exclusions" TEXT,
    "receivedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidPackage_jobId_idx" ON "BidPackage"("jobId");

-- CreateIndex
CREATE INDEX "SubBid_bidPackageId_idx" ON "SubBid"("bidPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontract_sourceSubBidId_key" ON "Subcontract"("sourceSubBidId");

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_sourceSubBidId_fkey" FOREIGN KEY ("sourceSubBidId") REFERENCES "SubBid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_bidPackageId_fkey" FOREIGN KEY ("bidPackageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBid" ADD CONSTRAINT "SubBid_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

