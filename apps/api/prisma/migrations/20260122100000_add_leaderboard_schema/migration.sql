-- CreateEnum
CREATE TYPE "LeaderboardTimeframe" AS ENUM ('GLOBAL', 'WEEKLY', 'MONTHLY', 'SEASONAL');

-- CreateEnum
CREATE TYPE "LeaderboardStatus" AS ENUM ('active', 'frozen', 'archived', 'scheduled');

-- CreateTable
CREATE TABLE "leaderboards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "timeframe" "LeaderboardTimeframe" NOT NULL,
    "sport" "SportType",
    "status" "LeaderboardStatus" NOT NULL DEFAULT 'active',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "last_calculated_at" TIMESTAMP(3),
    "entry_count" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "id" TEXT NOT NULL,
    "leaderboard_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "previous_rank" INTEGER,
    "score" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "total_rival_coins_won" BIGINT NOT NULL DEFAULT 0,
    "avg_points_per_match" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "first_entry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_match_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leaderboards_slug_key" ON "leaderboards"("slug");

-- CreateIndex
CREATE INDEX "leaderboards_status_idx" ON "leaderboards"("status");

-- CreateIndex
CREATE INDEX "leaderboards_timeframe_status_idx" ON "leaderboards"("timeframe", "status");

-- CreateIndex
CREATE INDEX "leaderboards_sport_status_idx" ON "leaderboards"("sport", "status");

-- CreateIndex
CREATE INDEX "leaderboards_timeframe_sport_status_idx" ON "leaderboards"("timeframe", "sport", "status");

-- CreateIndex
CREATE INDEX "leaderboards_status_display_order_idx" ON "leaderboards"("status", "display_order");

-- CreateIndex
CREATE INDEX "leaderboards_period_end_status_idx" ON "leaderboards"("period_end", "status");

-- CreateIndex
CREATE INDEX "leaderboards_is_featured_status_idx" ON "leaderboards"("is_featured", "status");

-- CreateIndex
CREATE INDEX "leaderboard_entries_leaderboard_id_rank_idx" ON "leaderboard_entries"("leaderboard_id", "rank");

-- CreateIndex
CREATE INDEX "leaderboard_entries_leaderboard_id_score_idx" ON "leaderboard_entries"("leaderboard_id", "score" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_user_id_idx" ON "leaderboard_entries"("user_id");

-- CreateIndex
CREATE INDEX "leaderboard_entries_user_id_leaderboard_id_idx" ON "leaderboard_entries"("user_id", "leaderboard_id");

-- CreateIndex
CREATE INDEX "leaderboard_entries_leaderboard_id_wins_idx" ON "leaderboard_entries"("leaderboard_id", "wins" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_leaderboard_id_current_streak_idx" ON "leaderboard_entries"("leaderboard_id", "current_streak" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_leaderboard_id_win_rate_idx" ON "leaderboard_entries"("leaderboard_id", "win_rate" DESC);

-- CreateIndex
CREATE INDEX "leaderboard_entries_last_match_at_idx" ON "leaderboard_entries"("last_match_at");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_entries_leaderboard_id_user_id_key" ON "leaderboard_entries"("leaderboard_id", "user_id");

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_leaderboard_id_fkey" FOREIGN KEY ("leaderboard_id") REFERENCES "leaderboards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
