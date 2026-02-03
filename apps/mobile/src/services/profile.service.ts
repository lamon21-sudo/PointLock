// =====================================================
// Profile Service
// =====================================================
// API client for user profile operations.
// All methods are typed and handle errors gracefully.

import { api } from './api';
import type { UserProfileResponse, UpdateUserInput } from '@pick-rivals/shared-types';

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
 * Profile API Service
 *
 * Provides type-safe methods for:
 * - Fetching own profile
 * - Fetching public profiles
 * - Updating profile
 */
export const ProfileService = {
  /**
   * Get current authenticated user's profile.
   * @returns User profile with stats.
   */
  async getMyProfile(): Promise<UserProfileResponse> {
    const response = await api.get<ApiResponse<{ user: UserProfileResponse }>>(
      '/users/me'
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch profile'
      );
    }

    return response.data.data.user;
  },

  /**
   * Get a user's public profile by ID.
   * @param userId - The user ID to fetch.
   * @returns Public user profile with stats.
   */
  async getPublicProfile(userId: string): Promise<UserProfileResponse> {
    const response = await api.get<ApiResponse<{ user: UserProfileResponse }>>(
      `/users/${userId}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'User not found'
      );
    }

    return response.data.data.user;
  },

  /**
   * Update current user's profile.
   * @param data - Fields to update (displayName, avatarUrl).
   * @returns Updated user profile.
   */
  async updateProfile(data: UpdateUserInput): Promise<UserProfileResponse> {
    const response = await api.patch<ApiResponse<{ user: UserProfileResponse }>>(
      '/users/me',
      data
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to update profile'
      );
    }

    return response.data.data.user;
  },
};

export default ProfileService;
