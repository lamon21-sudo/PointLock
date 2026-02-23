// =====================================================
// Push Notification Service
// =====================================================
// Handles Expo push notification registration and deep linking.
//
// Features:
// - Request notification permissions
// - Get Expo push token
// - Register token with backend
// - Setup Android notification channels
// - Handle notification taps for typed deep link navigation

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import api from './api';
import { TokenRefreshService } from './token-refresh.service';

// =====================================================
// Configuration
// =====================================================

/**
 * Configure how notifications are handled when app is foregrounded.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// =====================================================
// Token Registration
// =====================================================

/**
 * Register for push notifications and get Expo push token.
 * Returns the token string or null if registration fails.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Only register on physical devices
  if (!Device.isDevice) {
    if (__DEV__) {
      console.log('[PushNotification] Must use physical device for push notifications');
    }
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) {
      console.log('[PushNotification] Permission not granted');
    }
    return null;
  }

  // Get project ID from Expo config
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    if (__DEV__) {
      console.warn('[PushNotification] No project ID found. Push notifications require EAS configuration.');
      console.warn('  Run: npx eas-cli init');
    }
    return null;
  }

  try {
    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;

    if (__DEV__) {
      console.log('[PushNotification] Expo push token:', token);
    }

    // Register token with backend
    await registerTokenWithBackend(token);

    // Setup Android notification channels
    if (Platform.OS === 'android') {
      await setupAndroidChannels();
    }

    return token;
  } catch (error) {
    if (__DEV__) {
      console.error('[PushNotification] Failed to get push token:', error);
    }
    return null;
  }
}

/**
 * Send push token to backend for storage.
 * Posts to the canonical device-token endpoint including platform and device
 * metadata so the backend can target by platform or app version.
 */
async function registerTokenWithBackend(token: string): Promise<void> {
  try {
    // Proactively ensure access token is valid before making the request.
    // This prevents a 401 → refresh → retry cascade and the noisy
    // "Failed to register token" error when the token is simply stale.
    await TokenRefreshService.ensureValidToken();

    await api.post('/notifications/device-token', {
      token,
      platform: Platform.OS,
      deviceId: Device.modelName || Device.deviceName || 'unknown',
      appVersion: Constants.expoConfig?.version || '1.0.0',
    });

    if (__DEV__) {
      console.log('[PushNotification] Token registered with backend');
    }
  } catch (error) {
    // Don't throw - token registration failure shouldn't break the app
    if (__DEV__) {
      console.error('[PushNotification] Failed to register token with backend:', error);
    }
  }
}

/**
 * Setup all Android notification channels.
 * Each channel maps to a notification category so users can control
 * per-category priority directly from Android system settings.
 * HIGH-importance channels use a more emphatic vibration pattern.
 * The gold light color (#D4AF37) matches the LUXURY_THEME accent.
 */
async function setupAndroidChannels(): Promise<void> {
  const channels = [
    { id: 'match-settlement', name: 'Match Results', importance: Notifications.AndroidImportance.HIGH },
    { id: 'pvp-challenge', name: 'Challenges', importance: Notifications.AndroidImportance.HIGH },
    { id: 'slip-expiring', name: 'Slip Deadlines', importance: Notifications.AndroidImportance.HIGH },
    { id: 'social', name: 'Social Activity', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'game-reminders', name: 'Game Reminders', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'leaderboard', name: 'Leaderboard', importance: Notifications.AndroidImportance.DEFAULT },
    { id: 'daily-digest', name: 'Daily Digest', importance: Notifications.AndroidImportance.LOW },
    { id: 'weekly-recap', name: 'Weekly Recap', importance: Notifications.AndroidImportance.LOW },
    { id: 'win-streak', name: 'Win Streaks', importance: Notifications.AndroidImportance.LOW },
    { id: 're-engagement', name: 'Updates', importance: Notifications.AndroidImportance.LOW },
  ];

  for (const channel of channels) {
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: channel.importance,
      vibrationPattern: channel.importance === Notifications.AndroidImportance.HIGH
        ? [0, 250, 250, 250]
        : [0, 100, 200, 100],
      lightColor: '#D4AF37',
      sound: 'default',
    });
  }
}

