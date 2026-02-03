// =====================================================
// Live Scores Validation Schemas
// =====================================================
// Zod schemas for validating incoming live score data.

import { z } from 'zod';
import { EventStatus, SportType } from '@prisma/client';

// ===========================================
// Webhook Payload Schema
// ===========================================

/**
 * Schema for individual score update events in a webhook payload.
 */
export const rawScoreUpdateSchema = z.object({
  externalEventId: z
    .string()
    .min(1, 'External event ID is required')
    .max(100, 'External event ID too long'),
  homeScore: z
    .number()
    .int('Home score must be an integer')
    .min(0, 'Home score cannot be negative'),
  awayScore: z
    .number()
    .int('Away score must be an integer')
    .min(0, 'Away score cannot be negative'),
  status: z.string().min(1, 'Status is required'),
  gameTime: z.string().optional(),
  timestamp: z.string().datetime('Invalid timestamp format'),
  metadata: z.record(z.unknown()).optional(),
});

export type RawScoreUpdateInput = z.infer<typeof rawScoreUpdateSchema>;

/**
 * Schema for the complete webhook payload.
 */
export const webhookPayloadSchema = z.object({
  signature: z.string().optional(),
  timestamp: z.string().datetime('Invalid timestamp format'),
  provider: z.string().min(1, 'Provider is required'),
  events: z
    .array(rawScoreUpdateSchema)
    .min(1, 'At least one event is required')
    .max(100, 'Too many events in single payload'),
});

export type WebhookPayloadInput = z.infer<typeof webhookPayloadSchema>;

// ===========================================
// Manual Score Update Schema (Admin)
// ===========================================

/**
 * Schema for manual score updates via admin endpoint.
 */
export const manualScoreUpdateSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
  homeScore: z
    .number()
    .int('Home score must be an integer')
    .min(0, 'Home score cannot be negative')
    .max(200, 'Home score exceeds maximum'),
  awayScore: z
    .number()
    .int('Away score must be an integer')
    .min(0, 'Away score cannot be negative')
    .max(200, 'Away score exceeds maximum'),
  status: z.nativeEnum(EventStatus).optional(),
  reason: z
    .string()
    .min(1, 'Reason is required for audit trail')
    .max(500, 'Reason too long'),
});

export type ManualScoreUpdateInput = z.infer<typeof manualScoreUpdateSchema>;

// ===========================================
// Query Schemas
// ===========================================

/**
 * Schema for polling trigger endpoint.
 */
export const pollTriggerSchema = z.object({
  sport: z.nativeEnum(SportType),
});

export type PollTriggerInput = z.infer<typeof pollTriggerSchema>;

/**
 * Schema for queue status query.
 */
export const queueStatusQuerySchema = z.object({
  detailed: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

export type QueueStatusQueryInput = z.infer<typeof queueStatusQuerySchema>;

// ===========================================
// Event ID Validation
// ===========================================

/**
 * Schema for event ID parameter.
 */
export const eventIdParamSchema = z.object({
  eventId: z.string().uuid('Invalid event ID format'),
});

export type EventIdParamInput = z.infer<typeof eventIdParamSchema>;

// ===========================================
// Batch Score Update Schema
// ===========================================

/**
 * Schema for batch score updates (internal use).
 */
export const batchScoreUpdateSchema = z.object({
  updates: z
    .array(rawScoreUpdateSchema)
    .min(1, 'At least one update is required')
    .max(500, 'Too many updates in single batch'),
  provider: z.string().min(1, 'Provider is required'),
});

export type BatchScoreUpdateInput = z.infer<typeof batchScoreUpdateSchema>;

// ===========================================
// Game Time Validation
// ===========================================

/**
 * Parse and validate game time string.
 * Handles various formats: "Q1 12:00", "1st 5:30", "Top 3rd", etc.
 */
export function parseGameTime(gameTimeStr: string | undefined): {
  period: number;
  periodType: 'quarter' | 'half' | 'inning' | 'period' | 'overtime' | 'extra_time';
  clock?: string;
  isHalftime?: boolean;
  isOvertime?: boolean;
} | undefined {
  if (!gameTimeStr) return undefined;

  const normalized = gameTimeStr.toLowerCase().trim();

  // Check for halftime
  if (normalized.includes('half') && normalized.includes('time')) {
    return { period: 2, periodType: 'half', isHalftime: true };
  }

  // Check for overtime
  if (normalized.includes('ot') || normalized.includes('overtime')) {
    const otMatch = normalized.match(/(\d+)/);
    return {
      period: otMatch ? parseInt(otMatch[1], 10) : 1,
      periodType: 'overtime',
      isOvertime: true,
    };
  }

  // Check for extra time (soccer)
  if (normalized.includes('extra') || normalized.includes('et')) {
    return { period: 1, periodType: 'extra_time', isOvertime: true };
  }

  // Parse quarter format: "Q1", "1Q", "1st Quarter"
  const quarterMatch = normalized.match(/q?(\d+)\s*(?:q|quarter)?/);
  if (quarterMatch) {
    const clockMatch = normalized.match(/(\d+:\d+)/);
    return {
      period: parseInt(quarterMatch[1], 10),
      periodType: 'quarter',
      clock: clockMatch ? clockMatch[1] : undefined,
    };
  }

  // Parse inning format: "Top 3rd", "Bot 5", "3rd Inning"
  const inningMatch = normalized.match(/(?:top|bot(?:tom)?|mid)?\s*(\d+)(?:st|nd|rd|th)?\s*(?:inning)?/);
  if (inningMatch) {
    return {
      period: parseInt(inningMatch[1], 10),
      periodType: 'inning',
    };
  }

  // Parse period format: "1P", "Period 2"
  const periodMatch = normalized.match(/(\d+)\s*p(?:eriod)?/);
  if (periodMatch) {
    const clockMatch = normalized.match(/(\d+:\d+)/);
    return {
      period: parseInt(periodMatch[1], 10),
      periodType: 'period',
      clock: clockMatch ? clockMatch[1] : undefined,
    };
  }

  // Parse half format: "1H", "1st Half"
  const halfMatch = normalized.match(/(\d+)\s*(?:h(?:alf)?)/);
  if (halfMatch) {
    const clockMatch = normalized.match(/(\d+:\d+)/);
    return {
      period: parseInt(halfMatch[1], 10),
      periodType: 'half',
      clock: clockMatch ? clockMatch[1] : undefined,
    };
  }

  // Default: try to extract just a number
  const numMatch = normalized.match(/(\d+)/);
  if (numMatch) {
    return {
      period: parseInt(numMatch[1], 10),
      periodType: 'quarter', // Default assumption
    };
  }

  return undefined;
}
