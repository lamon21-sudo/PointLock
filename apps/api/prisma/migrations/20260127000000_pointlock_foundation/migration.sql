-- Task 0.3: Database Schema Updates for PointLock System
-- This migration adds tier/rank/game mode system, friendship features,
-- matchmaking queues, and seasonal ranked competitions.

-- CreateEnum
CREATE TYPE "PickTier" AS ENUM ('FREE', 'STANDARD', 'PREMIUM', 'ELITE');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('INVITE_FRIEND', 'PLAY_FRIEND', 'QUICK_MATCH', 'RANDOM_MATCH');

-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('BRONZE_1', 'BRONZE_2', 'BRONZE_3', 'SILVER_1', 'SILVER_2', 'SILVER_3', 'GOLD_1', 'GOLD_2', 'GOLD_3', 'PLATINUM_1', 'PLATINUM_2', 'PLATINUM_3', 'DIAMOND_1', 'DIAMOND_2', 'DIAMOND_3');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'MATCHED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'SEASON_REWARD';
ALTER TYPE "TransactionType" ADD VALUE 'COIN_DEDUCTION';

-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "game_mode" "GameMode",
ADD COLUMN     "season_id" TEXT,
ADD COLUMN     "tiebreak_round" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "slip_picks" ADD COLUMN     "coin_cost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "market_modifier" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
ADD COLUMN     "tier" "PickTier" NOT NULL DEFAULT 'FREE';

-- AlterTable
ALTER TABLE "slips" ADD COLUMN     "coin_spend_met" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "min_coin_spend" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_coin_cost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "current_tier" "PickTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "highest_tier_unlocked" "PickTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "last_active_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "total_coins_earned" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "friend_id" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "blocked_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchmaking_queue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "game_mode" "GameMode" NOT NULL,
    "tier" "PickTier" NOT NULL,
    "rank" "Rank",
    "stake_amount" BIGINT NOT NULL,
    "skill_rating" INTEGER NOT NULL,
    "region" TEXT,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "enqueued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "match_id" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "rejection_count" INTEGER NOT NULL DEFAULT 0,
    "last_rejected_at" TIMESTAMP(3),
    "cooldown_until" TIMESTAMP(3),

    CONSTRAINT "matchmaking_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "rank_points" INTEGER NOT NULL DEFAULT 0,
    "current_rank" "Rank",
    "highest_rank" "Rank",
    "placement_matches_played" INTEGER NOT NULL DEFAULT 0,
    "placement_matches_won" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "final_rank" "Rank",
    "final_rank_points" INTEGER,
    "rank_position" INTEGER,
    "last_match_at" TIMESTAMP(3),
    "last_decay_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_rewards" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "min_rank" "Rank" NOT NULL,
    "max_rank" "Rank" NOT NULL,
    "coin_reward" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_reward_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_reward_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_tier_assignments" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "player_name" TEXT NOT NULL,
    "sport" "SportType" NOT NULL,
    "tier" "PickTier" NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_tier_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friendships_user_id_status_idx" ON "friendships"("user_id", "status");

-- CreateIndex
CREATE INDEX "friendships_friend_id_status_idx" ON "friendships"("friend_id", "status");

-- CreateIndex
CREATE INDEX "friendships_status_created_at_idx" ON "friendships"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_user_id_friend_id_key" ON "friendships"("user_id", "friend_id");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_game_mode_tier_stake_amount_idx" ON "matchmaking_queue"("status", "game_mode", "tier", "stake_amount");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_game_mode_skill_rating_idx" ON "matchmaking_queue"("status", "game_mode", "skill_rating");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_game_mode_rank_idx" ON "matchmaking_queue"("status", "game_mode", "rank");

-- CreateIndex
CREATE INDEX "matchmaking_queue_user_id_status_idx" ON "matchmaking_queue"("user_id", "status");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_expires_at_idx" ON "matchmaking_queue"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "matchmaking_queue_user_id_game_mode_status_key" ON "matchmaking_queue"("user_id", "game_mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_slug_key" ON "seasons"("slug");

-- CreateIndex
CREATE INDEX "seasons_status_start_date_idx" ON "seasons"("status", "start_date");

-- CreateIndex
CREATE INDEX "seasons_status_is_current_idx" ON "seasons"("status", "is_current");

-- CreateIndex
CREATE INDEX "seasons_end_date_status_idx" ON "seasons"("end_date", "status");