// =====================================================
// Deep Link Navigation
// =====================================================

/**
 * Route a notification tap to the correct screen based on the typed
 * `type` field in the notification payload.
 *
 * Each case maps to the NotificationCategory enum on the backend.
 * The `entityId` field carries the primary key for the relevant
 * resource (match, challenge code, slip, event, user).
 * The `default` branch handles legacy payloads that still use the
 * old `screen` / `params` shape.
 */
function handleNotificationNavigation(data: Record<string, unknown> | undefined): void {
  if (!data?.type) return;

  const type = data.type as string;
  const entityId = (data.entityId as string) || '';

  switch (type) {
    case 'SETTLEMENT':
      if (entityId) router.push({ pathname: '/match/[id]', params: { id: entityId } });
      break;
    case 'PVP_CHALLENGE':
      if (entityId) router.push({ pathname: '/challenge/join', params: { code: entityId } });
      break;
    case 'SLIP_EXPIRING':
      if (entityId) router.push({ pathname: '/slip/[id]', params: { id: entityId } });
      break;
    case 'GAME_REMINDER':
      if (entityId) router.push({ pathname: '/event/[id]', params: { id: entityId } });
      break;
    case 'SOCIAL':
      if (entityId) router.push({ pathname: '/users/[id]', params: { id: entityId } });
      break;
    case 'LEADERBOARD':
      router.push('/(tabs)/leaderboard');
      break;
    case 'DAILY_DIGEST':
      router.push('/(tabs)/events');
      break;
    case 'WEEKLY_RECAP':
      router.push('/(tabs)/leaderboard');
      break;
    case 'WIN_STREAK':
      router.push('/(tabs)/matches');
      break;
    case 'INACTIVITY':
      router.push('/(tabs)');
      break;
    default:
      // Fallback: match type for legacy notifications that carry the old
      // { screen, params: { id } } shape instead of the new typed payload.
      if (data.screen === 'match' && data.params) {
        const params = data.params as { id?: string };
        if (params.id) router.push({ pathname: '/match/[id]', params: { id: params.id } });
      }
      break;
  }
}

// =====================================================
// Notification Listeners
// =====================================================

/**
 * Setup listeners for notification interactions.
 * Returns cleanup function to remove listeners.
 */
export function setupNotificationListeners(): () => void {
  // Handle notification taps (app in foreground or background)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;

      if (__DEV__) {
        console.log('[PushNotification] Notification tapped:', data);
      }

      handleNotificationNavigation(data);
    }
  );

  // Handle notifications received while app is foregrounded
  const notificationSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (__DEV__) {
        console.log('[PushNotification] Received in foreground:', notification.request.content);
      }
      // Notifications are already shown via setNotificationHandler.
      // Could surface an in-app toast banner here if desired.
    }
  );

  // Return cleanup function
  return () => {
    responseSubscription.remove();
    notificationSubscription.remove();
  };
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Get the last notification response (for handling cold start from notification tap).
 */
export async function getInitialNotification(): Promise<Notifications.NotificationResponse | null> {
  return await Notifications.getLastNotificationResponseAsync();
}

/**
 * Handle initial notification if app was opened from a cold-start notification tap.
 * Call this during app startup after navigation is ready.
 * The 500 ms delay ensures the Expo Router navigator has mounted before
 * attempting imperative navigation.
 */
export async function handleInitialNotification(): Promise<void> {
  const response = await getInitialNotification();

  if (response) {
    const data = response.notification.request.content.data as
      | Record<string, unknown>
      | undefined;

    if (__DEV__) {
      console.log('[PushNotification] App opened from notification:', data);
    }

    // Small delay to ensure navigation is ready
    setTimeout(() => {
      handleNotificationNavigation(data);
    }, 500);
  }
}

/**
 * Clear all delivered notifications.
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Get current badge count.
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count (iOS only).
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
