// =====================================================
// Users Schema Definitions
// =====================================================
// Zod schemas for request validation

import { z } from 'zod';

// ===========================================
// Validation Schemas
// ===========================================

/**
 * Schema for updating user profile.
 * - displayName: Optional, 2-30 characters
 * - avatarUrl: Optional, must be a valid string
 */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(30, 'Display name cannot exceed 30 characters')
    .optional(),
  avatarUrl: z
    .string()
    .optional(),
});

/**
 * Schema for user ID parameter validation.
 * Ensures the provided ID is a valid UUID.
 */
export const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

// ===========================================
// Types
// ===========================================

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
