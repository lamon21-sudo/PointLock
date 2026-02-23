// =====================================================
// Notification Store (Zustand)
// =====================================================
// Zustand store for notification state.
//
// Responsibilities:
//   - Track unread notification count (drives the tab badge)
//   - Provide imperative actions for increment / decrement / reset
//
// The inbox data itself lives in React Query (useNotificationInbox).
// This store is intentionally thin — only the badge count needs to
// be globally accessible outside the inbox screen.

import { create } from 'zustand';

// ---- State shape -----------------------------------------

interface NotificationState {
  /** Number of unread notifications — drives the Profile tab badge */
  unreadCount: number;

  // ---- Actions ----
  /** Replace the unread count (use after fetching inbox or polling) */
  setUnreadCount: (count: number) => void;
  /** Decrement by one (after a single item is read) */
  decrementUnreadCount: () => void;
  /** Increment by one (after a new notification arrives via socket) */
  incrementUnreadCount: () => void;
  /** Reset to zero (after mark-all-read) */
  resetUnreadCount: () => void;
}

// ---- Store -----------------------------------------------

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,

  setUnreadCount: (count) =>
    set({ unreadCount: Math.max(0, count) }),

  decrementUnreadCount: () =>
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),

  incrementUnreadCount: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),

  resetUnreadCount: () => set({ unreadCount: 0 }),
}));

export default useNotificationStore;
