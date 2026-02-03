// =====================================================
// Push Notification Service
// =====================================================
// Handles Expo push notification registration and deep linking.
//
// Features:
// - Request notification permissions
// - Get Expo push token
// - Register token with backend
// - Handle notification taps for navigation

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import api from './api';

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

    // Setup Android notification channel
    if (Platform.OS === 'android') {
      await setupAndroidChannel();
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
 */
async function registerTokenWithBackend(token: string): Promise<void> {
  try {
    await api.post('/auth/push-token', { token });

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
 * Setup Android notification channel for settlement notifications.
 */
async function setupAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync('match-settlement', {
    name: 'Match Results',
    description: 'Notifications for PvP match settlements',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6366f1',
    sound: 'default',
  });
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
      const data = response.notification.request.content.data as {
        type?: string;
        screen?: string;
        params?: { id?: string };
      } | undefined;

      if (__DEV__) {
        console.log('[PushNotification] Notification tapped:', data);
      }

      // Navigate to match detail screen
      if (data?.screen === 'match' && data?.params?.id) {
        router.push({
          pathname: '/match/[id]',
          params: { id: data.params.id },
        });
      }
    }
  );

  // Handle notifications received while app is foregrounded
  const notificationSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (__DEV__) {
        console.log('[PushNotification] Received in foreground:', notification.request.content);
      }
      // Notifications are already shown via setNotificationHandler
      // Could show in-app toast here if desired
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
 * Handle initial notification if app was opened from notification tap.
 * Call this during app startup.
 */
export async function handleInitialNotification(): Promise<void> {
  const response = await getInitialNotification();

  if (response) {
    const data = response.notification.request.content.data as {
      type?: string;
      screen?: string;
      params?: { id?: string };
    } | undefined;

    if (__DEV__) {
      console.log('[PushNotification] App opened from notification:', data);
    }

    // Navigate to match detail screen
    if (data?.screen === 'match' && data?.params?.id) {
      // Small delay to ensure navigation is ready
      setTimeout(() => {
        router.push({
          pathname: '/match/[id]',
          params: { id: data.params.id },
        });
      }, 500);
    }
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
