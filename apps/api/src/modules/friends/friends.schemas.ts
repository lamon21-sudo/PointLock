// =====================================================
// Friends Module - Validation Schemas
// =====================================================
// Zod schemas for request validation.
// All schemas enforce strict typing and proper validation.

import { z } from 'zod';

// ===========================================
// Path Parameter Schemas
// ===========================================

/**
 * Validates userId path parameter
 * Must be a valid UUID
 */
export const userIdParamSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid user ID format' }),
});

/**
 * Validates friendshipId path parameter
 * Must be a valid UUID
 */
export const friendshipIdParamSchema = z.object({
  friendshipId: z.string().uuid({ message: 'Invalid friendship ID format' }),
});

// ===========================================
// Query Parameter Schemas
// ===========================================

/**
 * Query parameters for listing friendships
 * Supports filtering, pagination, and sorting
 */
export const listFriendsQuerySchema = z.object({
  filter: z
    .enum(['all', 'accepted', 'incoming', 'outgoing', 'blocked'])
    .optional()
    .default('all')
    .describe('Filter friendships by status or direction'),

  page: z
    .string()
    .optional()
    .default('1')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .describe('Page number for pagination'),

  limit: z
    .string()
    .optional()
    .default('20')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(50))
    .describe('Number of results per page (1-50)'),
});

// ===========================================
// Type Exports
// ===========================================

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type FriendshipIdParam = z.infer<typeof friendshipIdParamSchema>;
export type ListFriendsQuery = z.infer<typeof listFriendsQuerySchema>;
