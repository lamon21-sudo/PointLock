// =====================================================
// Slip Builder Store
// =====================================================
// Zustand store for managing the local slip builder state.
// Persists draft picks to AsyncStorage for recovery on app restart.

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DraftPick,
  AddPickInput,
  SLIP_BUILDER_STORAGE_KEY,
  SLIP_MAX_PICKS,
  validateAddPick,
  calculateSlipPotential,
  createDraftPick,
} from '../types/slip.types';
import { MIN_SLIP_SPEND } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

interface SlipState {
  /** Current draft picks in the slip builder */
  picks: DraftPick[];
  /** Whether the store has been hydrated from AsyncStorage */
  _hasHydrated: boolean;
  /** Version counter for optimistic locking - prevents race conditions */
  _version: number;
  /** Last validation error (cleared on next successful operation) */
  lastError: string | null;
  /** Processing lock to prevent concurrent mutations */
  _isProcessing: boolean;

  // =====================================================
  // Submission State
  // =====================================================
  /** Whether a slip submission is in progress */
  isSubmitting: boolean;
  /** ID of the last successfully submitted slip */
  submittedSlipId: string | null;
  /** Error from the last submission attempt */
  submitError: string | null;

  // =====================================================
  // Actions
  // =====================================================

  /**
   * Add a pick to the slip with atomic validation.
   * Uses version control to prevent race conditions.
   * @returns Error message if validation fails, undefined on success.
   */
  addPick: (input: AddPickInput) => string | undefined;

  /**
   * Atomic swap operation: removes conflicting pick and adds new one.
   * Prevents race condition between remove and add.
   * @param input The new pick to add
   * @param removePickId Optional ID of pick to remove first (for swap)
   * @returns Error message if validation fails, undefined on success.
   */
  swapOrAddPick: (input: AddPickInput, removePickId?: string) => string | undefined;

  /**
   * Remove a pick from the slip by ID.
   */
  removePick: (pickId: string) => void;

  /**
   * Clear all picks from the slip.
   */
  clearSlip: () => void;

  /**
   * Check if a specific pick exists in the slip.
   */
  hasPick: (sportsEventId: string, pickType: string, selection: string) => boolean;

  /**
   * Get the number of picks currently in the slip.
   */
  getPickCount: () => number;

  /**
   * Check if the slip can accept more picks.
   */
  canAddPick: () => boolean;

  /**
   * Clear the last error message.
   */
  clearError: () => void;

  /**
   * Mark hydration as complete (used internally by persist middleware).
   */
  setHasHydrated: (state: boolean) => void;

  // =====================================================
  // Submission Actions
  // =====================================================

  /**
   * Set submission in progress state (prevents double-submit)
   */
  setSubmitting: (isSubmitting: boolean) => void;

  /**
   * Set successful submission result
   */
  setSubmissionSuccess: (slipId: string) => void;

  /**
   * Set submission error
   */
  setSubmissionError: (error: string) => void;

  /**
   * Clear submission state (for retry or new slip)
   */
  clearSubmissionState: () => void;
}

// =====================================================
// Selectors (Derived State)
// =====================================================

/**
 * Calculate total point potential for the current slip.
 * Use this selector in components: useSlipStore(selectPointPotential)
 */
export const selectPointPotential = (state: SlipState): number => {
  return calculateSlipPotential(state.picks);
};

/**
 * Check if the slip is empty.
 */
export const selectIsSlipEmpty = (state: SlipState): boolean => {
  return state.picks.length === 0;
};

/**
 * Check if the slip has reached max picks.
 */
export const selectIsSlipFull = (state: SlipState): boolean => {
  return state.picks.length >= SLIP_MAX_PICKS;
};

/**
 * Get picks grouped by event for display.
 */
export const selectPicksByEvent = (state: SlipState): Map<string, DraftPick[]> => {
  const grouped = new Map<string, DraftPick[]>();

  for (const pick of state.picks) {
    const existing = grouped.get(pick.sportsEventId) || [];
    existing.push(pick);
    grouped.set(pick.sportsEventId, existing);
  }

  return grouped;
};

/**
 * Get picks count for status display.
 */
export const selectPicksCount = (state: SlipState): number => {
  return state.picks.length;
};

/**
 * Check hydration status - important for preventing UI flash on load.
 */
export const selectHasHydrated = (state: SlipState): boolean => {
  return state._hasHydrated;
};

