/*
  Warnings:

  - The values [purchase,bonus,match_entry,match_win,match_refund,rake_fee,utility_purchase,adjustment] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TransactionType_new" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'MATCH_ENTRY', 'MATCH_WIN', 'MATCH_REFUND', 'RAKE_FEE', 'BONUS', 'ADMIN_ADJUSTMENT');
ALTER TABLE "transactions" ALTER COLUMN "type" TYPE "TransactionType_new" USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "TransactionType_old";
COMMIT;
