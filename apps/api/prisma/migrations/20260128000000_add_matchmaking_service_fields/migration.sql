-- Task 2.1: Matchmaking Service - Schema Updates
-- This migration adds fields for the matchmaking service including:
-- - Slip reference (slipId, slipSize) for exact matching
-- - Financial security (entryTxId, entryIdempotencyKey) for debit-first pattern
-- - Concurrency control (version, claimExpiresAt) for optimistic locking
-- - Audit fields (matchedByWorker, queueDurationMs) for debugging

-- AlterTable: Add new columns to matchmaking_queue
ALTER TABLE "matchmaking_queue" ADD COLUMN "slip_id" TEXT;
ALTER TABLE "matchmaking_queue" ADD COLUMN "slip_size" INTEGER;
ALTER TABLE "matchmaking_queue" ADD COLUMN "entry_tx_id" TEXT;
ALTER TABLE "matchmaking_queue" ADD COLUMN "entry_idempotency_key" TEXT;
ALTER TABLE "matchmaking_queue" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "matchmaking_queue" ADD COLUMN "claim_expires_at" TIMESTAMP(3);
ALTER TABLE "matchmaking_queue" ADD COLUMN "matched_by_worker" TEXT;
ALTER TABLE "matchmaking_queue" ADD COLUMN "queue_duration_ms" INTEGER;

-- CreateIndex: Unique constraints for idempotency
CREATE UNIQUE INDEX "matchmaking_queue_slip_id_key" ON "matchmaking_queue"("slip_id");
CREATE UNIQUE INDEX "matchmaking_queue_entry_tx_id_key" ON "matchmaking_queue"("entry_tx_id");
CREATE UNIQUE INDEX "matchmaking_queue_entry_idempotency_key_key" ON "matchmaking_queue"("entry_idempotency_key");

-- CreateIndex: Compatibility pool index for efficient matching
CREATE INDEX "matchmaking_queue_slip_size_tier_stake_amount_status_idx" ON "matchmaking_queue"("slip_size", "tier", "stake_amount", "status");

-- AddForeignKey: Link queue entry to slip
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constraint: Ensure slip_size is positive when set
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "chk_slip_size_positive" CHECK ("slip_size" IS NULL OR "slip_size" > 0);

-- Constraint: Ensure version is positive
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "chk_version_positive" CHECK ("version" > 0);
