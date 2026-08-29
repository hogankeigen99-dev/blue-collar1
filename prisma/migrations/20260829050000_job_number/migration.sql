-- AlterTable: add nullable first so existing rows aren't destroyed
ALTER TABLE "Job" ADD COLUMN     "jobNumber" TEXT;

-- Backfill existing rows: {creation year}-{sequence within company+year, by creation order}
WITH numbered AS (
  SELECT id,
         EXTRACT(YEAR FROM "createdAt")::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY "companyId", EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt") AS seq
  FROM "Job"
)
UPDATE "Job" j
SET "jobNumber" = numbered.yr || '-' || LPAD(numbered.seq::text, 3, '0')
FROM numbered
WHERE j.id = numbered.id;

-- Now that every row has a value, enforce NOT NULL
ALTER TABLE "Job" ALTER COLUMN "jobNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_jobNumber_key" ON "Job"("companyId", "jobNumber");
