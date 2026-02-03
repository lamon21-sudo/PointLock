// =====================================================
// Slip Service
// =====================================================
// API service for slip operations: create, lock, fetch.
// Handles the two-step flow: create draft → lock slip.

import { api } from './api';
import { CreateSlipPayload } from '../utils/slip-mapper';

// =====================================================
// Types
// =====================================================

/**
 * Pick response from API
 */
export interface ApiPickResponse {
  id: string;
  slipId: string;
  sportsEventId: string;
  pickType: string;
  selection: string;
  line: number | null;
  odds: number;
  oddsDecimal: number | null;
  isLive: boolean;
  propType: string | null;
  propPlayerId: string | null;
  propPlayerName: string | null;
  pointValue: number;
  status: string;
  resultValue: number | null;
  settledAt: string | null;
  createdAt: string;
  event: {
    id: string;
    sport: string;
    league: string;
    homeTeamName: string;
    homeTeamAbbr: string | null;
    awayTeamName: string;
    awayTeamAbbr: string | null;
    scheduledAt: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  };
}

/**
 * Full slip response from API
 */
export interface ApiSlipResponse {
  id: string;
  userId: string;
  name: string | null;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout: number;
  totalPicks: number;
  correctPicks: number;
  pointPotential: number;
  pointsEarned: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  settledAt: string | null;
  picks: ApiPickResponse[];
}

/**
 * Submission result
 */
export interface SlipSubmissionResult {
  success: boolean;
  slip?: ApiSlipResponse;
  error?: {
    code: string;
    message: string;
  };
}

// =====================================================
// Error Classes
// =====================================================

export class SlipServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'SlipServiceError';
  }
}

export class SlipValidationError extends SlipServiceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'SlipValidationError';
  }
}

export class SlipNotFoundError extends SlipServiceError {
  constructor(slipId: string) {
    super(`Slip ${slipId} not found`, 'SLIP_NOT_FOUND', 404);
    this.name = 'SlipNotFoundError';
  }
}

export class SlipLockError extends SlipServiceError {
  constructor(message: string) {
    super(message, 'SLIP_LOCK_ERROR', 400);
    this.name = 'SlipLockError';
  }
}

// =====================================================
// API Functions
// =====================================================

/**
 * Create a new slip (DRAFT status)
 */
export async function createSlip(payload: CreateSlipPayload): Promise<ApiSlipResponse> {
  try {
    const response = await api.post('/slips', payload);

    if (!response.data.success) {
      throw new SlipServiceError(
        response.data.error?.message || 'Failed to create slip',
        response.data.error?.code || 'CREATE_FAILED'
      );
    }

    return response.data.data;
  } catch (error: any) {
    // Re-throw our errors
    if (error instanceof SlipServiceError) {
      throw error;
    }

    // Handle axios errors
    if (error.response) {
      const { status, data } = error.response;
      throw new SlipServiceError(
        data?.error?.message || 'Failed to create slip',
        data?.error?.code || 'CREATE_FAILED',
        status
      );
    }

    // Network error
    throw new SlipServiceError(
      'Network error - please check your connection',
      'NETWORK_ERROR'
    );
  }
}

/**
 * Lock a slip (changes status from DRAFT to PENDING)
 */
export async function lockSlip(slipId: string): Promise<ApiSlipResponse> {
  try {
    const response = await api.post(`/slips/${slipId}/lock`);

    if (!response.data.success) {
      throw new SlipLockError(
        response.data.error?.message || 'Failed to lock slip'
      );
    }

    return response.data.data;
  } catch (error: any) {
    // Re-throw our errors
    if (error instanceof SlipServiceError) {
      throw error;
    }

    // Handle axios errors
    if (error.response) {
      const { status, data } = error.response;

      if (status === 404) {
        throw new SlipNotFoundError(slipId);
      }

      throw new SlipLockError(
        data?.error?.message || 'Failed to lock slip'
      );
    }

    // Network error
    throw new SlipServiceError(
      'Network error - please check your connection',
      'NETWORK_ERROR'
    );
  }
}

/**
 * Create and immediately lock a slip (atomic operation from UI perspective)
 * This is the main function used for slip submission.
 *
 * Flow:
 * 1. POST /slips → Creates slip in DRAFT status
 * 2. POST /slips/:id/lock → Locks slip to PENDING status
 *
 * If step 2 fails, the draft slip remains but is not locked.
 */
export async function createAndLockSlip(
  payload: CreateSlipPayload
): Promise<SlipSubmissionResult> {
  try {
    // Step 1: Create the slip
    const draftSlip = await createSlip(payload);

    // Step 2: Lock the slip
    const lockedSlip = await lockSlip(draftSlip.id);

    return {
      success: true,
      slip: lockedSlip,
    };
  } catch (error: any) {
    console.error('[SlipService] Submission failed:', error);

    return {
      success: false,
      error: {
        code: error.code || 'SUBMISSION_FAILED',
        message: error.message || 'Failed to submit slip',
      },
    };
  }
}

/**
 * Get a slip by ID
 */
export async function getSlipById(slipId: string): Promise<ApiSlipResponse> {
  try {
    const response = await api.get(`/slips/${slipId}`);

    if (!response.data.success) {
      throw new SlipNotFoundError(slipId);
    }

    return response.data.data;
  } catch (error: any) {
    if (error instanceof SlipServiceError) {
      throw error;
    }

    if (error.response?.status === 404) {
      throw new SlipNotFoundError(slipId);
    }

    throw new SlipServiceError(
      'Failed to fetch slip',
      'FETCH_FAILED',
      error.response?.status
    );
  }
}

/**
 * Get user's slips with pagination
 */
export async function getUserSlips(options?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  slips: ApiSlipResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  try {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));

    const response = await api.get(`/slips?${params.toString()}`);

    if (!response.data.success) {
      throw new SlipServiceError('Failed to fetch slips', 'FETCH_FAILED');
    }

    return {
      slips: response.data.data,
      pagination: response.data.meta.pagination,
    };
  } catch (error: any) {
    if (error instanceof SlipServiceError) {
      throw error;
    }

    throw new SlipServiceError(
      'Failed to fetch slips',
      'FETCH_FAILED',
      error.response?.status
    );
  }
}
