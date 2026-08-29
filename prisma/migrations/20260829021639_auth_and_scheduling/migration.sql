-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PM', 'FOREMAN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FOREMAN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_jobId_date_idx" ON "ScheduleAssignment"("jobId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_workerId_date_key" ON "ScheduleAssignment"("workerId", "date");

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
