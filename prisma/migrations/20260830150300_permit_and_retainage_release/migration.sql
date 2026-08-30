-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "permitExpirationDate" TIMESTAMP(3),
ADD COLUMN     "permitIssuedDate" TIMESTAMP(3),
ADD COLUMN     "permitNumber" TEXT;

-- AlterTable
ALTER TABLE "Subcontract" ADD COLUMN     "retainageReleasedAt" TIMESTAMP(3);

