// =====================================================
// Match Service
// =====================================================
// API service for match/challenge operations: create, join, fetch.
// Handles PVP match lifecycle management.

import { api } from './api';
import type {
  Match,
  MatchWithDetails,
  CreateMatchInput,
  JoinMatchInput,
} from '@pick-rivals/shared-types';
import type { ApiResponse } from '@pick-rivals/shared-types';

// =====================================================
// Match Service Class
// =====================================================

/**
 * Service for managing PVP matches (challenges)
 *
 * Features:
 * - Create new public or private challenges
 * - Join existing challenges
 * - Fetch user's match history
 * - Get match details by ID
 * - Get match by invite code
 */
export class MatchService {
  /**
   * Create a new PVP match (challenge)
   *
   * @param input - Match creation data
   * @returns Created match object
   * @throws Error if creation fails
   *
   * @example
   * ```ts
   * const match = await MatchService.createMatch({
   *   slipId: 'slip_123',
   *   stakeAmount: 5000,
   *   type: 'public'
   * });
   * ```
   */
  static async createMatch(input: CreateMatchInput): Promise<Match> {
    try {
      const response = await api.post<ApiResponse<Match>>('/matches', input);

      if (!response.data.success || !response.data.data) {
        const errorMessage = response.data.error?.message || 'Failed to create match';
        throw new Error(errorMessage);
      }

      return response.data.data;
    } catch (error: any) {
      // Handle specific error codes
      if (error.response?.data?.error?.code === 'WALLET_001') {
        throw new Error('Insufficient balance. Please add funds to your wallet.');
      }
      if (error.response?.data?.error?.code === 'SLIP_001') {
        throw new Error('Slip not found. Please create a new slip.');
      }
      if (error.response?.data?.error?.code === 'SLIP_002') {
        throw new Error('This slip is already used in another match.');
      }

      // Re-throw original error
      throw error;
    }
  }

  /**
   * Join an existing match by match ID
   *
   * @param matchId - ID of the match to join
   * @param input - Join data (slip ID)
   * @returns Updated match object
   * @throws Error if join fails
   *
   * @example
   * ```ts
   * const match = await MatchService.joinMatch('match_123', {
   *   slipId: 'slip_456'
   * });
   * ```
   */
  static async joinMatch(matchId: string, input: JoinMatchInput): Promise<Match> {
    try {
      const response = await api.post<ApiResponse<Match>>(
        `/matches/${matchId}/join`,
        input
      );

      if (!response.data.success || !response.data.data) {
        const errorMessage = response.data.error?.message || 'Failed to join match';
        throw new Error(errorMessage);
      }

      return response.data.data;
    } catch (error: any) {
      // Handle specific error codes
      if (error.response?.data?.error?.code === 'WALLET_001') {
        throw new Error('Insufficient balance. Please add funds to your wallet.');
      }
      if (error.response?.data?.error?.code === 'MATCH_001') {
        throw new Error('Match not found or no longer available.');
      }
      if (error.response?.data?.error?.code === 'MATCH_002') {
        throw new Error('This match already has an opponent.');
      }

      // Re-throw original error
      throw error;
    }
  }

  /**
   * Get match by invite code
   *
   * @param inviteCode - The invite code from share link
   * @returns Match details
   * @throws Error if match not found or expired
   *
   * @example
   * ```ts
   * const match = await MatchService.getMatchByInviteCode('ABC123XYZ');
   * ```
   */
  static async getMatchByInviteCode(inviteCode: string): Promise<MatchWithDetails> {
    try {
      const response = await api.get<ApiResponse<MatchWithDetails>>(
        `/matches/invite/${inviteCode}`
      );

      if (!response.data.success || !response.data.data) {
        const errorMessage = response.data.error?.message || 'Match not found';
        throw new Error(errorMessage);
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response?.data?.error?.code === 'MATCH_003') {
        throw new Error('This invite link has expired.');
      }

      throw error;
    }
  }

  /**
   * Get match by ID with full details
   *
   * @param matchId - ID of the match
   * @returns Match with full details
   * @throws Error if match not found
   *
   * @example
   * ```ts
   * const match = await MatchService.getMatchById('match_123');
   * console.log(match.creator.username);
   * ```
   */
  static async getMatchById(matchId: string): Promise<MatchWithDetails> {
    try {
      const response = await api.get<ApiResponse<MatchWithDetails>>(
        `/matches/${matchId}`
      );

      if (!response.data.success || !response.data.data) {
        const errorMessage = response.data.error?.message || 'Match not found';
        throw new Error(errorMessage);
      }

      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error('Match not found');
      }

      throw error;
    }
  }

  /**
   * Get user's match history
   *
   * @param page - Page number (default: 1)
   * @param limit - Results per page (default: 20)
   * @returns List of matches with pagination
   *
   * @example
   * ```ts
   * const { matches, pagination } = await MatchService.getUserMatches();
   * ```
   */
  static async getUserMatches(
    page: number = 1,
    limit: number = 20
  ): Promise<{ matches: MatchWithDetails[]; pagination: any }> {
    try {
      const response = await api.get<
        ApiResponse<{ matches: MatchWithDetails[]; pagination: any }>
      >('/matches', {
        params: { page, limit },
      });

      if (!response.data.success || !response.data.data) {
        throw new Error('Failed to fetch matches');
      }

      return response.data.data;
    } catch (error: any) {
      throw error;
    }
  }
}

export default MatchService;
