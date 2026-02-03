// =====================================================
// Challenge Stack Navigator
// =====================================================
// Stack navigation for all challenge-related screens

import { Stack } from 'expo-router';

export default function ChallengeLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1a2e',
        },
        headerTintColor: '#fff',
        headerShadowVisible: false,
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="create"
        options={{
          title: 'Create Challenge',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="join"
        options={{
          title: 'Join Challenge',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
