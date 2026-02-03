-- Task 4.3: Season Worker - Add fields for rank decay, season end, and reward distribution

-- Add new Season fields for worker lifecycle management
ALTER TABLE "seasons" ADD COLUMN "locked_at" TIMESTAMP(3);
ALTER TABLE "seasons" ADD COLUMN "rankings_finalized_at" TIMESTAMP(3);
ALTER TABLE "seasons" ADD COLUMN "rewards_distributed_at" TIMESTAMP(3);
ALTER TABLE "seasons" ADD COLUMN "last_reward_processed_user_id" TEXT;

-- Add index for efficient decay queries
-- Finds entries that: are placed, inactive for 7+ days, not yet decayed today
CREATE INDEX "idx_season_entries_decay" ON "season_entries" ("season_id", "is_placed", "last_match_at", "last_decay_at");

-- Add CHECK constraint to prevent negative rank points
-- This ensures RP can never go below 0, even with concurrent operations
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_rankPoints_non_negative" CHECK ("rank_points" >= 0);
