// =====================================================
// Admin User Management Validation Schemas
// =====================================================
// Zod schemas for admin user management operations.

import { z } from 'zod';

// ===========================================
// User List & Search
// ===========================================

export const listUsersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(['active', 'suspended', 'banned', 'pending_verification']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ===========================================
// User ID Parameter
// ===========================================

export const adminUserIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

// ===========================================
// User Status Management
// ===========================================

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(10, 'Reason must be at least 10 characters').max(500),
});

// ===========================================
// Token Revocation
// ===========================================

export const revokeTokensSchema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
});

// ===========================================
// Wallet Adjustments
// ===========================================

export const adminWalletAdjustSchema = z.object({
  amount: z.number().int('Amount must be integer (cents)').refine((v) => v !== 0, 'Amount cannot be zero'),
  type: z.enum(['BONUS', 'ADMIN_ADJUSTMENT']),
  reason: z.string().trim().min(10, 'Reason must be at least 10 characters').max(500),
});

// ===========================================
// Audit Log Query
// ===========================================

export const listAuditLogQuerySchema = z.object({
  action: z.string().optional(),
  performedBy: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ===========================================
// TypeScript Types
// ===========================================

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type RevokeTokensInput = z.infer<typeof revokeTokensSchema>;
export type AdminWalletAdjustInput = z.infer<typeof adminWalletAdjustSchema>;
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
