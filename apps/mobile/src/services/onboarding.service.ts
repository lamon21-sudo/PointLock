// =====================================================
// Onboarding Service
// =====================================================
// Thin API wrapper for PATCH /users/me/onboarding.
// Fires-and-forgets in most call sites — callers should
// catch and swallow errors so UI is never blocked by a
// failed sync.

import { api } from './api';

export const OnboardingService = {
  /**
   * Notify the server that the onboarding walkthrough is complete.
   * Safe to call multiple times (idempotent on the backend).
   */
  async markOnboardingComplete(): Promise<void> {
    await api.patch('/users/me/onboarding', { hasCompletedOnboarding: true });
  },

  /**
   * Notify the server that the demo slip tutorial is complete.
   * Safe to call multiple times (idempotent on the backend).
   */
  async markDemoSlipComplete(): Promise<void> {
    await api.patch('/users/me/onboarding', { hasCompletedDemoSlip: true });
  },
};

export default OnboardingService;
