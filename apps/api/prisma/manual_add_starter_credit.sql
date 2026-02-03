-- Manual fix: Add STARTER_CREDIT to TransactionType enum if missing
-- Run this SQL directly against your PostgreSQL database

DO $$
BEGIN
    -- Check if STARTER_CREDIT already exists in the enum
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'STARTER_CREDIT'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TransactionType')
    ) THEN
        -- Add the enum value
        ALTER TYPE "TransactionType" ADD VALUE 'STARTER_CREDIT';
        RAISE NOTICE 'Added STARTER_CREDIT to TransactionType enum';
    ELSE
        RAISE NOTICE 'STARTER_CREDIT already exists in TransactionType enum';
    END IF;
END
$$;
