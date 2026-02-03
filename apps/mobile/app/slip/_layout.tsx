// =====================================================
// Slip Stack Layout
// =====================================================
// Stack navigator for slip building flow.

import { Stack } from 'expo-router';

export default function SlipLayout() {
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
        name="builder"
        options={{
          title: 'Build Slip',
        }}
      />
      <Stack.Screen
        name="review"
        options={{
          title: 'Review Slip',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Slip Details',
          headerBackTitle: 'Back',
        }}
      />
    </Stack>
  );
}