// =====================================================
// Coin Cost Selectors
// =====================================================

/**
 * Calculate total coin cost for the current slip.
 * Handles missing/invalid coinCost values gracefully.
 */
export const selectTotalCoinCost = (state: SlipState): number => {
  return state.picks.reduce((sum, pick) => sum + Math.max(0, pick.coinCost ?? 0), 0);
};

/**
 * Get minimum coin spend required based on pick count.
 * - 0-1 picks: no minimum
 * - 2+ picks: scales with count, caps at 8
 */
export const selectMinCoinSpend = (state: SlipState): number => {
  const count = state.picks.length;
  if (count < 2) return 0;
  return MIN_SLIP_SPEND[Math.min(count, 8)] ?? 260;
};

/**
 * Check if total coin cost meets minimum spend requirement.
 */
export const selectCoinSpendMet = (state: SlipState): boolean => {
  return selectTotalCoinCost(state) >= selectMinCoinSpend(state);
};

/**
 * Calculate shortfall between total cost and minimum spend.
 * Returns 0 if minimum is met.
 */
export const selectCoinSpendShortfall = (state: SlipState): number => {
  const total = selectTotalCoinCost(state);
  const min = selectMinCoinSpend(state);
  return Math.max(0, min - total);
};

// =====================================================
// AsyncStorage Adapter
// =====================================================

/**
 * Custom storage adapter for Zustand persist middleware.
 * Wraps AsyncStorage with proper async handling.
 */
const asyncStorageAdapter: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value;
    } catch (error) {
      console.error('[SlipStore] Failed to read from AsyncStorage:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.error('[SlipStore] Failed to write to AsyncStorage:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.error('[SlipStore] Failed to remove from AsyncStorage:', error);
    }
  },
};

// =====================================================
// Store Implementation
// =====================================================

