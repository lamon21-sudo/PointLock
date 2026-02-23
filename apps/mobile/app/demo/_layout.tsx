// =====================================================
// Demo Route Layout
// =====================================================
// Stack navigator for the Practice Mode demo flow.
// Uses the same dark theme as the rest of the app but
// keeps the header visible to orient new users.

import { Stack } from 'expo-router';
import { LUXURY_THEME } from '../../src/constants/theme';

export default function DemoLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: LUXURY_THEME.bg.secondary,
        },
        headerTintColor: LUXURY_THEME.text.primary,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        contentStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
        },
      }}
    >
      <Stack.Screen
        name="slip"
        options={{
          title: 'Practice Mode',
          headerShown: true,
          // Gesture-dismiss exits the demo naturally
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
