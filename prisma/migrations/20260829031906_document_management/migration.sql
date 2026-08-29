-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('DRAWING', 'CONTRACT', 'RFI', 'SUBMITTAL', 'PHOTO', 'SAFETY', 'CLOSEOUT', 'WARRANTY', 'OTHER');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_jobId_category_idx" ON "Document"("jobId", "category");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
