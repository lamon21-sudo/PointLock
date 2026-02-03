/*
  Warnings:

  - The `status` column on the `sports_events` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELED', 'POSTPONED');

-- AlterTable
ALTER TABLE "sports_events" DROP COLUMN "status",
ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED';

-- CreateIndex
CREATE INDEX "sports_events_status_idx" ON "sports_events"("status");

-- CreateIndex
CREATE INDEX "idx_upcoming_events" ON "sports_events"("scheduled_at", "status");
