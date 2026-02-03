// =====================================================
// Slip Revalidation Hook
// =====================================================
// Revalidates slip picks when coming back online.
// Fetches current odds from server and updates stale picks.

import { useCallback } from 'react';
import { useOnReconnect } from './useNetworkStatus';
import { useSlipStore, selectHasStalePicks } from '../stores/slip.store';
import { api } from '../services/api';

// =====================================================
// Types
// =====================================================

interface ValidatePickInput {
  sportsEventId: string;
  pickType: string;
  selection: string;
  line: number | null;
  currentOdds: number;
}

interface ValidatedPick {
  sportsEventId: string;
  pickType: string;
  selection: string;
  currentOdds: number;
  oddsChanged: boolean;
  isValid: boolean;
  reason?: string;
}

interface ValidationResponse {
  picks: ValidatedPick[];
}

// =====================================================
// Hook
// =====================================================

/**
 * Hook that revalidates slip picks when device comes back online.
 * Automatically fetches current odds and updates any stale picks.
 *
 * @example
 * ```tsx
 * function SlipScreen() {
 *   // Auto-revalidates picks on reconnect
 *   useSlipRevalidation();
 *
 *   // ... rest of component
 * }
 * ```
 */
export function useSlipRevalidation(): void {
  const picks = useSlipStore((state) => state.picks);
  const refreshPickOdds = useSlipStore((state) => state.refreshPickOdds);
  const setOffline = useSlipStore((state) => state.setOffline);

  const revalidatePicks = useCallback(async () => {
    if (picks.length === 0) {
      return;
    }

    if (__DEV__) {
      console.log('[SlipRevalidation] Revalidating picks after reconnect');
    }

    // Mark as online
    setOffline(false);

    try {
      // Prepare validation request
      const picksToValidate: ValidatePickInput[] = picks.map((pick) => ({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        line: pick.line,
        currentOdds: pick.odds,
      }));

      // Call validation endpoint
      const response = await api.post<{ data: ValidationResponse }>(
        '/slips/validate-draft',
        { picks: picksToValidate }
      );

      const validatedPicks = response.data.data.picks;

      // Find picks with changed odds
      const updates = validatedPicks
        .filter((vp) => vp.oddsChanged && vp.isValid)
        .map((vp) => {
          const existingPick = picks.find(
            (p) =>
              p.sportsEventId === vp.sportsEventId &&
              p.pickType === vp.pickType &&
              p.selection === vp.selection
          );

          return {
            pickId: existingPick?.id || '',
            odds: vp.currentOdds,
            oddsUpdatedAt: new Date().toISOString(),
          };
        })
        .filter((u) => u.pickId);

      if (updates.length > 0) {
        refreshPickOdds(updates);
        if (__DEV__) {
          console.log(`[SlipRevalidation] Updated ${updates.length} picks with fresh odds`);
        }
      } else {
        if (__DEV__) {
          console.log('[SlipRevalidation] All picks have current odds');
        }
      }

      // Log any invalid picks
      const invalidPicks = validatedPicks.filter((vp) => !vp.isValid);
      if (invalidPicks.length > 0 && __DEV__) {
        console.warn('[SlipRevalidation] Invalid picks detected:', invalidPicks);
      }
    } catch (error) {
      // Non-critical - log but don't throw
      // User can still submit, server will validate
      console.warn('[SlipRevalidation] Failed to revalidate picks:', error);
    }
  }, [picks, refreshPickOdds, setOffline]);

  // Trigger revalidation when coming back online
  useOnReconnect(revalidatePicks);
}

/**
 * Hook to manually trigger slip revalidation.
 * Use when user explicitly requests a refresh.
 *
 * @returns Function to trigger revalidation
 */
export function useManualRevalidation(): () => Promise<void> {
  const picks = useSlipStore((state) => state.picks);
  const refreshPickOdds = useSlipStore((state) => state.refreshPickOdds);

  return useCallback(async () => {
    if (picks.length === 0) {
      return;
    }

    if (__DEV__) {
      console.log('[SlipRevalidation] Manual revalidation triggered');
    }

    try {
      const picksToValidate = picks.map((pick) => ({
        sportsEventId: pick.sportsEventId,
        pickType: pick.pickType,
        selection: pick.selection,
        line: pick.line,
        currentOdds: pick.odds,
      }));

      const response = await api.post<{ data: ValidationResponse }>(
        '/slips/validate-draft',
        { picks: picksToValidate }
      );

      const validatedPicks = response.data.data.picks;

      const updates = validatedPicks
        .filter((vp) => vp.isValid)
        .map((vp) => {
          const existingPick = picks.find(
            (p) =>
              p.sportsEventId === vp.sportsEventId &&
              p.pickType === vp.pickType &&
              p.selection === vp.selection
          );

          return {
            pickId: existingPick?.id || '',
            odds: vp.currentOdds,
            oddsUpdatedAt: new Date().toISOString(),
          };
        })
        .filter((u) => u.pickId);

      if (updates.length > 0) {
        refreshPickOdds(updates);
      }
    } catch (error) {
      console.warn('[SlipRevalidation] Manual revalidation failed:', error);
      throw error;
    }
  }, [picks, refreshPickOdds]);
}

export default useSlipRevalidation;
