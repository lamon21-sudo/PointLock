-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- AlterTable
ALTER TABLE "season_entries"
ADD COLUMN "is_placed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "placed_at" TIMESTAMP(3),
ADD COLUMN "initial_rank" "Rank";

-- CreateTable
CREATE TABLE "placement_matches" (
    "id" TEXT NOT NULL,
    "season_entry_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "match_number" INTEGER NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rp_before" INTEGER NOT NULL,
    "rp_after" INTEGER NOT NULL,
    "rank_assigned" "Rank",

    CONSTRAINT "placement_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "placement_matches_match_id_idx" ON "placement_matches"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "placement_matches_season_entry_id_match_id_key" ON "placement_matches"("season_entry_id", "match_id");

-- AddForeignKey
ALTER TABLE "placement_matches" ADD CONSTRAINT "placement_matches_season_entry_id_fkey" FOREIGN KEY ("season_entry_id") REFERENCES "season_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
