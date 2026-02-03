// =====================================================
// Zod Validation Middleware
// =====================================================
// Validates request body, query params, or URL params against Zod schemas.
// Returns standardized 400 error response with specific field issues.
// Validation happens at the boundary - no invalid data reaches controllers.

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, z } from 'zod';
import { BadRequestError } from '../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Types
// ===========================================

/**
 * Request property to validate.
 * - body: POST/PUT/PATCH request body
 * - query: URL query parameters
 * - params: URL path parameters
 */
export type ValidatedRequestProperty = 'body' | 'query' | 'params';

/**
 * Validation error detail with field path and message.
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

// ===========================================
// Middleware Factory
// ===========================================

/**
 * Creates a validation middleware for the specified request property.
 *
 * @param schema - Zod schema to validate against
 * @param property - Request property to validate (body, query, params)
 * @returns Express middleware that validates and throws on error
 *
 * @throws {BadRequestError} When validation fails with detailed field errors
 *
 * @example
 * ```typescript
 * const registerSchema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * });
 *
 * router.post(
 *   '/register',
 *   validateRequest(registerSchema, 'body'),
 *   registerController
 * );
 * ```
 */
export function validateRequest<T extends ZodSchema>(
  schema: T,
  property: ValidatedRequestProperty = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      // Validate the specified request property
      const result = schema.safeParse(req[property]);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw new BadRequestError(
          `Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      // Replace the request property with the validated & transformed data
      // This ensures type safety and applies Zod transformations (trim, toLowerCase, etc.)
      req[property] = result.data;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validates multiple request properties in a single middleware.
 * Use when you need to validate both body AND query params, for example.
 *
 * @param schemas - Object mapping request properties to their schemas
 * @returns Express middleware that validates all specified properties
 *
 * @example
 * ```typescript
 * router.get(
 *   '/users/:id',
 *   validateMultiple({
 *     params: z.object({ id: z.string().uuid() }),
 *     query: z.object({ include: z.enum(['profile', 'stats']).optional() })
 *   }),
 *   getUserController
 * );
 * ```
 */
export function validateMultiple(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const allErrors: ValidationErrorDetail[] = [];

      // Validate each specified property
      for (const [property, schema] of Object.entries(schemas)) {
        if (!schema) continue;

        const prop = property as ValidatedRequestProperty;
        const result = schema.safeParse(req[prop]);

        if (!result.success) {
          const errors = formatZodErrors(result.error);
          allErrors.push(...errors.map((e) => ({ ...e, field: `${prop}.${e.field}` })));
        } else {
          // Replace with validated data
          req[prop] = result.data;
        }
      }

      if (allErrors.length > 0) {
        throw new BadRequestError(
          `Validation failed: ${allErrors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Optional validation middleware - only validates if data is present.
 * Useful for PATCH endpoints where all fields are optional.
 *
 * @param schema - Zod schema to validate against
 * @param property - Request property to validate
 * @returns Express middleware that validates only if property exists
 */
export function validateOptional<T extends ZodSchema>(
  schema: T,
  property: ValidatedRequestProperty = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = req[property];

      // If no data present, skip validation
      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        next();
        return;
      }

      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        throw new BadRequestError(
          `Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      req[property] = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Formats Zod validation errors into a clean array of field errors.
 */
function formatZodErrors(error: z.ZodError): ValidationErrorDetail[] {
  return error.errors.map((err) => ({
    field: err.path.join('.') || 'unknown',
    message: err.message,
  }));
}

/**
 * Type guard to check if a value is a ZodSchema.
 * Useful for runtime validation of schema objects.
 */
export function isZodSchema(value: unknown): value is ZodSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'safeParse' in value &&
    typeof (value as { safeParse: unknown }).safeParse === 'function'
  );
}
