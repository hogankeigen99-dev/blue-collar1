-- AlterTable
ALTER TABLE "MaterialRequest" ADD COLUMN     "sourceDailyReportId" TEXT;

-- AlterTable
ALTER TABLE "ProductionEntry" ADD COLUMN     "dailyReportId" TEXT;

-- CreateIndex
CREATE INDEX "ProductionEntry_dailyReportId_idx" ON "ProductionEntry"("dailyReportId");

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_sourceDailyReportId_fkey" FOREIGN KEY ("sourceDailyReportId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

