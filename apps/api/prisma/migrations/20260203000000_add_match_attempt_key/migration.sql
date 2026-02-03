-- AlterTable
ALTER TABLE "matches" ADD COLUMN "match_attempt_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "matches_match_attempt_key_key" ON "matches"("match_attempt_key");
