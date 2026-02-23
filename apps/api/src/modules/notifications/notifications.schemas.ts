// =====================================================
// Notification Validation Schemas
// =====================================================
// All input validation happens at the boundary.
// These schemas enforce strict type safety and business rules.

import { z } from 'zod';

// =====================================================
// Validation Helper
// =====================================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError['errors'];
}

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.errors };
}

// =====================================================
// Device Token
// =====================================================

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().optional(),
  appVersion: z.string().optional(),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

export const removeDeviceTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

export type RemoveDeviceTokenInput = z.infer<typeof removeDeviceTokenSchema>;

// =====================================================
// Preferences
// =====================================================

export const updatePreferencesSchema = z.object({
  settlementEnabled: z.boolean().optional(),
  pvpChallengeEnabled: z.boolean().optional(),
  slipExpiringEnabled: z.boolean().optional(),
  socialEnabled: z.boolean().optional(),
  gameReminderEnabled: z.boolean().optional(),
  leaderboardEnabled: z.boolean().optional(),
  dailyDigestEnabled: z.boolean().optional(),
  weeklyRecapEnabled: z.boolean().optional(),
  winStreakEnabled: z.boolean().optional(),
  inactivityEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
  digestTimeLocal: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format')
    .optional(),
  recapDayOfWeek: z.number().int().min(1).max(7).optional(),
  allNotificationsEnabled: z.boolean().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// =====================================================
// Inbox
// =====================================================

export const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export type InboxQueryInput = z.infer<typeof inboxQuerySchema>;

// =====================================================
// Param Schemas
// =====================================================

export const inboxItemIdParamSchema = z.object({
  id: z.string().uuid('Inbox item ID must be a valid UUID'),
});

export type InboxItemIdParam = z.infer<typeof inboxItemIdParamSchema>;
