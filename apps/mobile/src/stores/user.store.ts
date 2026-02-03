// =====================================================
// User Store
// =====================================================
// Zustand store for tracking user profile data, particularly tier information.

import { create } from 'zustand';

// =====================================================
// Types
// =====================================================

interface UserState {
  /** User's current tier (0=FREE, 1=STANDARD, 2=PREMIUM, 3=ELITE) */
  currentTier: number;
  /** Total coins earned lifetime (for tier calculation) */
  totalCoinsEarned: number;
  /** Whether user data has been loaded */
  isLoaded: boolean;

  // =====================================================
  // Actions
  // =====================================================

  /**
   * Set the user's tier and coin data (typically from profile API)
   */
  setUserTierData: (tier: number, totalCoinsEarned: number) => void;

  /**
   * Clear user data (on logout)
   */
  clearUserData: () => void;
}

// =====================================================
// Store Implementation
// =====================================================

export const useUserStore = create<UserState>((set) => ({
  // Initial state - defaults to FREE tier
  currentTier: 0,
  totalCoinsEarned: 0,
  isLoaded: false,

  // Actions
  setUserTierData: (tier: number, totalCoinsEarned: number) => {
    set({
      currentTier: tier,
      totalCoinsEarned,
      isLoaded: true,
    });
  },

  clearUserData: () => {
    set({
      currentTier: 0,
      totalCoinsEarned: 0,
      isLoaded: false,
    });
  },
}));

// =====================================================
// Convenience Hooks
// =====================================================

/**
 * Get the user's current tier.
 * Returns 0 (FREE) if not loaded yet.
 */
export function useUserTier(): number {
  return useUserStore((state) => state.currentTier);
}

/**
 * Get whether user tier data has been loaded.
 */
export function useUserTierLoaded(): boolean {
  return useUserStore((state) => state.isLoaded);
}

/**
 * Get the user's total coins earned (lifetime).
 */
export function useUserCoinsEarned(): number {
  return useUserStore((state) => state.totalCoinsEarned);
}

export default useUserStore;
