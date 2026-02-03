// =====================================================
// Wallet Validation Schemas (Zod)
// =====================================================
// All input validation happens at the boundary.
// These schemas enforce strict type safety and business rules.

import { z } from 'zod';

// ===========================================
// Constants
// ===========================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_PAGE = 1;
const MIN_LIMIT = 1;

// Valid transaction types for filtering (hardcoded to avoid Prisma client dependency issues)
// These must match the TransactionType enum in schema.prisma
const VALID_TRANSACTION_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'MATCH_ENTRY',
  'MATCH_WIN',
  'MATCH_REFUND',
  'RAKE_FEE',
  'BONUS',
  'WEEKLY_ALLOWANCE',
  'ADMIN_ADJUSTMENT',
] as const;

export type ValidTransactionType = typeof VALID_TRANSACTION_TYPES[number];

// ===========================================
// Transaction History Query Schema
// ===========================================

export const transactionHistoryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return DEFAULT_PAGE;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < MIN_PAGE) return DEFAULT_PAGE;
      return parsed;
    }),

  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return DEFAULT_LIMIT;
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < MIN_LIMIT) return DEFAULT_LIMIT;
      if (parsed > MAX_LIMIT) return MAX_LIMIT;
      return parsed;
    }),

  type: z
    .string()
    .optional()
    .transform((val): ValidTransactionType | undefined => {
      if (!val) return undefined;
      const upperVal = val.toUpperCase() as ValidTransactionType;
      if (!VALID_TRANSACTION_TYPES.includes(upperVal)) return undefined;
      return upperVal;
    }),
});

export type TransactionHistoryQuery = z.infer<typeof transactionHistoryQuerySchema>;

// ===========================================
// Process Transaction Schema (for future use)
// ===========================================

export const processTransactionSchema = z.object({
  amount: z
    .number()
    .int('Amount must be an integer (cents)')
    .positive('Amount must be positive')
    .max(10000000, 'Amount exceeds maximum allowed ($100,000)'),

  type: z.enum([
    'DEPOSIT',
    'WITHDRAWAL',
    'MATCH_ENTRY',
    'MATCH_WIN',
    'MATCH_REFUND',
    'RAKE_FEE',
    'BONUS',
    'WEEKLY_ALLOWANCE',
    'ADMIN_ADJUSTMENT',
  ]),

  idempotencyKey: z
    .string()
    .min(1, 'Idempotency key is required')
    .max(255, 'Idempotency key too long'),

  matchId: z
    .string()
    .uuid('Invalid match ID format')
    .optional(),

  description: z
    .string()
    .max(500, 'Description too long')
    .optional(),

  useBonus: z.boolean().optional().default(false),
  preferBonus: z.boolean().optional().default(true),
});

export type ProcessTransactionInput = z.infer<typeof processTransactionSchema>;

// ===========================================
// Allowance Response Schemas
// ===========================================

export const allowanceEligibilityResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.string(),
  lastClaimedAt: z.string().datetime().nullable(),
  nextAvailableAt: z.string().datetime().nullable(),
  daysUntilAvailable: z.number().int().min(0),
  hoursUntilAvailable: z.number().int().min(0),
});

export const allowanceCheckResponseSchema = z.object({
  eligible: z.boolean(),
  eligibility: allowanceEligibilityResponseSchema,
  currentBalance: z.number().int().min(0),
  allowanceAmount: z.number().int().positive(),
});

export const allowanceClaimResponseSchema = z.object({
  claimed: z.boolean(),
  amount: z.number().int().min(0),
  newBalance: z.number().int().min(0),
  transactionId: z.string().uuid().nullable(),
  nextClaimAt: z.string().datetime(),
  message: z.string(),
});

export type AllowanceEligibilityResponse = z.infer<typeof allowanceEligibilityResponseSchema>;
export type AllowanceCheckResponse = z.infer<typeof allowanceCheckResponseSchema>;
export type AllowanceClaimResponse = z.infer<typeof allowanceClaimResponseSchema>;

// ===========================================
// Validation Helper
// ===========================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
}

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.errors };
}
