// =====================================================
// useNotificationInbox Hook
// =====================================================
// React Query hooks for the notification inbox.
//
// Exports:
//   useNotificationInbox()          — infinite scroll query (page-based)
//   useMarkNotificationRead()       — mark single item read
//   useMarkAllNotificationsRead()   — mark all read
//   useUnreadNotificationCount()    — polling badge count
//   useDeleteNotification()         — delete single item
//
// Side-effect: All mutations sync the unread count in
// useNotificationStore so the Profile tab badge stays current.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getNotificationInbox,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  deleteNotification,
  type InboxResponse,
} from '../services/notification.service';
import { useNotificationStore } from '../stores/notification.store';
import type { NotificationInboxItemDTO } from '@pick-rivals/shared-types';

// ---- Query Keys ------------------------------------------

export const NOTIFICATION_INBOX_KEY = ['notification', 'inbox'] as const;
export const NOTIFICATION_UNREAD_KEY = ['notification', 'unread-count'] as const;

// ---- useNotificationInbox --------------------------------

/**
 * Infinite-scroll query for the notification inbox.
 *
 * Uses page-number-based pagination (page 1, 2, 3…).
 * Syncs the unread count into the global notification store
 * whenever the first page loads or refetches.
 *
 * @example
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
 *   useNotificationInbox();
 *
 * // Flatten pages into items:
 * const items = data?.pages.flatMap((p) => p.items) ?? [];
 * const unreadCount = data?.pages[0]?.total ?? 0;
 */
export function useNotificationInbox() {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  return useInfiniteQuery({
    queryKey: NOTIFICATION_INBOX_KEY,
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number | undefined) ?? 1;
      const result = await getNotificationInbox(page, 20);

      // Sync unread count on every first page fetch
      if (page === 1) {
        // The API doesn't return an unread count directly on the InboxResponse,
        // so we count it from the items on page 1.
        // (A dedicated /unread-count endpoint can be added in the future.)
        const unread = result.items.filter((i) => !i.isRead).length;
        setUnreadCount(unread);
      }

      return result;
    },
    initialPageParam: 1 as number,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage;
      return page < totalPages ? page + 1 : undefined;
    },
    staleTime: 1000 * 30, // 30 seconds — inbox should feel live
  });
}

// ---- useMarkNotificationRead -----------------------------

/**
 * Marks a single notification as read.
 *
 * Optimistically updates the item's `isRead` flag in the cache
 * and decrements the global unread count.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const decrementUnreadCount = useNotificationStore((s) => s.decrementUnreadCount);

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_INBOX_KEY });

      const previous = queryClient.getQueryData(NOTIFICATION_INBOX_KEY);

      // Optimistically flip isRead in the cached pages
      queryClient.setQueryData<{
        pages: InboxResponse[];
        pageParams: unknown[];
      }>(NOTIFICATION_INBOX_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item: NotificationInboxItemDTO) =>
              item.id === id ? { ...item, isRead: true } : item
            ),
          })),
        };
      });

      // Immediately update badge
      decrementUnreadCount();

      return { previous };
    },

    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATION_INBOX_KEY, context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY });
    },
  });
}

// ---- useMarkAllNotificationsRead -------------------------

/**
 * Marks every notification in the inbox as read.
 *
 * Optimistically sets all items to read and clears the badge.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const resetUnreadCount = useNotificationStore((s) => s.resetUnreadCount);

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_INBOX_KEY });

      const previous = queryClient.getQueryData(NOTIFICATION_INBOX_KEY);

      // Optimistically mark every cached item as read
      queryClient.setQueryData<{
        pages: InboxResponse[];
        pageParams: unknown[];
      }>(NOTIFICATION_INBOX_KEY, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item: NotificationInboxItemDTO) => ({
              ...item,
              isRead: true,
            })),
          })),
        };
      });

      resetUnreadCount();

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATION_INBOX_KEY, context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY });
    },
  });
}

// ---- useUnreadNotificationCount --------------------------

/**
 * Polls the unread notification count every minute and syncs it
 * into the global notification store for badge display.
 *
 * Mount this hook once near the app root (e.g., in the tab layout)
 * so the badge stays current without requiring the inbox to be open.
 */
export function useUnreadNotificationCount() {
  const { setUnreadCount } = useNotificationStore();

  return useQuery({
    queryKey: NOTIFICATION_UNREAD_KEY,
    queryFn: async () => {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
      return count;
    },
    refetchInterval: 60_000, // Refresh every minute
  });
}

// ---- useDeleteNotification -------------------------------

/**
 * Permanently deletes a single notification from the inbox.
 * Invalidates the inbox cache so the item disappears on the next render.
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY });
    },
  });
}

export type { NotificationInboxItemDTO, InboxResponse };
