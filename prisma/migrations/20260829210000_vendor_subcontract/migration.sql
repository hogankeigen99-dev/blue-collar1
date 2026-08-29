-- Vendor master record
CREATE TABLE "Vendor" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "trade"       TEXT,
    "contactInfo" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill a Vendor row for every distinct vendor name already recorded as
-- free text on MaterialRequest/SubcontractorCost, one per company (a name
-- reused across companies must not become one shared Vendor row).
INSERT INTO "Vendor" ("id", "companyId", "name", "createdAt")
SELECT gen_random_uuid()::text, x."companyId", x."vendorName", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT j."companyId" AS "companyId", mr."vendor" AS "vendorName"
  FROM "MaterialRequest" mr
  JOIN "Job" j ON mr."jobId" = j."id"
  WHERE mr."vendor" IS NOT NULL AND btrim(mr."vendor") <> ''
  UNION
  SELECT DISTINCT j."companyId" AS "companyId", sc."vendor" AS "vendorName"
  FROM "SubcontractorCost" sc
  JOIN "Job" j ON sc."jobId" = j."id"
  WHERE sc."vendor" IS NOT NULL AND btrim(sc."vendor") <> ''
) x;

-- MaterialRequest: add vendorId, backfill by matching the old free-text
-- name against the Vendor row just created for the same company, then drop
-- the free-text column now that every reference has a real FK.
ALTER TABLE "MaterialRequest" ADD COLUMN "vendorId" TEXT;

UPDATE "MaterialRequest" mr
SET "vendorId" = v."id"
FROM "Vendor" v, "Job" j
WHERE mr."jobId" = j."id" AND v."companyId" = j."companyId" AND v."name" = mr."vendor";

ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MaterialRequest" DROP COLUMN "vendor";

-- SubcontractorCost -> Subcontract: promoted into a real agreement. Rename
-- the table and its constraints in place (preserving every existing row
-- and its id) rather than drop-and-recreate.
ALTER TABLE "SubcontractorCost" RENAME TO "Subcontract";
ALTER TABLE "Subcontract" RENAME CONSTRAINT "SubcontractorCost_pkey" TO "Subcontract_pkey";
ALTER TABLE "Subcontract" RENAME CONSTRAINT "SubcontractorCost_jobId_fkey" TO "Subcontract_jobId_fkey";

ALTER TABLE "Subcontract" ADD COLUMN "vendorId" TEXT;

UPDATE "Subcontract" sc
SET "vendorId" = v."id"
FROM "Vendor" v, "Job" j
WHERE sc."jobId" = j."id" AND v."companyId" = j."companyId" AND v."name" = sc."vendor";

ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Subcontract" DROP COLUMN "vendor";

-- CreateEnum
CREATE TYPE "SubcontractAgreementStatus" AS ENUM ('DRAFT', 'EXECUTED', 'CLOSED');

ALTER TABLE "Subcontract" ADD COLUMN "agreementStatus" "SubcontractAgreementStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Subcontract" ADD COLUMN "retainagePct" DOUBLE PRECISION;
ALTER TABLE "Subcontract" ADD COLUMN "coiExpirationDate" TIMESTAMP(3);
ALTER TABLE "Subcontract" ADD COLUMN "executedDate" TIMESTAMP(3);

-- Every pre-existing Subcontract row already represents a committed,
-- already-in-effect agreement (they were created via a UI framed as
-- "add subcontractor cost" once work was already underway) — backfill them
-- as EXECUTED rather than leaving them at the schema default of DRAFT,
-- which is only correct for a brand-new row a PM hasn't signed off yet.
UPDATE "Subcontract" SET "agreementStatus" = 'EXECUTED', "executedDate" = "createdAt";
