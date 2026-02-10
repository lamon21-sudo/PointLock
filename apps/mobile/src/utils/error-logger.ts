/**
 * Error Logger Utility
 *
 * Centralized error logging for the app.
 * Sends errors to Sentry in production, logs to console in development.
 */

import * as Sentry from '@sentry/react-native';

interface ErrorContext {
  errorId?: string | null;
  componentStack?: string | null;
  userId?: string;
  screen?: string;
  [key: string]: unknown;
}

/**
 * Log application errors for monitoring.
 * In development: logs to console with structured output.
 * In production: sends to Sentry.
 *
 * @param error - The error object to log
 * @param context - Additional context about where/how the error occurred
 */
export function logAppError(error: Error, context?: ErrorContext): void {
  if (__DEV__) {
    console.group('[ErrorLogger] Application Error');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (context) {
      console.log('Context:', JSON.stringify(context, null, 2));
    }
    console.groupEnd();
  }

  Sentry.captureException(error, {
    extra: context as Record<string, unknown>,
    tags: context?.errorId ? { errorId: String(context.errorId) } : undefined,
  });
}

/**
 * Log a warning (non-fatal issue).
 *
 * @param message - Warning message
 * @param context - Additional context
 */
export function logAppWarning(
  message: string,
  context?: Record<string, unknown>
): void {
  if (__DEV__) {
    console.warn('[ErrorLogger] Warning:', message, context);
  }

  Sentry.captureMessage(message, {
    level: 'warning',
    extra: context,
  });
}

export default logAppError;
