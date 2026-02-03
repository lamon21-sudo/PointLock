-- Migration: 20260122000000_add_settlement_edge_cases
-- Task 8.5: Settlement Edge Cases
--
-- This migration adds:
-- 1. AdminRole enum for RBAC on settlement operations
-- 2. Admin tracking fields on users table
-- 3. Manual settlement tracking on matches table
-- 4. Postponed event handling on matches table
-- 5. Postponement tracking on sports_events table

-- =====================================================
-- 1. Create AdminRole enum
-- =====================================================

CREATE TYPE "AdminRole" AS ENUM (
  'SUPER_ADMIN',      -- Full system access, can grant admin roles
  'SETTLEMENT_ADMIN', -- Can settle/void matches manually
  'SUPPORT_ADMIN',    -- Read-only dispute access, can view audit logs
  'VIEWER'            -- Read-only system access
);

-- =====================================================
-- 2. Add admin fields to users table
-- =====================================================

ALTER TABLE "users"
  ADD COLUMN "admin_role" "AdminRole",
  ADD COLUMN "admin_granted_at" TIMESTAMP(3),
  ADD COLUMN "admin_granted_by" TEXT;

-- Index for admin role lookups
CREATE INDEX "users_admin_role_idx" ON "users"("admin_role");

-- =====================================================
-- 3. Add manual settlement fields to matches table
-- =====================================================

ALTER TABLE "matches"
  ADD COLUMN "is_manually_settled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "manual_settle_reason" TEXT,
  ADD COLUMN "manual_settled_by" TEXT,
  ADD COLUMN "manual_settled_at" TIMESTAMP(3),
  ADD COLUMN "has_postponed_events" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "postponed_check_at" TIMESTAMP(3);

-- Index for postponed match monitoring (worker checks this periodically)
CREATE INDEX "matches_has_postponed_events_postponed_check_at_idx"
  ON "matches"("has_postponed_events", "postponed_check_at");

-- Index for manual settlement audit queries
CREATE INDEX "matches_is_manually_settled_manual_settled_at_idx"
  ON "matches"("is_manually_settled", "manual_settled_at");

-- =====================================================
-- 4. Add postponement tracking to sports_events table
-- =====================================================

ALTER TABLE "sports_events"
  ADD COLUMN "original_event_id" TEXT,
  ADD COLUMN "rescheduled_to" TIMESTAMP(3),
  ADD COLUMN "postponed_at" TIMESTAMP(3),
  ADD COLUMN "postponed_reason" TEXT;

-- Index for finding rescheduled events
CREATE INDEX "sports_events_original_event_id_idx"
  ON "sports_events"("original_event_id");

-- Index for finding postponed events by age (for timeout processing)
CREATE INDEX "sports_events_status_postponed_at_idx"
  ON "sports_events"("status", "postponed_at");
