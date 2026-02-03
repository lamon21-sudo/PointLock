/*
  Warnings:

  - The values [pending,won,lost,push,cancelled] on the enum `PickStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [pending,active,won,lost,push,cancelled] on the enum `SlipStatus` will be removed. If these variants are still used in the database, this will fail.

*/

-- =====================================================
-- STEP 1: Update PickStatus Enum (Idempotent)
-- =====================================================

DO $$
DECLARE
  has_old_values BOOLEAN;
BEGIN
  -- Check if the PickStatus enum has old lowercase values
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PickStatus' AND e.enumlabel = 'pending'
  ) INTO has_old_values;

  IF has_old_values THEN
    -- Create new enum type
    CREATE TYPE "PickStatus_new" AS ENUM ('PENDING', 'HIT', 'MISS', 'PUSH', 'VOID');

    -- Migrate existing data
    ALTER TABLE "slip_picks" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "slip_picks"
      ALTER COLUMN "status" TYPE "PickStatus_new"
      USING (
        CASE status::text
          WHEN 'pending' THEN 'PENDING'::"PickStatus_new"
          WHEN 'won' THEN 'HIT'::"PickStatus_new"
          WHEN 'lost' THEN 'MISS'::"PickStatus_new"
          WHEN 'push' THEN 'PUSH'::"PickStatus_new"
          WHEN 'cancelled' THEN 'VOID'::"PickStatus_new"
          ELSE 'PENDING'::"PickStatus_new"
        END
      );

    -- Swap enums
    ALTER TYPE "PickStatus" RENAME TO "PickStatus_old";
    ALTER TYPE "PickStatus_new" RENAME TO "PickStatus";
    DROP TYPE "PickStatus_old";

    -- Restore default
    ALTER TABLE "slip_picks" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END$$;

-- =====================================================
-- STEP 2: Update SlipStatus Enum (Idempotent)
-- =====================================================

DO $$
DECLARE
  has_old_values BOOLEAN;
BEGIN
  -- Check if the SlipStatus enum has old lowercase values
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SlipStatus' AND e.enumlabel = 'pending'
  ) INTO has_old_values;

  IF has_old_values THEN
    -- Create new enum type
    CREATE TYPE "SlipStatus_new" AS ENUM ('DRAFT', 'PENDING', 'WON', 'LOST', 'VOID');

    -- Migrate existing data
    ALTER TABLE "slips" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "slips"
      ALTER COLUMN "status" TYPE "SlipStatus_new"
      USING (
        CASE status::text
          WHEN 'pending' THEN 'PENDING'::"SlipStatus_new"
          WHEN 'active' THEN 'PENDING'::"SlipStatus_new"
          WHEN 'won' THEN 'WON'::"SlipStatus_new"
          WHEN 'lost' THEN 'LOST'::"SlipStatus_new"
          WHEN 'push' THEN 'VOID'::"SlipStatus_new"
          WHEN 'cancelled' THEN 'VOID'::"SlipStatus_new"
          ELSE 'PENDING'::"SlipStatus_new"
        END
      );

    -- Swap enums
    ALTER TYPE "SlipStatus" RENAME TO "SlipStatus_old";
    ALTER TYPE "SlipStatus_new" RENAME TO "SlipStatus";
    DROP TYPE "SlipStatus_old";

    -- Restore default to DRAFT
    ALTER TABLE "slips" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  END IF;
END$$;

-- =====================================================
-- STEP 3: Add new columns to slips (if not exist)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slips' AND column_name='stake') THEN
    ALTER TABLE "slips" ADD COLUMN "stake" DECIMAL(18,8) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slips' AND column_name='total_odds') THEN
    ALTER TABLE "slips" ADD COLUMN "total_odds" DECIMAL(18,8) NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slips' AND column_name='potential_payout') THEN
    ALTER TABLE "slips" ADD COLUMN "potential_payout" DECIMAL(18,8) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slips' AND column_name='actual_payout') THEN
    ALTER TABLE "slips" ADD COLUMN "actual_payout" DECIMAL(18,8) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- =====================================================
-- STEP 4: Add new columns to slip_picks (if not exist)
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slip_picks' AND column_name='odds_decimal') THEN
    ALTER TABLE "slip_picks" ADD COLUMN "odds_decimal" DECIMAL(18,8);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slip_picks' AND column_name='is_live') THEN
    ALTER TABLE "slip_picks" ADD COLUMN "is_live" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='slip_picks' AND column_name='market_snapshot') THEN
    ALTER TABLE "slip_picks" ADD COLUMN "market_snapshot" JSONB;
  END IF;
END$$;

-- =====================================================
-- STEP 5: Update Foreign Keys
-- =====================================================

-- Update slips -> users FK to CASCADE delete
ALTER TABLE "slips" DROP CONSTRAINT IF EXISTS "slips_user_id_fkey";
ALTER TABLE "slips" ADD CONSTRAINT "slips_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Update slip_picks -> sports_events FK to RESTRICT delete
ALTER TABLE "slip_picks" DROP CONSTRAINT IF EXISTS "slip_picks_sports_event_id_fkey";
ALTER TABLE "slip_picks" ADD CONSTRAINT "slip_picks_sports_event_id_fkey"
  FOREIGN KEY ("sports_event_id") REFERENCES "sports_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================
-- STEP 6: Update Indexes
-- =====================================================

-- Drop old single-column index
DROP INDEX IF EXISTS "slips_user_id_idx";

-- Create composite indexes for performance
CREATE INDEX IF NOT EXISTS "slips_user_id_status_idx" ON "slips"("user_id", "status");
CREATE INDEX IF NOT EXISTS "slips_status_idx" ON "slips"("status");
CREATE INDEX IF NOT EXISTS "slips_created_at_idx" ON "slips"("created_at");
CREATE INDEX IF NOT EXISTS "slip_picks_sports_event_id_status_idx" ON "slip_picks"("sports_event_id", "status");

-- =====================================================
-- STEP 7: Data Backfill
-- =====================================================

-- Backfill odds_decimal for existing picks (American odds to decimal conversion)
UPDATE "slip_picks"
SET "odds_decimal" = CASE
  WHEN odds >= 0 THEN (odds::decimal / 100.0) + 1.0
  WHEN odds < 0 THEN (100.0 / ABS(odds)::decimal) + 1.0
  ELSE NULL
END
WHERE "odds_decimal" IS NULL AND odds IS NOT NULL;
