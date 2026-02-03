// =====================================================
// Friends Service
// =====================================================
// API client for friends and friendship operations.
// All methods are typed and handle errors gracefully.

import { api } from './api';
import type {
  FriendsListResponse,
  FriendshipStatusResponse,
  FriendshipFilter,
} from '../types/friends.types';

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
  };
}

/**
 * Query parameters for friends list endpoint.
 */
interface GetFriendsParams {
  filter?: FriendshipFilter;
  page?: number;
  limit?: number;
}

/**
 * Friends API Service
 *
 * Provides type-safe methods for:
 * - Fetching friends with filters and pagination
 * - Sending/accepting/declining friend requests
 * - Removing friends
 * - Blocking/unblocking users
 * - Checking friendship status
 */
export const FriendsService = {
  /**
   * Get friends list with optional filters and pagination.
   * @param params - Filter and pagination parameters.
   * @returns List of friendships with pagination metadata.
   */
  async getFriends(
    params: GetFriendsParams = {}
  ): Promise<FriendsListResponse> {
    const { filter, page = 1, limit = 20 } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });

    if (filter) {
      queryParams.append('filter', filter);
    }

    const response = await api.get<ApiResponse<FriendsListResponse>>(
      `/friends?${queryParams.toString()}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch friends'
      );
    }

    return response.data.data;
  },

  /**
   * Get incoming friend requests (convenience wrapper).
   * @param page - Page number.
   * @param limit - Items per page.
   * @returns Incoming friend requests with pagination.
   */
  async getIncomingRequests(
    page = 1,
    limit = 20
  ): Promise<FriendsListResponse> {
    return this.getFriends({ filter: 'incoming', page, limit });
  },

  /**
   * Get outgoing friend requests (convenience wrapper).
   * @param page - Page number.
   * @param limit - Items per page.
   * @returns Outgoing friend requests with pagination.
   */
  async getOutgoingRequests(
    page = 1,
    limit = 20
  ): Promise<FriendsListResponse> {
    return this.getFriends({ filter: 'outgoing', page, limit });
  },

  /**
   * Get friendship status with a specific user.
   * @param userId - Target user ID.
   * @returns Friendship status and metadata.
   */
  async getFriendshipStatus(userId: string): Promise<FriendshipStatusResponse> {
    const response = await api.get<ApiResponse<FriendshipStatusResponse>>(
      `/friends/status/${userId}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch friendship status'
      );
    }

    return response.data.data;
  },

  /**
   * Send a friend request to a user.
   * @param userId - Target user ID.
   * @returns Created friendship data.
   */
  async sendRequest(userId: string): Promise<void> {
    const response = await api.post<ApiResponse<void>>(
      `/friends/request/${userId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to send friend request'
      );
    }
  },

  /**
   * Accept an incoming friend request.
   * @param friendshipId - Friendship ID to accept.
   * @returns Updated friendship data.
   */
  async acceptRequest(friendshipId: string): Promise<void> {
    const response = await api.post<ApiResponse<void>>(
      `/friends/accept/${friendshipId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to accept friend request'
      );
    }
  },

  /**
   * Decline an incoming friend request.
   * @param friendshipId - Friendship ID to decline.
   * @returns Updated friendship data.
   */
  async declineRequest(friendshipId: string): Promise<void> {
    const response = await api.post<ApiResponse<void>>(
      `/friends/decline/${friendshipId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to decline friend request'
      );
    }
  },

  /**
   * Remove a friend or cancel an outgoing request.
   * @param friendshipId - Friendship ID to remove.
   * @returns Success confirmation.
   */
  async removeFriend(friendshipId: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(
      `/friends/${friendshipId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to remove friend'
      );
    }
  },

  /**
   * Block a user.
   * @param userId - User ID to block.
   * @returns Success confirmation.
   */
  async blockUser(userId: string): Promise<void> {
    const response = await api.post<ApiResponse<void>>(
      `/friends/block/${userId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to block user'
      );
    }
  },

  /**
   * Unblock a user.
   * @param userId - User ID to unblock.
   * @returns Success confirmation.
   */
  async unblockUser(userId: string): Promise<void> {
    const response = await api.delete<ApiResponse<void>>(
      `/friends/block/${userId}`
    );

    if (!response.data.success) {
      throw new Error(
        response.data.error?.message || 'Failed to unblock user'
      );
    }
  },
};

export default FriendsService;
