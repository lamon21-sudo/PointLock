// =====================================================
// Match Stack Layout
// =====================================================
// Stack navigator for match detail screens.

import { Stack } from 'expo-router';

export default function MatchLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0f0f23',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        contentStyle: {
          backgroundColor: '#0f0f23',
        },
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Match Details',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="found"
        options={{
          title: 'Match Found',
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
