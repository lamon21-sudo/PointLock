/**
 * Error Logger Utility
 *
 * Centralized error logging for the app.
 * Currently a noop in production - integrate with Sentry when ready.
 */

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
 * In production: noop (ready for Sentry integration).
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

  // TODO: Integrate with Sentry or error monitoring service
  // Example Sentry integration:
  // Sentry.captureException(error, {
  //   extra: context,
  //   tags: { errorId: context?.errorId },
  // });
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

  // TODO: Send to monitoring service as warning level
}

export default logAppError;
