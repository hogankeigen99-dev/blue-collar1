/*
  Warnings:

  - You are about to drop the column `billedAmount` on the `Job` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID');

-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "glCode" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "billedAmount";

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingCategoryMapping" (
    "id" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "glCode" TEXT NOT NULL,
    "glAccountName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_jobId_invoiceNumber_key" ON "Invoice"("jobId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingCategoryMapping_category_key" ON "AccountingCategoryMapping"("category");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
