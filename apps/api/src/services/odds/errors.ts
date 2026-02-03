// =====================================================
// Sports Data Service Errors
// =====================================================
// Custom exceptions for sports data operations

import { AppError } from '../../utils/errors';
import { ErrorCode, ERROR_CODES } from '@pick-rivals/shared-types';

/**
 * Base exception for all sports data related errors.
 * Allows the API layer to catch and handle sports data failures gracefully.
 */
export class SportsDataException extends AppError {
  public readonly provider: string;
  public readonly retryable: boolean;
  public readonly originalError?: Error;

  constructor(
    message: string,
    provider: string,
    code: ErrorCode = ERROR_CODES.SPORTS_DATA_PROVIDER_ERROR,
    statusCode: number = 503,
    retryable: boolean = false,
    originalError?: Error
  ) {
    super(message, statusCode, code, true);
    this.provider = provider;
    this.retryable = retryable;
    this.originalError = originalError;
    this.name = 'SportsDataException';
  }
}

/**
 * Thrown when the sports data API is unavailable or unreachable
 */
export class SportsDataUnavailableError extends SportsDataException {
  constructor(provider: string, originalError?: Error) {
    super(
      `Sports data provider ${provider} is currently unavailable`,
      provider,
      ERROR_CODES.SPORTS_DATA_UNAVAILABLE,
      503,
      true, // Retryable
      originalError
    );
    this.name = 'SportsDataUnavailableError';
  }
}

/**
 * Thrown when rate limited by the sports data API
 */
export class SportsDataRateLimitedError extends SportsDataException {
  public readonly retryAfterSeconds: number | null;

  constructor(provider: string, retryAfterSeconds: number | null = null, originalError?: Error) {
    super(
      `Rate limited by sports data provider ${provider}${retryAfterSeconds ? `. Retry after ${retryAfterSeconds}s` : ''}`,
      provider,
      ERROR_CODES.SPORTS_DATA_RATE_LIMITED,
      429,
      true, // Retryable after delay
      originalError
    );
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = 'SportsDataRateLimitedError';
  }
}

/**
 * Thrown when the API response cannot be parsed or is malformed
 */
export class SportsDataInvalidResponseError extends SportsDataException {
  constructor(provider: string, details?: string, originalError?: Error) {
    super(
      `Invalid response from sports data provider ${provider}${details ? `: ${details}` : ''}`,
      provider,
      ERROR_CODES.SPORTS_DATA_INVALID_RESPONSE,
      502,
      false, // Not retryable - bad data won't fix itself
      originalError
    );
    this.name = 'SportsDataInvalidResponseError';
  }
}
