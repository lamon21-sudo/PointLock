import { useEffect, useRef } from 'react';
import { AppState, LogBox } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { useAuthStore } from '../src/stores/auth.store';
import { SplashScreen } from '../src/components/SplashScreen';
import { parseInviteUrl } from '../src/utils/deep-link-handler';
import { LUXURY_THEME } from '../src/constants/theme';
import SocketService from '../src/services/socket.service';
import { TokenRefreshService } from '../src/services/token-refresh.service';
import { ToastProvider } from '../src/contexts/ToastContext';
import { ToastContainer } from '../src/components/ui/ToastContainer';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  handleInitialNotification,
} from '../src/services/push-notification.service';

// Initialize Sentry error tracking
Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn || '',
  environment: Constants.expoConfig?.extra?.sentryEnvironment || 'development',
  enabled: !__DEV__,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },
});

// Export ErrorBoundary for Expo Router error boundary detection
// This fixes the "No React error boundary component found" warning
export { ErrorBoundary } from '../src/components/ErrorBoundary';

// Suppress expected API error logs in LogBox (they still log to console for debugging)
LogBox.ignoreLogs([
  'API REQUEST FAILED', // API interceptor error logs
  'API Response:', // Verbose API logging
  'API Request:', // Verbose API logging
]);

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

/**
 * RootLayoutNav Component
 *
 * Implements proper auth navigation guards with FOUC prevention.
 *
 * Auth State Machine:
 * 1. isInitialized=false → Show SplashScreen (loading auth state from storage)
 * 2. isInitialized=true, isAuthenticated=false → Show AuthStack (login/register)
 * 3. isInitialized=true, isAuthenticated=true → Show AppStack (tabs)
 *
 * The isLoading state is used for auth operations (login/register/logout) to show
 * appropriate loading indicators without triggering navigation changes.
 */
function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isInitialized, initialize } = useAuthStore();

  // Initialize auth state from secure storage on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-connect socket when authenticated
  useEffect(() => {
    if (!isInitialized) return;

    const socketService = SocketService.getInstance();

    if (isAuthenticated) {
      // Connect socket when user is authenticated
      socketService.connect().catch((error) => {
        console.error('[RootLayout] Socket auto-connect failed:', error);
      });
    } else {
      // Disconnect socket when user logs out
      socketService.disconnect();
    }
  }, [isInitialized, isAuthenticated]);

  // Setup push notifications when authenticated
  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;

    // Register for push notifications
    registerForPushNotifications().catch((error) => {
      console.error('[RootLayout] Push notification registration failed:', error);
    });

    // Setup notification tap handlers
    const cleanup = setupNotificationListeners();

    // Handle if app was opened from a notification tap
    handleInitialNotification().catch((error) => {
      console.error('[RootLayout] Initial notification handling failed:', error);
    });

    return cleanup;
  }, [isInitialized, isAuthenticated]);

  // Proactively refresh token when app returns to foreground
  // Prevents stale-token cascades in socket and push services
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        // Guard: skip if user is logging out (check live store state)
        const authState = useAuthStore.getState();
        if (!authState.isAuthenticated || authState.isLoggingOut) {
          appState.current = nextState;
          return;
        }

        // App just came to foreground — ensure token is still valid
        TokenRefreshService.ensureValidToken().catch(() => {
          // ensureValidToken triggers forceLogout internally on failure
        });

        // Reconnect socket if it was disconnected while backgrounded
        const socketService = SocketService.getInstance();
        if (!socketService.isConnected()) {
          socketService.connect().catch(() => {});
        }
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isInitialized, isAuthenticated]);

  // Handle auth-based navigation once initialized
  useEffect(() => {
    // Wait for auth initialization to complete
    if (!isInitialized) return;

    const currentSegment = String(segments[0] || '');
    const inAuthScreen = currentSegment === 'login' || currentSegment === 'register';
    const inProtectedRoute = currentSegment === '(tabs)' || currentSegment === 'slip';

    if (!isAuthenticated && (inProtectedRoute || (!inAuthScreen && currentSegment !== ''))) {
      // User is not authenticated and trying to access protected routes
      // Redirect to login screen
      router.replace('/login' as any);
    } else if (isAuthenticated && inAuthScreen) {
      // User is authenticated but on auth screens
      // Redirect to main app
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isInitialized, segments, router]);

  // Handle deep links for challenge invites
  useEffect(() => {
    // Only handle deep links when initialized and authenticated
    if (!isInitialized || !isAuthenticated) return;

    // Handle deep link handler
    const handleDeepLink = (url: string) => {
      const parsed = parseInviteUrl(url);
      if (parsed) {
        // Navigate to challenge join screen with invite code
        router.push({
          pathname: '/challenge/join' as any,
          params: { code: parsed.inviteCode },
        });
      }
    };

    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Handle URLs while app is running
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, [isInitialized, isAuthenticated, router]);

  /**
   * State 1: Show SplashScreen while initializing
   * This prevents FOUC by not rendering any routes until we know the auth state
   */
  if (!isInitialized) {
    return <SplashScreen />;
  }

  /**
   * State 2 & 3: Render appropriate stack based on auth state
   * The navigation guards above will handle redirects if user lands on wrong route
   */
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
        // Prevent back navigation to auth screens when authenticated
        gestureEnabled: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'PickRivals',
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
          // Allow back navigation between login/register
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          headerShown: false,
          // Allow back navigation between login/register
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          // Prevent back navigation to auth screens
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="slip"
        options={{
          headerShown: false,
          // Allow back navigation from slip screens
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="challenge"
        options={{
          headerShown: false,
          // Allow back navigation from challenge screens
          gestureEnabled: true,
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="match"
        options={{
          headerShown: false,
          // Allow back navigation from match screens
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="queue"
        options={{
          headerShown: false,
          // Prevent back navigation during queue
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
            <ToastContainer />
          </ToastProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