-- CreateIndex
CREATE INDEX "season_entries_season_id_rank_points_idx" ON "season_entries"("season_id", "rank_points" DESC);

-- CreateIndex
CREATE INDEX "season_entries_user_id_season_id_idx" ON "season_entries"("user_id", "season_id");

-- CreateIndex
CREATE INDEX "season_entries_season_id_wins_idx" ON "season_entries"("season_id", "wins" DESC);

-- CreateIndex
CREATE INDEX "season_entries_season_id_placement_matches_played_idx" ON "season_entries"("season_id", "placement_matches_played");

-- CreateIndex
CREATE UNIQUE INDEX "season_entries_user_id_season_id_key" ON "season_entries"("user_id", "season_id");

-- CreateIndex
CREATE INDEX "season_rewards_season_id_min_rank_max_rank_idx" ON "season_rewards"("season_id", "min_rank", "max_rank");

-- CreateIndex
CREATE UNIQUE INDEX "season_rewards_season_id_min_rank_max_rank_key" ON "season_rewards"("season_id", "min_rank", "max_rank");

-- CreateIndex
CREATE UNIQUE INDEX "season_reward_claims_transaction_id_key" ON "season_reward_claims"("transaction_id");

-- CreateIndex
CREATE INDEX "season_reward_claims_user_id_season_id_idx" ON "season_reward_claims"("user_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "season_reward_claims_user_id_season_id_reward_id_key" ON "season_reward_claims"("user_id", "season_id", "reward_id");

-- CreateIndex
CREATE INDEX "player_tier_assignments_sport_tier_idx" ON "player_tier_assignments"("sport", "tier");

-- CreateIndex
CREATE INDEX "player_tier_assignments_tier_updated_at_idx" ON "player_tier_assignments"("tier", "updated_at");

-- CreateIndex
CREATE INDEX "player_tier_assignments_player_id_idx" ON "player_tier_assignments"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_tier_assignments_player_id_sport_key" ON "player_tier_assignments"("player_id", "sport");

-- CreateIndex
CREATE INDEX "matches_game_mode_status_created_at_idx" ON "matches"("game_mode", "status", "created_at");

-- CreateIndex
CREATE INDEX "matches_season_id_idx" ON "matches"("season_id");

-- CreateIndex
CREATE INDEX "users_current_tier_idx" ON "users"("current_tier");

-- CreateIndex
CREATE INDEX "users_last_active_at_idx" ON "users"("last_active_at");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_entries" ADD CONSTRAINT "season_entries_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_rewards" ADD CONSTRAINT "season_rewards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_reward_claims" ADD CONSTRAINT "season_reward_claims_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "season_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================
-- CUSTOM SQL CONSTRAINTS (Auditor-Required)
-- =====================================================

-- Constraint 1: Prevent self-friendship
-- Users cannot send friend requests to themselves
ALTER TABLE "friendships" ADD CONSTRAINT "chk_no_self_friendship" CHECK (user_id != friend_id);

-- Constraint 2: Ensure only one active season at a time
-- This partial unique index allows multiple seasons with is_current=false,
-- but ensures only ONE season can have is_current=true
CREATE UNIQUE INDEX "seasons_is_current_unique" ON "seasons"("is_current") WHERE "is_current" = true;

-- Constraint 3: Ensure non-negative coin costs
-- Coin costs cannot be negative
ALTER TABLE "slip_picks" ADD CONSTRAINT "chk_coin_cost_non_negative" CHECK (coin_cost >= 0);
ALTER TABLE "slips" ADD CONSTRAINT "chk_total_coin_cost_non_negative" CHECK (total_coin_cost >= 0);
ALTER TABLE "slips" ADD CONSTRAINT "chk_min_coin_spend_non_negative" CHECK (min_coin_spend >= 0);

-- Constraint 4: Ensure non-negative rank points
ALTER TABLE "season_entries" ADD CONSTRAINT "chk_rank_points_non_negative" CHECK (rank_points >= 0);

-- Constraint 5: Ensure non-negative coin rewards
ALTER TABLE "season_rewards" ADD CONSTRAINT "chk_coin_reward_non_negative" CHECK (coin_reward >= 0);

-- Constraint 6: Ensure non-negative stake amounts in queue
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "chk_stake_amount_positive" CHECK (stake_amount > 0);
