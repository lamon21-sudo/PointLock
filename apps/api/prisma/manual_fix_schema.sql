-- Manual schema fix to align with schema.prisma
-- Run this if the migration was marked as applied but not actually executed

-- Step 1: Update PickStatus enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'PickStatus' AND e.enumlabel = 'pending') THEN
    -- Old enum values exist, need to migrate
    CREATE TYPE "PickStatus_new" AS ENUM ('PENDING', 'HIT', 'MISS', 'PUSH', 'VOID');

    ALTER TABLE "slip_picks" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "slip_picks"
      ALTER COLUMN "status" TYPE "PickStatus_new"
      USING (
        CASE status::text
          WHEN 'pending' THEN 'PENDING'::PickStatus_new
          WHEN 'won' THEN 'HIT'::PickStatus_new
          WHEN 'lost' THEN 'MISS'::PickStatus_new
          WHEN 'push' THEN 'PUSH'::PickStatus_new
          WHEN 'cancelled' THEN 'VOID'::PickStatus_new
          ELSE 'PENDING'::PickStatus_new
        END
      );

    ALTER TYPE "PickStatus" RENAME TO "PickStatus_old";
    ALTER TYPE "PickStatus_new" RENAME TO "PickStatus";
    DROP TYPE "PickStatus_old";

    ALTER TABLE "slip_picks" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END$$;

-- Step 2: Update SlipStatus enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'SlipStatus' AND e.enumlabel = 'pending') THEN
    -- Old enum values exist, need to migrate
    CREATE TYPE "SlipStatus_new" AS ENUM ('DRAFT', 'PENDING', 'WON', 'LOST', 'VOID');

    ALTER TABLE "slips" ALTER COLUMN "status" DROP DEFAULT;

    ALTER TABLE "slips"
      ALTER COLUMN "status" TYPE "SlipStatus_new"
      USING (
        CASE status::text
          WHEN 'pending' THEN 'PENDING'::SlipStatus_new
          WHEN 'active' THEN 'PENDING'::SlipStatus_new
          WHEN 'won' THEN 'WON'::SlipStatus_new
          WHEN 'lost' THEN 'LOST'::SlipStatus_new
          WHEN 'push' THEN 'VOID'::SlipStatus_new
          WHEN 'cancelled' THEN 'VOID'::SlipStatus_new
          ELSE 'PENDING'::SlipStatus_new
        END
      );

    ALTER TYPE "SlipStatus" RENAME TO "SlipStatus_old";
    ALTER TYPE "SlipStatus_new" RENAME TO "SlipStatus";
    DROP TYPE "SlipStatus_old";

    ALTER TABLE "slips" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  END IF;
END$$;

-- Step 3: Add columns if missing
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

-- Step 4: Update foreign keys
ALTER TABLE "slips" DROP CONSTRAINT IF EXISTS "slips_user_id_fkey";
ALTER TABLE "slips" ADD CONSTRAINT "slips_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "slip_picks" DROP CONSTRAINT IF EXISTS "slip_picks_sports_event_id_fkey";
ALTER TABLE "slip_picks" ADD CONSTRAINT "slip_picks_sports_event_id_fkey"
  FOREIGN KEY ("sports_event_id") REFERENCES "sports_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Update indexes
DROP INDEX IF EXISTS "slips_user_id_idx";
CREATE INDEX IF NOT EXISTS "slips_user_id_status_idx" ON "slips"("user_id", "status");
CREATE INDEX IF NOT EXISTS "slips_status_idx" ON "slips"("status");
CREATE INDEX IF NOT EXISTS "slips_created_at_idx" ON "slips"("created_at");
CREATE INDEX IF NOT EXISTS "slip_picks_sports_event_id_status_idx" ON "slip_picks"("sports_event_id", "status");

-- Step 6: Backfill data
UPDATE "slip_picks"
SET "odds_decimal" = CASE
  WHEN odds >= 0 THEN (odds::decimal / 100.0) + 1.0
  WHEN odds < 0 THEN (100.0 / ABS(odds)::decimal) + 1.0
  ELSE NULL
END
WHERE "odds_decimal" IS NULL AND odds IS NOT NULL;

SELECT 'Schema fix applied successfully!' AS result;
