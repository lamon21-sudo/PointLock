-- Task 0.4: Add STARTER_CREDIT transaction type for one-time starter coins on registration
-- This migration adds the STARTER_CREDIT value to the TransactionType enum

ALTER TYPE "TransactionType" ADD VALUE 'STARTER_CREDIT';
