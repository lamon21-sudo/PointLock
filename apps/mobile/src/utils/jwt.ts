// =====================================================
// JWT Utility — Client-side Token Expiry Check
// =====================================================
// Lightweight JWT payload decode for checking token expiry.
// No cryptographic verification — that's the server's job.
// Used by TokenRefreshService.ensureValidToken() to
// proactively refresh before services hit TOKEN_EXPIRED.

interface JwtPayload {
  exp?: number;
  sub?: string;
  email?: string;
  type?: string;
  iat?: number;
}

/**
 * Decode the payload segment of a JWT (no signature verification).
 * Returns null on any parse error (fail-safe: treat as expired).
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Base64url → base64 (with padding) → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check if a JWT access token is expired or will expire within `bufferSeconds`.
 *
 * Returns true (treat as expired) when:
 * - Token can't be decoded
 * - Token has no `exp` claim
 * - Token expires within `bufferSeconds` of now
 *
 * @param token       - Raw JWT string
 * @param bufferSeconds - Seconds before actual expiry to consider "expired" (default 60)
 */
export function isTokenExpired(token: string, bufferSeconds = 60): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true; // fail-safe

  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - nowSeconds <= bufferSeconds;
}
