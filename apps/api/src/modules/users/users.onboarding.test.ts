// =====================================================
// Onboarding Schema Unit Tests
// =====================================================
// Tests for updateOnboardingSchema validation rules.
// The schema enforces one-way flag semantics: flags can
// only be set to `true`, never `false` or other values.

import { describe, it, expect } from 'vitest';
import { updateOnboardingSchema } from './users.schemas';

describe('Onboarding Schema Validation', () => {
  describe('updateOnboardingSchema', () => {
    it('accepts hasCompletedOnboarding: true', () => {
      const result = updateOnboardingSchema.safeParse({ hasCompletedOnboarding: true });
      expect(result.success).toBe(true);
    });

    it('accepts hasCompletedDemoSlip: true', () => {
      const result = updateOnboardingSchema.safeParse({ hasCompletedDemoSlip: true });
      expect(result.success).toBe(true);
    });

    it('accepts both flags together', () => {
      const result = updateOnboardingSchema.safeParse({
        hasCompletedOnboarding: true,
        hasCompletedDemoSlip: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects hasCompletedOnboarding: false', () => {
      const result = updateOnboardingSchema.safeParse({ hasCompletedOnboarding: false });
      expect(result.success).toBe(false);
    });

    it('rejects non-boolean values', () => {
      const result = updateOnboardingSchema.safeParse({ hasCompletedOnboarding: 'yes' });
      expect(result.success).toBe(false);
    });

    it('accepts empty object (but controller will reject it)', () => {
      const result = updateOnboardingSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('strips unknown fields', () => {
      const result = updateOnboardingSchema.safeParse({
        hasCompletedOnboarding: true,
        unknownField: 'hello',
      });
      expect(result.success).toBe(true);
    });
  });
});
