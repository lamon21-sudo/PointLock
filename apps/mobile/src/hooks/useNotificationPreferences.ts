// =====================================================
// useNotificationPreferences Hook
// =====================================================
// React Query hooks for reading and updating notification
// preferences.  Two exports:
//
//   useNotificationPreferences()       — query (GET)
//   useUpdateNotificationPreferences() — mutation (PUT)
//
// Types come from @pick-rivals/shared-types NotificationPreferenceDTO.
//
// Usage:
//   const { data, isLoading } = useNotificationPreferences();
//
//   const { mutate } = useUpdateNotificationPreferences();
//   mutate({ settlementEnabled: false });

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../services/notification.service';
import type { NotificationPreferenceDTO } from '@pick-rivals/shared-types';

// ---- Query Keys ------------------------------------------

export const NOTIFICATION_PREFERENCES_KEY = ['notification', 'preferences'] as const;

// ---- Defaults (used while API hasn't responded yet) ------

const DEFAULT_PREFERENCES: NotificationPreferenceDTO = {
  // Master toggle
  allNotificationsEnabled: true,
  // High Priority
  settlementEnabled: true,
  pvpChallengeEnabled: true,
  slipExpiringEnabled: true,
  // Game Updates
  gameReminderEnabled: true,
  socialEnabled: true,
  leaderboardEnabled: false,
  // Engagement
  dailyDigestEnabled: false,
  weeklyRecapEnabled: false,
  winStreakEnabled: true,
  inactivityEnabled: false,
  // Quiet Hours
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  // Digest Schedule
  digestTimeLocal: '08:00',
  recapDayOfWeek: 1, // Monday
};

// ---- useNotificationPreferences --------------------------

/**
 * Fetches the current user's notification preference settings.
 *
 * Returns the full NotificationPreferenceDTO.  Falls back to sensible
 * defaults so the screen is still usable without a live backend.
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: async () => {
      try {
        return await getNotificationPreferences();
      } catch {
        // Return defaults so the UI remains functional during development
        return DEFAULT_PREFERENCES;
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: DEFAULT_PREFERENCES,
  });
}

// ---- useUpdateNotificationPreferences --------------------

/**
 * Mutation for updating one or more notification preference fields.
 *
 * Performs optimistic updates so the Switch flips instantly,
 * then rolls back if the server returns an error.
 *
 * @example
 * const { mutate } = useUpdateNotificationPreferences();
 * mutate({ settlementEnabled: false });
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: Partial<NotificationPreferenceDTO>) =>
      updateNotificationPreferences(updates),

    // ---- Optimistic update --------------------------------
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY });

      const previous = queryClient.getQueryData<NotificationPreferenceDTO>(
        NOTIFICATION_PREFERENCES_KEY
      );

      queryClient.setQueryData<NotificationPreferenceDTO>(
        NOTIFICATION_PREFERENCES_KEY,
        (old) => (old ? { ...old, ...updates } : old)
      );

      return { previous };
    },

    // ---- Roll back on error --------------------------------
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, context.previous);
      }
    },

    // ---- Refetch to stay in sync --------------------------
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY });
    },
  });
}

export type { NotificationPreferenceDTO };
