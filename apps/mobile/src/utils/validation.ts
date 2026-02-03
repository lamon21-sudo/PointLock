// =====================================================
// Validation Utilities
// =====================================================
// Centralized validation logic for stake amounts and other inputs.
// Implements strict validation rules per PVP Referee Auditor requirements.

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Minimum stake amount in cents (100 RC = $1.00)
 */
export const MIN_STAKE_AMOUNT = 100;

/**
 * Maximum stake amount in cents (1,000,000 RC to prevent UI overflow)
 */
export const MAX_STAKE_AMOUNT = 1_000_000;

/**
 * Validates a stake amount for PVP challenges.
 *
 * Validation Rules:
 * 1. Amount must be ≥ 100 RC (minimum stake)
 * 2. Amount must be a positive integer (no decimals)
 * 3. Amount must be ≤ user's balance (sufficient funds)
 * 4. Amount must be ≤ 1,000,000 RC (prevent UI overflow)
 *
 * @param amountInCents - Stake amount in cents
 * @param balanceInCents - User's current balance in cents
 * @returns ValidationResult with isValid flag and error message
 *
 * @example
 * ```ts
 * const result = validateStakeAmount(5000, 10000);
 * if (!result.isValid) {
 *   showError(result.error);
 * }
 * ```
 */
export function validateStakeAmount(
  amountInCents: number,
  balanceInCents: number
): ValidationResult {
  // Rule 1: Minimum stake check
  if (amountInCents < MIN_STAKE_AMOUNT) {
    return {
      isValid: false,
      error: `Minimum stake is ${MIN_STAKE_AMOUNT} RC ($${(MIN_STAKE_AMOUNT / 100).toFixed(2)})`,
    };
  }

  // Rule 2: Integer check (no decimals for RC)
  if (!Number.isInteger(amountInCents)) {
    return {
      isValid: false,
      error: 'Stake must be a whole number (RC are whole units)',
    };
  }

  // Rule 3: Sufficient balance check
  if (amountInCents > balanceInCents) {
    return {
      isValid: false,
      error: 'Insufficient RC. Add funds or lower stake.',
    };
  }

  // Rule 4: Maximum stake check (prevent UI overflow)
  if (amountInCents > MAX_STAKE_AMOUNT) {
    return {
      isValid: false,
      error: `Maximum stake is ${MAX_STAKE_AMOUNT.toLocaleString()} RC`,
    };
  }

  // All validation passed
  return {
    isValid: true,
    error: null,
  };
}

/**
 * Sanitizes user input text to extract a valid stake amount.
 *
 * Process:
 * 1. Removes all non-numeric characters
 * 2. Parses as integer with explicit radix
 * 3. Returns null for invalid/empty input
 *
 * Security:
 * - Uses parseInt(value, 10) with explicit radix to prevent exploits
 * - Never uses Number() or unary + operators
 * - Validates result is not NaN
 *
 * @param inputText - Raw user input string
 * @returns Parsed integer amount or null if invalid
 *
 * @example
 * ```ts
 * sanitizeStakeInput('5,000 RC')   // → 5000
 * sanitizeStakeInput('abc123')     // → 123
 * sanitizeStakeInput('')           // → null
 * sanitizeStakeInput('1000.50')    // → 100050 (decimals removed)
 * ```
 */
export function sanitizeStakeInput(inputText: string): number | null {
  // Remove all non-numeric characters (including commas, decimals, spaces)
  const cleaned = inputText.replace(/[^0-9]/g, '');

  // Empty input after sanitization
  if (cleaned === '') {
    return null;
  }

  // Parse to integer with explicit radix (security best practice)
  const parsed = parseInt(cleaned, 10);

  // Safety check for NaN (shouldn't happen with regex, but defense in depth)
  if (isNaN(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Formats validation error for display to user.
 * Adds context and suggestions when appropriate.
 *
 * @param error - Raw validation error string
 * @param balance - User's current balance (for context)
 * @returns User-friendly error message
 */
export function formatValidationError(error: string, balance: number): string {
  if (error.includes('Insufficient RC')) {
    return `${error} Your balance: ${balance.toLocaleString()} RC`;
  }
  return error;
}
