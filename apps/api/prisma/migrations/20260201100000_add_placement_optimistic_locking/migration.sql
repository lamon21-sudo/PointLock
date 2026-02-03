-- AlterTable: Add version column for optimistic locking
ALTER TABLE "season_entries"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
