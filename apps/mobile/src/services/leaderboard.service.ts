// =====================================================
// Leaderboard Service
// =====================================================
// API client for leaderboard operations.
// All methods are typed and handle errors gracefully.

import { api } from './api';
import type {
  PaginatedLeaderboardResponse,
  LeaderboardPeriod,
  LeaderboardPagination,
} from '../types/leaderboard.types';

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    pagination?: LeaderboardPagination;
  };
}

/**
 * Query parameters for leaderboard endpoints.
 */
interface LeaderboardQueryParams {
  page?: number;
  limit?: number;
}

/**
 * Leaderboard API Service
 *
 * Provides type-safe methods for:
 * - Fetching global all-time leaderboard
 * - Fetching current week leaderboard
 */
export const LeaderboardService = {
  /**
   * Get global all-time leaderboard.
   * @param params - Pagination parameters.
   * @returns Paginated leaderboard data.
   */
  async getGlobalLeaderboard(
    params: LeaderboardQueryParams = {}
  ): Promise<PaginatedLeaderboardResponse> {
    const { page = 1, limit = 20 } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await api.get<ApiResponse<PaginatedLeaderboardResponse>>(
      `/leaderboard?${queryParams.toString()}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch leaderboard'
      );
    }

    return response.data.data;
  },

  /**
   * Get current week leaderboard.
   * @param params - Pagination parameters.
   * @returns Paginated weekly leaderboard data.
   */
  async getWeeklyLeaderboard(
    params: LeaderboardQueryParams = {}
  ): Promise<PaginatedLeaderboardResponse> {
    const { page = 1, limit = 20 } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    const response = await api.get<ApiResponse<PaginatedLeaderboardResponse>>(
      `/leaderboard/weekly?${queryParams.toString()}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch weekly leaderboard'
      );
    }

    return response.data.data;
  },

  /**
   * Unified fetch method based on period.
   * @param period - 'all-time' or 'weekly'
   * @param params - Pagination parameters.
   * @returns Paginated leaderboard data.
   */
  async getLeaderboard(
    period: LeaderboardPeriod,
    params: LeaderboardQueryParams = {}
  ): Promise<PaginatedLeaderboardResponse> {
    return period === 'weekly'
      ? this.getWeeklyLeaderboard(params)
      : this.getGlobalLeaderboard(params);
  },
};

export default LeaderboardService;
