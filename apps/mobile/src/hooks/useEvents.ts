import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { SportsEvent } from '@pick-rivals/shared-types';
import { useAuthStore } from '../stores/auth.store';

/**
 * Hook to fetch scheduled sports events
 *
 * Returns events with loading/refreshing states for use in slip building
 */
export function useEvents() {
  const isAuthInitialized = useAuthStore((state) => state.isInitialized);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['events', 'ALL'],
    queryFn: async () => {
      const response = await api.get('/events?status=SCHEDULED');
      return response.data;
    },
    enabled: isAuthInitialized,
    staleTime: 30000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 5000),
    gcTime: 5 * 60 * 1000,
  });

  const events: SportsEvent[] = data?.data || [];

  return {
    events,
    isLoading,
    isRefreshing: isRefetching,
    refresh: refetch,
  };
}
