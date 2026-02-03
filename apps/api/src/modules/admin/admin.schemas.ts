// =====================================================
// Admin Module Validation Schemas & Types
// Task 8.5: Settlement Edge Cases
// =====================================================
// Zod schemas for admin API request validation.

import { z } from 'zod';
import { SETTLEMENT_EDGE_CASE_CONSTANTS } from '../../services/settlement/settlement-edge-cases.types';

const { MIN_JUSTIFICATION_LENGTH, MAX_JUSTIFICATION_LENGTH } = SETTLEMENT_EDGE_CASE_CONSTANTS;

// ===========================================
// Manual Settlement Schemas
// ===========================================

/**
 * Schema for manual match settlement.
 * Requires a detailed reason for audit purposes.
 */
export const manualSettlementSchema = z.object({
  action: z.enum(['force_settle', 'void_and_refund', 'resolve_dispute'], {
    errorMap: () => ({ message: 'Invalid action. Must be force_settle, void_and_refund, or resolve_dispute' }),
  }),
  winnerId: z
    .string()
    .uuid('Invalid winner ID format')
    .optional()
    .nullable(),
  reason: z
    .string()
    .min(MIN_JUSTIFICATION_LENGTH, `Reason must be at least ${MIN_JUSTIFICATION_LENGTH} characters for audit purposes`)
    .max(MAX_JUSTIFICATION_LENGTH, `Reason cannot exceed ${MAX_JUSTIFICATION_LENGTH} characters`),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => {
    // winnerId is required for force_settle
    if (data.action === 'force_settle' && !data.winnerId) {
      return false;
    }
    return true;
  },
  {
    message: 'winnerId is required for force_settle action',
    path: ['winnerId'],
  }
);

/**
 * Schema for event cancellation.
 */
export const cancelEventSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
});

/**
 * Schema for match audit log query.
 */
export const auditLogQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => parseInt(val || '1', 10))
    .pipe(z.number().int().min(1, 'Page must be at least 1')),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(parseInt(val || '50', 10), 100))
    .pipe(z.number().int().min(1).max(100)),
  action: z.string().optional(),
});

/**
 * Schema for pending settlements query.
 */
export const pendingSettlementsQuerySchema = z.object({
  status: z
    .enum(['active', 'postponed', 'disputed'])
    .optional()
    .default('active'),
  page: z
    .string()
    .optional()
    .transform((val) => parseInt(val || '1', 10))
    .pipe(z.number().int().min(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(parseInt(val || '20', 10), 100))
    .pipe(z.number().int().min(1).max(100)),
});

// ===========================================
// TypeScript Types
// ===========================================

export type ManualSettlementInput = z.infer<typeof manualSettlementSchema>;
export type CancelEventInput = z.infer<typeof cancelEventSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type PendingSettlementsQuery = z.infer<typeof pendingSettlementsQuerySchema>;
