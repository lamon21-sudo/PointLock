// =====================================================
// Notifications Stack Layout
// =====================================================
// Stack navigator for the notification flow:
//   /notifications        — inbox (index)
//   /notifications/settings — preferences
//
// Header is rendered by this layout so both screens
// inherit the luxury dark theme without repeating it.

import { Stack } from 'expo-router';
import { LUXURY_THEME } from '../../src/constants/theme';

export default function NotificationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: LUXURY_THEME.bg.secondary,
        },
        headerTintColor: LUXURY_THEME.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 17,
        },
        headerBackTitleVisible: false,
        contentStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
        },
        // Natural swipe-back on both screens
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen
        name="settings"
        options={{ title: 'Notification Settings' }}
      />
    </Stack>
  );
}