export const useSlipStore = create<SlipState>()(
  persist(
    (set, get) => ({
      // Initial state
      picks: [],
      _hasHydrated: false,
      _version: 0,
      lastError: null,
      _isProcessing: false,
      // Submission state
      isSubmitting: false,
      submittedSlipId: null,
      submitError: null,

      // =====================================================
      // Actions
      // =====================================================

      /**
       * Add a pick with atomic validation inside set().
       * This prevents race conditions by validating against current state.
       */
      addPick: (input: AddPickInput): string | undefined => {
        // Check processing lock
        if (get()._isProcessing) {
          return 'Please wait, processing previous selection';
        }

        // Capture version before operation
        const startVersion = get()._version;

        // Set processing lock
        set({ _isProcessing: true });

        try {
          // Perform atomic validation and update
          let validationError: string | undefined;

          set((state) => {
            // Version check - abort if state changed
            if (state._version !== startVersion) {
              validationError = 'Selection conflict, please try again';
              return { ...state, _isProcessing: false };
            }

            // Validate against CURRENT state (inside set)
            const error = validateAddPick(state.picks, input);
            if (error) {
              validationError = error;
              return { ...state, lastError: error, _isProcessing: false };
            }

            // Create and add the pick
            const newPick = createDraftPick(input);

            return {
              picks: [...state.picks, newPick],
              _version: state._version + 1,
              lastError: null,
              _isProcessing: false,
            };
          });

          return validationError;
        } catch (error) {
          set({ _isProcessing: false });
          return 'Failed to add pick';
        }
      },

      /**
       * Atomic swap: remove conflicting pick and add new one in single operation.
       * Prevents race condition between separate remove + add calls.
       */
      swapOrAddPick: (input: AddPickInput, removePickId?: string): string | undefined => {
        // Check processing lock
        if (get()._isProcessing) {
          return 'Please wait, processing previous selection';
        }

        const startVersion = get()._version;
        set({ _isProcessing: true });

        try {
          let validationError: string | undefined;

          set((state) => {
            // Version check
            if (state._version !== startVersion) {
              validationError = 'Selection conflict, please try again';
              return { ...state, _isProcessing: false };
            }

            // First, compute picks after potential removal
            const picksAfterRemoval = removePickId
              ? state.picks.filter((p) => p.id !== removePickId)
              : state.picks;

            // Validate against state AFTER removal
            const error = validateAddPick(picksAfterRemoval, input);
            if (error) {
              validationError = error;
              return { ...state, lastError: error, _isProcessing: false };
            }

            // Create and add the new pick
            const newPick = createDraftPick(input);

            return {
              picks: [...picksAfterRemoval, newPick],
              _version: state._version + 1,
              lastError: null,
              _isProcessing: false,
            };
          });

          return validationError;
        } catch (error) {
          set({ _isProcessing: false });
          return 'Failed to swap pick';
        }
      },

      removePick: (pickId: string): void => {
        set((state) => ({
          picks: state.picks.filter((pick) => pick.id !== pickId),
          _version: state._version + 1,
        }));
      },

      clearSlip: (): void => {
        set((state) => ({
          picks: [],
          _version: state._version + 1,
          lastError: null,
        }));
      },

      hasPick: (sportsEventId: string, pickType: string, selection: string): boolean => {
        const { picks } = get();
        return picks.some(
          (pick) =>
            pick.sportsEventId === sportsEventId &&
            pick.pickType === pickType &&
            pick.selection === selection
        );
      },

      getPickCount: (): number => {
        return get().picks.length;
      },

      canAddPick: (): boolean => {
        return get().picks.length < SLIP_MAX_PICKS;
      },

      clearError: (): void => {
        set({ lastError: null });
      },

      setHasHydrated: (state: boolean): void => {
        set({ _hasHydrated: state });
      },

      // =====================================================
      // Submission Actions
      // =====================================================

      setSubmitting: (isSubmitting: boolean): void => {
        set({ isSubmitting, submitError: null });
      },

      setSubmissionSuccess: (slipId: string): void => {
        set({
          isSubmitting: false,
          submittedSlipId: slipId,
          submitError: null,
          picks: [], // Clear picks after successful submission
          _version: get()._version + 1,
        });
      },

      setSubmissionError: (error: string): void => {
        set({
          isSubmitting: false,
          submitError: error,
        });
      },

      clearSubmissionState: (): void => {
        set({
          isSubmitting: false,
          submittedSlipId: null,
          submitError: null,
        });
      },
    }),
    {
      name: SLIP_BUILDER_STORAGE_KEY,
      storage: createJSONStorage(() => asyncStorageAdapter),

      // Only persist picks, not hydration state
      partialize: (state) => ({
        picks: state.picks,
      }),

      // Handle hydration lifecycle
      onRehydrateStorage: () => (state) => {
        // Called when hydration is complete
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// =====================================================
// Hook for hydration-aware components
// =====================================================

/**
 * Hook to wait for store hydration before rendering.
 * Use this in components that depend on persisted state.
 *
 * @example
 * ```tsx
 * function BetSlip() {
 *   const isHydrated = useSlipStoreHydration();
 *   const picks = useSlipStore((s) => s.picks);
 *
 *   if (!isHydrated) {
 *     return <SlipSkeleton />;
 *   }
 *
 *   return <SlipContent picks={picks} />;
 * }
 * ```
 */
export function useSlipStoreHydration(): boolean {
  return useSlipStore(selectHasHydrated);
}

// =====================================================
// Convenience Hooks
// =====================================================

/**
 * Hook to get current point potential.
 */
export function usePointPotential(): number {
  return useSlipStore(selectPointPotential);
}

/**
 * Hook to get picks count.
 */
export function usePicksCount(): number {
  return useSlipStore(selectPicksCount);
}

/**
 * Hook to check if slip is empty.
 */
export function useIsSlipEmpty(): boolean {
  return useSlipStore(selectIsSlipEmpty);
}

/**
 * Hook to check if slip is full.
 */
export function useIsSlipFull(): boolean {
  return useSlipStore(selectIsSlipFull);
}

// =====================================================
// Coin Cost Convenience Hooks
// =====================================================

/**
 * Hook to get total coin cost of current slip.
 */
export function useTotalCoinCost(): number {
  return useSlipStore(selectTotalCoinCost);
}

/**
 * Hook to get minimum coin spend required.
 */
export function useMinCoinSpend(): number {
  return useSlipStore(selectMinCoinSpend);
}

/**
 * Hook to check if minimum spend is met.
 */
export function useCoinSpendMet(): boolean {
  return useSlipStore(selectCoinSpendMet);
}

/**
 * Hook to get shortfall between total and minimum spend.
 */
export function useCoinSpendShortfall(): number {
  return useSlipStore(selectCoinSpendShortfall);
}

export default useSlipStore;
