-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'banned', 'pending_verification');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('purchase', 'bonus', 'match_entry', 'match_win', 'match_refund', 'rake_fee', 'utility_purchase', 'adjustment');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('pending', 'active', 'settled', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('pending', 'active', 'won', 'lost', 'push', 'cancelled');

-- CreateEnum
CREATE TYPE "PickStatus" AS ENUM ('pending', 'won', 'lost', 'push', 'cancelled');

-- CreateEnum
CREATE TYPE "PickType" AS ENUM ('moneyline', 'spread', 'total', 'prop');

-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'NCAAF', 'NCAAB');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "email_verified_at" TIMESTAMP(3),
    "username" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "bio" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'pending_verification',
    "kyc_verified" BOOLEAN NOT NULL DEFAULT false,
    "kyc_verified_at" TIMESTAMP(3),
    "country_code" CHAR(2),
    "state_code" VARCHAR(10),
    "timezone" TEXT,
    "skill_rating" INTEGER NOT NULL DEFAULT 1000,
    "matches_played" INTEGER NOT NULL DEFAULT 0,
    "matches_won" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "referral_code" TEXT,
    "referred_by_id" TEXT,
    "fcm_token" TEXT,
    "apns_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "paid_balance" BIGINT NOT NULL DEFAULT 0,
    "bonus_balance" BIGINT NOT NULL DEFAULT 0,
    "total_deposited" BIGINT NOT NULL DEFAULT 0,
    "total_won" BIGINT NOT NULL DEFAULT 0,
    "total_lost" BIGINT NOT NULL DEFAULT 0,
    "total_rake_paid" BIGINT NOT NULL DEFAULT 0,
    "last_allowance_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "amount" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "bonus_amount" BIGINT NOT NULL DEFAULT 0,
    "balance_before" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "match_id" TEXT,
    "iap_receipt_id" TEXT,
    "external_ref" TEXT,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports_events" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "sport" "SportType" NOT NULL,
    "league" TEXT NOT NULL,
    "home_team_id" TEXT NOT NULL,
    "home_team_name" TEXT NOT NULL,
    "home_team_abbr" TEXT,
    "home_team_logo" TEXT,
    "away_team_id" TEXT NOT NULL,
    "away_team_name" TEXT NOT NULL,
    "away_team_abbr" TEXT,
    "away_team_logo" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "odds_data" JSONB NOT NULL DEFAULT '{}',
    "odds_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sports_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "type" "MatchType" NOT NULL,
    "stake_amount" BIGINT NOT NULL,
    "rake_percentage" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "creator_id" TEXT NOT NULL,
    "opponent_id" TEXT,
    "winner_id" TEXT,
    "creator_slip_id" TEXT,
    "opponent_slip_id" TEXT,
    "creator_points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "opponent_points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "MatchStatus" NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMP(3),
    "settlement_reason" TEXT,
    "total_pot" BIGINT,
    "rake_amount" BIGINT,
    "winner_payout" BIGINT,
    "invite_code" TEXT,
    "invite_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slips" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "match_id" TEXT,
    "name" TEXT,
    "status" "SlipStatus" NOT NULL DEFAULT 'pending',
    "total_picks" INTEGER NOT NULL DEFAULT 0,
    "correct_picks" INTEGER NOT NULL DEFAULT 0,
    "point_potential" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "points_earned" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "locked_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_picks" (
    "id" TEXT NOT NULL,
    "slip_id" TEXT NOT NULL,
    "sports_event_id" TEXT NOT NULL,
    "pick_type" "PickType" NOT NULL,
    "selection" TEXT NOT NULL,
    "line" DECIMAL(10,2),
    "odds" INTEGER NOT NULL,
    "prop_type" TEXT,
    "prop_player_id" TEXT,
    "prop_player_name" TEXT,
    "point_value" DECIMAL(10,2) NOT NULL,
    "status" "PickStatus" NOT NULL DEFAULT 'pending',
    "result_value" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "slip_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_referral_code_idx" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_skill_rating_idx" ON "users"("skill_rating");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- CreateIndex
CREATE INDEX "transactions_match_id_idx" ON "transactions"("match_id");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sports_events_external_id_key" ON "sports_events"("external_id");

-- CreateIndex
CREATE INDEX "sports_events_external_id_idx" ON "sports_events"("external_id");

-- CreateIndex
CREATE INDEX "sports_events_sport_idx" ON "sports_events"("sport");

-- CreateIndex
CREATE INDEX "sports_events_scheduled_at_idx" ON "sports_events"("scheduled_at");

-- CreateIndex
CREATE INDEX "sports_events_status_idx" ON "sports_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "matches_creator_slip_id_key" ON "matches"("creator_slip_id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_opponent_slip_id_key" ON "matches"("opponent_slip_id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_invite_code_key" ON "matches"("invite_code");

-- CreateIndex
CREATE INDEX "matches_creator_id_idx" ON "matches"("creator_id");

-- CreateIndex
CREATE INDEX "matches_opponent_id_idx" ON "matches"("opponent_id");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "matches_invite_code_idx" ON "matches"("invite_code");

-- CreateIndex
CREATE INDEX "slips_user_id_idx" ON "slips"("user_id");

-- CreateIndex
CREATE INDEX "slips_status_idx" ON "slips"("status");

-- CreateIndex
CREATE INDEX "slip_picks_slip_id_idx" ON "slip_picks"("slip_id");

-- CreateIndex
CREATE INDEX "slip_picks_sports_event_id_idx" ON "slip_picks"("sports_event_id");

-- CreateIndex
CREATE INDEX "slip_picks_status_idx" ON "slip_picks"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_creator_slip_id_fkey" FOREIGN KEY ("creator_slip_id") REFERENCES "slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_slip_id_fkey" FOREIGN KEY ("opponent_slip_id") REFERENCES "slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slips" ADD CONSTRAINT "slips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_picks" ADD CONSTRAINT "slip_picks_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_picks" ADD CONSTRAINT "slip_picks_sports_event_id_fkey" FOREIGN KEY ("sports_event_id") REFERENCES "sports_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
