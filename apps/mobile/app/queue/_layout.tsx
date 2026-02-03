// =====================================================
// Queue Stack Layout
// =====================================================
// Stack navigator for matchmaking queue screens.

import { Stack } from 'expo-router';
import { LUXURY_THEME } from '../../src/constants/theme';

export default function QueueLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
        },
        headerTintColor: LUXURY_THEME.text.primary,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
        },
      }}
    >
      <Stack.Screen
        name="waiting"
        options={{
          title: 'Finding Opponent',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
