-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('LUMP_SUM', 'COST_PLUS', 'TIME_AND_MATERIALS', 'GMP');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "ContractType" NOT NULL DEFAULT 'LUMP_SUM',
    "retainagePct" DOUBLE PRECISION,
    "executedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledValue" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceChangeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "contractLineId" TEXT NOT NULL,
    "pctCompleteThisPeriod" DOUBLE PRECISION NOT NULL,
    "pctCompleteToDate" DOUBLE PRECISION NOT NULL,
    "amountThisPeriod" DOUBLE PRECISION NOT NULL,
    "retainageWithheld" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_jobId_key" ON "Contract"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLine_sourceChangeOrderId_key" ON "ContractLine"("sourceChangeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_contractLineId_key" ON "InvoiceLine"("invoiceId", "contractLineId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_sourceChangeOrderId_fkey" FOREIGN KEY ("sourceChangeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_contractLineId_fkey" FOREIGN KEY ("contractLineId") REFERENCES "ContractLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

