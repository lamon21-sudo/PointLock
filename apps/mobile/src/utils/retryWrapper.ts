// =====================================================
// Retry Wrapper Utility
// =====================================================
// Provides exponential backoff retry logic with jitter.
// Use for network operations that may fail transiently.

// =====================================================
// Types
// =====================================================

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 to randomize delays (default: 0.2) */
  jitterFactor?: number;
  /** Optional callback when a retry occurs */
  onRetry?: (attempt: number, error: Error, nextDelayMs: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

// =====================================================
// Constants
// =====================================================

const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'onRetry'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  jitterFactor: 0.2,
};

// HTTP status codes that should be retried
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

// HTTP status codes that should NOT be retried (client errors)
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  409, // Conflict (may want to handle specially)
  422, // Unprocessable Entity
]);

// =====================================================
// Helpers
// =====================================================

/**
 * Calculate delay with exponential backoff and jitter.
 * Formula: min(maxDelay, baseDelay * 2^attempt) * (1 + random * jitter)
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  const jitter = 1 + (Math.random() * 2 - 1) * jitterFactor;
  return Math.round(cappedDelay * jitter);
}

/**
 * Check if an error is retryable.
 * Network errors and certain HTTP status codes are retryable.
 */
function isRetryableError(error: unknown): boolean {
  // Network error (no response)
  if (error instanceof TypeError && error.message.includes('network')) {
    return true;
  }

  // Check for Axios-style error with response
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { status?: number }; code?: string; message?: string };

    // Network errors from Axios
    if (err.code === 'ECONNABORTED' || err.code === 'ERR_NETWORK') {
      return true;
    }

    // Check HTTP status code
    if (err.response?.status) {
      if (RETRYABLE_STATUS_CODES.has(err.response.status)) {
        return true;
      }
      if (NON_RETRYABLE_STATUS_CODES.has(err.response.status)) {
        return false;
      }
    }

    // Generic network error message
    if (err.message?.toLowerCase().includes('network')) {
      return true;
    }

    // Timeout
    if (err.message?.toLowerCase().includes('timeout')) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =====================================================
// Main Functions
// =====================================================

/**
 * Execute an async operation with exponential backoff retry.
 *
 * @param operation - The async function to execute
 * @param config - Retry configuration
 * @returns Promise resolving to RetryResult
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => api.post('/matches/quick', { slipId, stakeAmount }),
 *   { maxRetries: 3, onRetry: (attempt, err) => console.log(`Retry ${attempt}`) }
 * );
 *
 * if (result.success) {
 *   console.log('Success:', result.data);
 * } else {
 *   console.error('Failed after retries:', result.error);
 * }
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = DEFAULT_CONFIG.maxRetries,
    baseDelayMs = DEFAULT_CONFIG.baseDelayMs,
    maxDelayMs = DEFAULT_CONFIG.maxDelayMs,
    jitterFactor = DEFAULT_CONFIG.jitterFactor,
    onRetry,
  } = config;

  let lastError: Error | undefined;
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;

    try {
      const data = await operation();
      return { success: true, data, attempts };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < maxRetries && isRetryableError(error)) {
        const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs, jitterFactor);

        if (__DEV__) {
          console.log(
            `[RetryWrapper] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms:`,
            lastError.message
          );
        }

        if (onRetry) {
          onRetry(attempt + 1, lastError, delayMs);
        }

        await sleep(delayMs);
      } else {
        // Non-retryable error or max retries reached
        break;
      }
    }
  }

  return { success: false, error: lastError, attempts };
}

/**
 * Execute an async operation with retry, throwing on failure.
 * Use when you want to handle errors in a try/catch block.
 *
 * @param operation - The async function to execute
 * @param config - Retry configuration
 * @returns Promise resolving to the operation result
 * @throws The last error if all retries fail
 *
 * @example
 * ```ts
 * try {
 *   const data = await retryAsync(() => api.get('/data'), { maxRetries: 3 });
 *   console.log('Success:', data);
 * } catch (error) {
 *   console.error('All retries failed:', error);
 * }
 * ```
 */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const result = await withRetry(operation, config);

  if (result.success && result.data !== undefined) {
    return result.data;
  }

  throw result.error || new Error('Operation failed after retries');
}

/**
 * Check if a specific error is retryable (exported for testing).
 */
export { isRetryableError };

export default withRetry;
