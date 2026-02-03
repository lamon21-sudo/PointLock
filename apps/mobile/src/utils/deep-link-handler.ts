// =====================================================
// Deep Link Handler Utilities
// =====================================================
// Parse and format challenge invite URLs for deep linking.
// Supports custom scheme: pickrivals://challenge/{inviteCode}

import * as Linking from 'expo-linking';

// =====================================================
// Constants
// =====================================================

/**
 * Invite code format from backend:
 * - 10 characters long
 * - Alphanumeric (A-Z, 2-9)
 * - Excludes ambiguous chars (0, O, I, 1)
 */
const INVITE_CODE_REGEX = /^[A-Z0-9]{10}$/;

// =====================================================
// Type Definitions
// =====================================================

export interface ParsedInviteUrl {
  inviteCode: string;
}

// =====================================================
// URL Parsing
// =====================================================

/**
 * Parse a deep link URL to extract challenge invite code
 *
 * Supported formats:
 * - pickrivals://challenge/ABC123XYZ0
 * - pickrivals://challenge?code=ABC123XYZ0
 *
 * @param url - The deep link URL to parse
 * @returns Parsed invite data or null if invalid
 *
 * @example
 * ```ts
 * const result = parseInviteUrl('pickrivals://challenge/ABC123XYZ0');
 * if (result) {
 *   console.log(result.inviteCode); // 'ABC123XYZ0'
 * }
 * ```
 */
export function parseInviteUrl(url: string): ParsedInviteUrl | null {
  try {
    const { hostname, path, queryParams } = Linking.parse(url);

    // Check if this is a challenge URL
    if (hostname !== 'challenge') {
      return null;
    }

    // Extract invite code from path (e.g., /ABC123XYZ0)
    if (path) {
      const inviteCode = path.replace(/^\//, '').toUpperCase();
      if (isValidInviteCode(inviteCode)) {
        return { inviteCode };
      }
    }

    // Fallback: check query params (e.g., ?code=ABC123XYZ0)
    if (queryParams?.code && typeof queryParams.code === 'string') {
      const inviteCode = queryParams.code.toUpperCase();
      if (isValidInviteCode(inviteCode)) {
        return { inviteCode };
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to parse invite URL:', error);
    return null;
  }
}

// =====================================================
// URL Formatting
// =====================================================

/**
 * Format an invite code into a deep link URL
 *
 * @param inviteCode - The 10-character invite code
 * @returns Formatted deep link URL
 *
 * @example
 * ```ts
 * const url = formatInviteUrl('ABC123XYZ0');
 * console.log(url); // 'pickrivals://challenge/ABC123XYZ0'
 * ```
 */
export function formatInviteUrl(inviteCode: string): string {
  return `pickrivals://challenge/${inviteCode.toUpperCase()}`;
}

// =====================================================
// Validation
// =====================================================

/**
 * Validate an invite code format
 *
 * Checks if the code matches backend format:
 * - Exactly 10 characters
 * - Only uppercase letters and numbers
 * - Excludes ambiguous characters (0, O, I, 1)
 *
 * @param code - The invite code to validate
 * @returns True if valid format, false otherwise
 *
 * @example
 * ```ts
 * isValidInviteCode('ABC123XYZ0'); // true
 * isValidInviteCode('abc123'); // false (too short)
 * isValidInviteCode('ABCDEFGHIJ1'); // false (contains 1)
 * ```
 */
export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_REGEX.test(code);
}

// =====================================================
// Share Message Formatting
// =====================================================

/**
 * Format a share message for challenge invites
 *
 * @param stakeAmount - Stake amount in Rival Coins
 * @param inviteUrl - The invite URL
 * @returns Formatted share message
 *
 * @example
 * ```ts
 * const message = formatShareMessage(5000, 'pickrivals://challenge/ABC123XYZ0');
 * // "I challenge you to a 5,000 RC match on PickRivals! Join here: pickrivals://challenge/ABC123XYZ0"
 * ```
 */
export function formatShareMessage(stakeAmount: number, inviteUrl: string): string {
  const formattedStake = stakeAmount.toLocaleString();
  return `I challenge you to a ${formattedStake} RC match on PickRivals! Join here: ${inviteUrl}`;
}
