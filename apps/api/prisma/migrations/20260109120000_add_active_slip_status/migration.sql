-- Migration: add_active_slip_status
-- Add ACTIVE value to SlipStatus enum

-- Add 'ACTIVE' value to SlipStatus enum
ALTER TYPE "SlipStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
