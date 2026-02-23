-- =====================================================
-- Migration: add_onboarding_fields
-- Created: 2026-02-22
-- Purpose: Add FTUE / Onboarding tracking fields to users table.
--          Existing users are backfilled to hasCompletedOnboarding=true
--          and hasCompletedDemoSlip=true so they do not see the walkthrough.
-- =====================================================

-- Add onboarding tracking columns
ALTER TABLE "users" ADD COLUMN "has_completed_onboarding" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "has_completed_demo_slip" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark all existing users as having completed onboarding
-- CRITICAL: This prevents existing users from being shown the FTUE walkthrough
-- on their next login after this migration is deployed.
UPDATE "users"
SET
  "has_completed_onboarding" = true,
  "has_completed_demo_slip"  = true
WHERE "created_at" < NOW();
