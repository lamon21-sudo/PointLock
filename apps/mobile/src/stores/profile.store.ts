// =====================================================
// Profile Store
// =====================================================
// Zustand store for user profile state management.
// Handles own profile, public profiles, and profile updates.

import { create } from 'zustand';
import { ProfileService } from '../services/profile.service';
import type { UserProfileResponse, UpdateUserInput } from '@pick-rivals/shared-types';
import { useOnboardingStore } from './onboarding.store';

// =====================================================
// Types
// =====================================================

interface ProfileState {
  // Own Profile
  myProfile: UserProfileResponse | null;
  isLoadingMyProfile: boolean;
  myProfileError: string | null;

  // Public Profile (viewing another user)
  viewedProfile: UserProfileResponse | null;
  viewedProfileId: string | null;
  isLoadingViewedProfile: boolean;
  viewedProfileError: string | null;

  // Update Profile
  isUpdatingProfile: boolean;
  updateError: string | null;

  // Actions
  fetchMyProfile: () => Promise<void>;
  fetchPublicProfile: (userId: string) => Promise<void>;
  updateProfile: (data: UpdateUserInput) => Promise<boolean>;
  clearViewedProfile: () => void;
  clearErrors: () => void;
  reset: () => void;
}

// =====================================================
// Initial State
// =====================================================

const initialState = {
  myProfile: null,
  isLoadingMyProfile: false,
  myProfileError: null,

  viewedProfile: null,
  viewedProfileId: null,
  isLoadingViewedProfile: false,
  viewedProfileError: null,

  isUpdatingProfile: false,
  updateError: null,
};

// =====================================================
// Store
// =====================================================

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...initialState,

  /**
   * Fetch the authenticated user's own profile.
   */
  fetchMyProfile: async () => {
    set({ isLoadingMyProfile: true, myProfileError: null });

    try {
      const profile = await ProfileService.getMyProfile();
      set({ myProfile: profile, isLoadingMyProfile: false });

      // Sync onboarding state from server profile so the store always
      // reflects the canonical server truth after a fresh load.
      const { initFromProfile } = useOnboardingStore.getState();
      initFromProfile(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch profile';
      set({ myProfileError: message, isLoadingMyProfile: false });
      console.error('Profile fetch error:', error);
    }
  },

  /**
   * Fetch a public profile by user ID.
   * @param userId - The user ID to fetch.
   */
  fetchPublicProfile: async (userId: string) => {
    // Clear previous profile when fetching new one
    set({
      isLoadingViewedProfile: true,
      viewedProfileError: null,
      viewedProfile: null,
      viewedProfileId: userId,
    });

    try {
      const profile = await ProfileService.getPublicProfile(userId);
      set({
        viewedProfile: profile,
        isLoadingViewedProfile: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'User not found';
      set({
        viewedProfileError: message,
        isLoadingViewedProfile: false,
      });
      console.error('Public profile fetch error:', error);
    }
  },

  /**
   * Update the authenticated user's profile.
   * @param data - Fields to update.
   * @returns true if update was successful.
   */
  updateProfile: async (data: UpdateUserInput): Promise<boolean> => {
    set({ isUpdatingProfile: true, updateError: null });

    try {
      const updatedProfile = await ProfileService.updateProfile(data);
      set({
        myProfile: updatedProfile,
        isUpdatingProfile: false,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      set({ updateError: message, isUpdatingProfile: false });
      console.error('Profile update error:', error);
      return false;
    }
  },

  /**
   * Clear the viewed public profile.
   * Call when navigating away from a public profile screen.
   */
  clearViewedProfile: () => {
    set({
      viewedProfile: null,
      viewedProfileId: null,
      viewedProfileError: null,
    });
  },

  /**
   * Clear all error states.
   */
  clearErrors: () => {
    set({
      myProfileError: null,
      viewedProfileError: null,
      updateError: null,
    });
  },

  /**
   * Reset store to initial state.
   * Call on logout.
   */
  reset: () => {
    set(initialState);
  },
}));

export default useProfileStore;
