// =====================================================
// API Types - Request/Response Contracts
// =====================================================

// Standard API response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ResponseMeta {
  timestamp: string;
  requestId: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Pagination request
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  tokens: AuthTokens;
  wallet: {
    totalBalance: number;
    paidBalance: number;
    bonusBalance: number;
  };
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Error codes
export const ERROR_CODES = {
  // Auth errors
  INVALID_CREDENTIALS: 'AUTH_001',
  TOKEN_EXPIRED: 'AUTH_002',
  TOKEN_INVALID: 'AUTH_003',
  USER_NOT_FOUND: 'AUTH_004',
  EMAIL_ALREADY_EXISTS: 'AUTH_005',
  USERNAME_ALREADY_EXISTS: 'AUTH_006',

  // Wallet errors
  INSUFFICIENT_BALANCE: 'WALLET_001',
  TRANSACTION_FAILED: 'WALLET_002',
  ALLOWANCE_ALREADY_CLAIMED: 'WALLET_003',

  // Match errors
  MATCH_NOT_FOUND: 'MATCH_001',
  MATCH_ALREADY_FULL: 'MATCH_002',
  MATCH_EXPIRED: 'MATCH_003',
  CANNOT_CHALLENGE_SELF: 'MATCH_004',
  INVALID_STAKE_AMOUNT: 'MATCH_005',

  // Slip errors
  SLIP_NOT_FOUND: 'SLIP_001',
  SLIP_ALREADY_LOCKED: 'SLIP_002',
  INVALID_PICK_COUNT: 'SLIP_003',
  EVENT_ALREADY_STARTED: 'SLIP_004',
  MIN_SPEND_NOT_MET: 'SLIP_005',
  TIER_LOCKED: 'SLIP_006',

  // Event errors
  EVENT_NOT_FOUND: 'EVENT_001',

  // Sports Data errors
  SPORTS_DATA_UNAVAILABLE: 'SPORTS_001',
  SPORTS_DATA_RATE_LIMITED: 'SPORTS_002',
  SPORTS_DATA_INVALID_RESPONSE: 'SPORTS_003',
  SPORTS_DATA_PROVIDER_ERROR: 'SPORTS_004',

  // Generic errors
  VALIDATION_ERROR: 'VALIDATION_001',
  INTERNAL_ERROR: 'INTERNAL_001',
  RATE_LIMITED: 'RATE_001',
  FORBIDDEN: 'FORBIDDEN_001',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
