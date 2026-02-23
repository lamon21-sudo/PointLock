// =====================================================
// Onboarding Store
// =====================================================
// Manages FTUE onboarding state: server-synced flags,
// local step progression, and feature flag gating.
//
// Persistence: only server-synced fields are written to
// AsyncStorage so UI state is never stale on restart.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeatureFlags, UserProfileResponse } from '@pick-rivals/shared-types';

// =====================================================
// Constants
// =====================================================

export const ONBOARDING_TOTAL_STEPS = 4;

const defaultFeatureFlags: FeatureFlags = {
  onboardingEnabled: true,
  demoSlipEnabled: true,
  bettingTooltipsEnabled: true,
};

// =====================================================
// Types
// =====================================================

interface OnboardingState {
  // ---- Server-synced state ----
  hasCompletedOnboarding: boolean;
  hasCompletedDemoSlip: boolean;
  featureFlags: FeatureFlags;

  // ---- Local UI state (not persisted) ----
  currentStep: number;
  isOnboardingVisible: boolean;

  // ---- Actions ----
  /** Called after profile fetch to hydrate from server truth */
  initFromProfile: (profile: UserProfileResponse) => void;
  showOnboarding: () => void;
  hideOnboarding: () => void;
  nextStep: () => void;
  prevStep: () => void;
  /** Mark walkthrough complete and hide overlay */
  completeOnboarding: () => void;
  /** Skip walkthrough — treated identically to complete for server sync */
  skipOnboarding: () => void;
  /** Mark demo slip as complete */
  completeDemoSlip: () => void;
  /** Full reset (logout / dev tools) */
  reset: () => void;
}

// =====================================================
// Store
// =====================================================

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Server-synced defaults
      hasCompletedOnboarding: false,
      hasCompletedDemoSlip: false,
      featureFlags: defaultFeatureFlags,

      // Local UI defaults
      currentStep: 0,
      isOnboardingVisible: false,

      // ---- Actions ----

      initFromProfile: (profile) => {
        set({
          hasCompletedOnboarding: profile.hasCompletedOnboarding,
          hasCompletedDemoSlip: profile.hasCompletedDemoSlip,
          featureFlags: profile.featureFlags,
        });
      },

      showOnboarding: () => {
        set({ isOnboardingVisible: true, currentStep: 0 });
      },

      hideOnboarding: () => {
        set({ isOnboardingVisible: false, currentStep: 0 });
      },

      nextStep: () => {
        const { currentStep } = get();
        if (currentStep < ONBOARDING_TOTAL_STEPS - 1) {
          set({ currentStep: currentStep + 1 });
        }
      },

      prevStep: () => {
        const { currentStep } = get();
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 });
        }
      },

      completeOnboarding: () => {
        set({
          hasCompletedOnboarding: true,
          isOnboardingVisible: false,
          currentStep: 0,
        });
      },

      skipOnboarding: () => {
        set({
          hasCompletedOnboarding: true,
          isOnboardingVisible: false,
          currentStep: 0,
        });
      },

      completeDemoSlip: () => {
        set({ hasCompletedDemoSlip: true });
      },

      reset: () => {
        set({
          hasCompletedOnboarding: false,
          hasCompletedDemoSlip: false,
          featureFlags: defaultFeatureFlags,
          currentStep: 0,
          isOnboardingVisible: false,
        });
      },
    }),
    {
      name: 'onboarding-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist server-synced fields — never UI state
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasCompletedDemoSlip: state.hasCompletedDemoSlip,
        featureFlags: state.featureFlags,
      }),
    }
  )
);

export default useOnboardingStore;
