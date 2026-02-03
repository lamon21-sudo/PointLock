-- =====================================================
-- Migration: add_pvp_matches_enhancements
-- Task 6.1: Database Schema for PvP Match System
-- =====================================================
-- This migration enhances the Match model with:
-- - Extended MatchStatus enum (10 states)
-- - Financial security fields (optimistic locking, transaction linkage)
-- - State transition timestamps
-- - Settlement audit fields
-- - Tie/draw handling
-- - Matchmaking fields
-- - UI performance caching
-- - Progress tracking
-- - New MatchDispute model for dispute lifecycle
-- - New MatchAuditLog model for immutable audit trail
-- =====================================================

-- =====================================================
-- STEP 1: Update MatchStatus Enum
-- =====================================================

-- Add new enum values to MatchStatus
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'matched';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'draw';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'voided';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'expired';

-- =====================================================
-- STEP 2: Add P0 Critical Fields to matches table
-- =====================================================

-- Optimistic locking to prevent race conditions
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Timestamp when rake % was locked (immutable after this)
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "rake_locked_at" TIMESTAMP(3);

-- Transaction linkage for audit trail
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "creator_entry_tx_id" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_entry_tx_id" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "settlement_tx_id" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "rake_tx_id" TEXT;

-- State transition timestamps
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "matched_at" TIMESTAMP(3);
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3);
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

-- Slip submission tracking
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "creator_slip_submitted_at" TIMESTAMP(3);
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_slip_submitted_at" TIMESTAMP(3);
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "slip_deadline_at" TIMESTAMP(3);

-- Settlement audit
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "settled_by" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "settlement_method" TEXT;

-- Tie/draw handling
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "is_draw" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "tiebreak_method" TEXT;

-- =====================================================
-- STEP 3: Add P1 Important Fields to matches table
-- =====================================================

-- Matchmaking fields for skill-based matching
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "min_skill_rating" INTEGER;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "max_skill_rating" INTEGER;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "matchmaking_region" TEXT;

-- Cached fields for fast list display (denormalized)
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "creator_username" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "creator_avatar_url" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_username" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_avatar_url" TEXT;

-- Progress tracking
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "events_total" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "events_completed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "last_event_completed_at" TIMESTAMP(3);

-- Cancellation tracking
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

-- =====================================================
-- STEP 4: Create MatchDispute table
-- =====================================================

CREATE TABLE IF NOT EXISTS "match_disputes" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "filed_by" TEXT NOT NULL,
    "filed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispute_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "resolution_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_disputes_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- STEP 5: Create MatchAuditLog table
-- =====================================================

CREATE TABLE IF NOT EXISTS "match_audit_logs" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "previous_state" JSONB NOT NULL,
    "new_state" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_audit_logs_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- STEP 6: Add Foreign Keys
-- =====================================================

-- MatchDispute foreign keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_disputes_match_id_fkey') THEN
        ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_match_id_fkey"
            FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_disputes_filed_by_fkey') THEN
        ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_filed_by_fkey"
            FOREIGN KEY ("filed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_disputes_resolved_by_fkey') THEN
        ALTER TABLE "match_disputes" ADD CONSTRAINT "match_disputes_resolved_by_fkey"
            FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END$$;

-- MatchAuditLog foreign keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_audit_logs_match_id_fkey') THEN
        ALTER TABLE "match_audit_logs" ADD CONSTRAINT "match_audit_logs_match_id_fkey"
            FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END$$;

-- =====================================================
-- STEP 7: Create Indexes for matches table
-- =====================================================

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "matches_creator_id_status_created_at_idx" ON "matches"("creator_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "matches_opponent_id_status_created_at_idx" ON "matches"("opponent_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "matches_type_status_stake_amount_idx" ON "matches"("type", "status", "stake_amount");
CREATE INDEX IF NOT EXISTS "matches_status_min_skill_rating_max_skill_rating_idx" ON "matches"("status", "min_skill_rating", "max_skill_rating");
CREATE INDEX IF NOT EXISTS "matches_status_last_event_completed_at_idx" ON "matches"("status", "last_event_completed_at");
CREATE INDEX IF NOT EXISTS "matches_settled_at_winner_id_idx" ON "matches"("settled_at", "winner_id");
CREATE INDEX IF NOT EXISTS "matches_status_invite_expires_at_idx" ON "matches"("status", "invite_expires_at");
CREATE INDEX IF NOT EXISTS "matches_status_is_draw_idx" ON "matches"("status", "is_draw");

-- =====================================================
-- STEP 8: Create Indexes for match_disputes table
-- =====================================================

CREATE INDEX IF NOT EXISTS "match_disputes_match_id_idx" ON "match_disputes"("match_id");
CREATE INDEX IF NOT EXISTS "match_disputes_status_idx" ON "match_disputes"("status");
CREATE INDEX IF NOT EXISTS "match_disputes_filed_at_idx" ON "match_disputes"("filed_at");
CREATE INDEX IF NOT EXISTS "match_disputes_priority_idx" ON "match_disputes"("priority");
CREATE INDEX IF NOT EXISTS "match_disputes_filed_by_idx" ON "match_disputes"("filed_by");

-- =====================================================
-- STEP 9: Create Indexes for match_audit_logs table
-- =====================================================

CREATE INDEX IF NOT EXISTS "match_audit_logs_match_id_idx" ON "match_audit_logs"("match_id");
CREATE INDEX IF NOT EXISTS "match_audit_logs_action_idx" ON "match_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "match_audit_logs_created_at_idx" ON "match_audit_logs"("created_at");
CREATE INDEX IF NOT EXISTS "match_audit_logs_performed_by_idx" ON "match_audit_logs"("performed_by");
