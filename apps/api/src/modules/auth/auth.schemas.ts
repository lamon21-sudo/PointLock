// =====================================================
// Auth Validation Schemas (Zod)
// =====================================================
// All input validation happens at the boundary.
// These schemas enforce strict type safety and business rules.

import { z } from 'zod';

// ===========================================
// Constants
// ===========================================

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// ===========================================
// Register Schema
// ===========================================

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email format')
    .max(255, 'Email too long'),

  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
    .max(USERNAME_MAX_LENGTH, `Username cannot exceed ${USERNAME_MAX_LENGTH} characters`)
    .regex(
      USERNAME_PATTERN,
      'Username can only contain letters, numbers, and underscores'
    ),

  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
    .refine(
      (password) => /[A-Z]/.test(password),
      'Password must contain at least one uppercase letter'
    )
    .refine(
      (password) => /[a-z]/.test(password),
      'Password must contain at least one lowercase letter'
    )
    .refine(
      (password) => /[0-9]/.test(password),
      'Password must contain at least one number'
    )
    .refine(
      (password) => /[!@#$%^&*(),.?":{}|<>]/.test(password),
      'Password must contain at least one special character'
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ===========================================
// Login Schema
// ===========================================

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email format'),

  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ===========================================
// Refresh Token Schema
// ===========================================

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ===========================================
// Check Username Availability Schema
// ===========================================

export const checkUsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
    .max(20, 'Username cannot exceed 20 characters') // Note: Different from registration (20 vs 30)
    .regex(
      USERNAME_PATTERN,
      'Username can only contain letters, numbers, and underscores'
    ),
});

export type CheckUsernameInput = z.infer<typeof checkUsernameSchema>;

// ===========================================
// Push Token Schema
// ===========================================

const EXPO_PUSH_TOKEN_PATTERN = /^ExponentPushToken\[.+\]$/;

export const pushTokenSchema = z.object({
  token: z
    .string()
    .min(1, 'Push token is required')
    .regex(
      EXPO_PUSH_TOKEN_PATTERN,
      'Invalid push token format. Expected ExponentPushToken[...]'
    ),
});

export type PushTokenInput = z.infer<typeof pushTokenSchema>;

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
