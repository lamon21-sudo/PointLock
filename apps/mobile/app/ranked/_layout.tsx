// =====================================================
// Ranked Stack Layout
// =====================================================
// Stack navigator for ranked/season screens.

import { Stack } from 'expo-router';
import { LUXURY_THEME } from '../../src/constants/theme';

export default function RankedLayout() {
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
        name="index"
        options={{
          title: 'Ranked',
          headerBackTitle: 'Back',
        }}
      />
    </Stack>
  );
}
