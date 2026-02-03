// =====================================================
// useProfile Hook
// =====================================================
// Unified hook for profile data fetching and management.
// Supports both own profile and public profile viewing.

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { useProfileStore } from '../stores/profile.store';
import type { UserProfileResponse, UpdateUserInput } from '@pick-rivals/shared-types';
import { MOCK_USER_PROFILE } from '../types/profile.types';

// =====================================================
// Types
// =====================================================

interface UseProfileOptions {
  /** User ID to fetch. If omitted, fetches current user's profile. */
  userId?: string;
  /** Use mock data for UI development. */
  useMock?: boolean;
  /** Automatically fetch on mount. Default: true */
  autoFetch?: boolean;
}

interface UseProfileReturn {
  /** The profile data (own or viewed user) */
  profile: UserProfileResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether this is the current user's own profile */
  isOwnProfile: boolean;
  /** Refresh the profile data */
  refresh: () => Promise<void>;
  /** Update profile (only works for own profile) */
  updateProfile: (data: UpdateUserInput) => Promise<boolean>;
  /** Whether profile update is in progress */
  isUpdating: boolean;
  /** Error message from update attempt */
  updateError: string | null;
}

// =====================================================
// Hook
// =====================================================

/**
 * Hook for fetching and managing user profile data.
 *
 * @example
 * // Fetch own profile
 * const { profile, isLoading } = useProfile();
 *
 * @example
 * // Fetch another user's profile
 * const { profile, isLoading } = useProfile({ userId: 'some-id' });
 *
 * @example
 * // Use mock data for UI development
 * const { profile } = useProfile({ useMock: true });
 */
export function useProfile(options: UseProfileOptions = {}): UseProfileReturn {
  const { userId, useMock = false, autoFetch = true } = options;

  // Auth state
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  // Profile store state
  const myProfile = useProfileStore((state) => state.myProfile);
  const isLoadingMyProfile = useProfileStore((state) => state.isLoadingMyProfile);
  const myProfileError = useProfileStore((state) => state.myProfileError);

  const viewedProfile = useProfileStore((state) => state.viewedProfile);
  const isLoadingViewedProfile = useProfileStore((state) => state.isLoadingViewedProfile);
  const viewedProfileError = useProfileStore((state) => state.viewedProfileError);

  const isUpdatingProfile = useProfileStore((state) => state.isUpdatingProfile);
  const updateError = useProfileStore((state) => state.updateError);

  // Actions
  const fetchMyProfile = useProfileStore((state) => state.fetchMyProfile);
  const fetchPublicProfile = useProfileStore((state) => state.fetchPublicProfile);
  const storeUpdateProfile = useProfileStore((state) => state.updateProfile);

  // Determine if viewing own profile
  const isOwnProfile = !userId || (user?.id === userId);

  // Select appropriate data based on mode
  const profile = useMock
    ? MOCK_USER_PROFILE
    : isOwnProfile
      ? myProfile
      : viewedProfile;

  const isLoading = isOwnProfile ? isLoadingMyProfile : isLoadingViewedProfile;
  const error = isOwnProfile ? myProfileError : viewedProfileError;

  // Auto-fetch on mount
  useEffect(() => {
    if (!autoFetch || useMock) return;

    // Wait for auth to be initialized to prevent 401 race conditions
    if (!isInitialized) return;

    if (isOwnProfile) {
      // Only fetch own profile if authenticated
      if (isAuthenticated) {
        fetchMyProfile();
      }
    } else if (userId) {
      // Fetch public profile
      fetchPublicProfile(userId);
    }
  }, [
    userId,
    isOwnProfile,
    autoFetch,
    useMock,
    isInitialized,
    isAuthenticated,
    fetchMyProfile,
    fetchPublicProfile,
  ]);

  // Refresh handler
  const refresh = useCallback(async () => {
    if (useMock) return;

    if (isOwnProfile) {
      await fetchMyProfile();
    } else if (userId) {
      await fetchPublicProfile(userId);
    }
  }, [isOwnProfile, userId, useMock, fetchMyProfile, fetchPublicProfile]);

  // Update handler (only for own profile)
  const updateProfile = useCallback(
    async (data: UpdateUserInput): Promise<boolean> => {
      if (!isOwnProfile) {
        console.warn('Cannot update profile: not viewing own profile');
        return false;
      }
      return storeUpdateProfile(data);
    },
    [isOwnProfile, storeUpdateProfile]
  );

  return {
    profile,
    isLoading,
    error,
    isOwnProfile,
    refresh,
    updateProfile,
    isUpdating: isUpdatingProfile,
    updateError,
  };
}

export default useProfile;
