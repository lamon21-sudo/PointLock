// =====================================================
// Notification API Service
// =====================================================
// API client for the notifications resource.
// Covers device token registration, user preferences,
// inbox CRUD, and unread-count polling.
//
// Endpoints (relative to /notifications):
//   GET  /preferences             — fetch preferences
//   PUT  /preferences             — update preferences
//   GET  /inbox                   — inbox (page-based)
//   POST /inbox/:id/read          — mark single read
//   POST /inbox/read-all          — mark all read
//   GET  /inbox/unread-count      — unread badge count
//   DELETE /inbox/:id             — delete item
//   POST /device-token            — register push token

import api from './api';
import type {
  NotificationPreferenceDTO,
  NotificationInboxItemDTO,
} from '@pick-rivals/shared-types';

// =====================================================
// Preferences
// =====================================================

/**
 * Fetch the authenticated user's notification preferences.
 */
export async function getNotificationPreferences(): Promise<NotificationPreferenceDTO> {
  const response = await api.get('/notifications/preferences');
  return response.data.data;
}

/**
 * Partially update the authenticated user's notification preferences.
 * Returns the full updated preference object.
 */
export async function updateNotificationPreferences(
  updates: Partial<NotificationPreferenceDTO>,
): Promise<NotificationPreferenceDTO> {
  const response = await api.put('/notifications/preferences', updates);
  return response.data.data;
}

// =====================================================
// Inbox
// =====================================================

export interface InboxResponse {
  items: NotificationInboxItemDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Fetch a paginated page of inbox notifications.
 * Pass `unreadOnly: true` to filter to unread items only.
 */
export async function getNotificationInbox(
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false,
): Promise<InboxResponse> {
  const response = await api.get('/notifications/inbox', {
    params: { page, limit, unreadOnly },
  });
  return response.data.data;
}

/**
 * Mark a single inbox item as read.
 */
export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/inbox/${id}/read`);
}

/**
 * Mark every inbox item as read in a single request.
 */
export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/inbox/read-all');
}

/**
 * Return the current unread notification count for badge display.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const response = await api.get('/notifications/inbox/unread-count');
  return response.data.data.count;
}

/**
 * Permanently delete a single inbox item.
 */
export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/inbox/${id}`);
}
