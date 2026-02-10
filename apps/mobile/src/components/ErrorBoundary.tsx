/**
 * ErrorBoundary Component
 *
 * Global error boundary to catch unhandled React errors.
 * Displays a user-friendly fallback UI with recovery options.
 *
 * Usage:
 * - Wrap your app root with <ErrorBoundary>
 * - Export from _layout.tsx for Expo Router detection
 */

import React, { Component, ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { LUXURY_THEME } from '../constants/theme';
import { logAppError } from '../utils/error-logger';

// =============================================================================
// Types
// =============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional callback when error occurs */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorId: string | null;
  error: Error | null;
  componentStack: string | null;
  resetKey: number;
}

// =============================================================================
// Error Fallback UI Component
// =============================================================================

interface FallbackUIProps {
  error: Error | null;
  errorId: string | null;
  componentStack: string | null;
  onReset: () => void;
}

function ErrorFallbackUI({
  error,
  errorId,
  componentStack,
  onReset,
}: FallbackUIProps) {
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const handleCopyError = () => {
    try {
      const details = [
        `Error ID: ${errorId || 'Unknown'}`,
        `Message: ${error?.message || 'Unknown error'}`,
        `Time: ${new Date().toISOString()}`,
        `Platform: ${Platform.OS}`,
        '',
        'Stack Trace:',
        error?.stack || 'Not available',
        '',
        'Component Stack:',
        componentStack || 'Not available',
      ].join('\n');

      Clipboard.setString(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail - clipboard might not be available
    }
  };

  const handleGoHome = () => {
    try {
      onReset(); // Reset error state first
      router.replace('/(tabs)');
    } catch {
      // Router not available, just reset
      onReset();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Error Icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name="warning-outline"
            size={64}
            color={LUXURY_THEME.status.error}
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>Something went wrong</Text>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          We encountered an unexpected error. You can try again or return to the
          home screen.
        </Text>

        {/* Error ID */}
        {errorId && (
          <View style={styles.errorIdContainer}>
            <Text style={styles.errorIdLabel}>Error ID</Text>
            <Text style={styles.errorIdValue}>{errorId}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {/* Primary: Try Again */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onReset}
          >
            <Ionicons name="refresh" size={20} color={LUXURY_THEME.bg.primary} />
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>

          {/* Secondary: Go Home */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleGoHome}
          >
            <Ionicons
              name="home-outline"
              size={20}
              color={LUXURY_THEME.gold.brushed}
            />
            <Text style={styles.secondaryButtonText}>Go Home</Text>
          </Pressable>

          {/* Tertiary: Copy Error */}
          <Pressable
            style={({ pressed }) => [
              styles.tertiaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleCopyError}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={18}
              color={LUXURY_THEME.text.secondary}
            />
            <Text style={styles.tertiaryButtonText}>
              {copied ? 'Copied!' : 'Copy Error Details'}
            </Text>
          </Pressable>
        </View>

        {/* Dev-only: Show Details Toggle */}
        {__DEV__ && (
          <Pressable
            style={styles.devToggle}
            onPress={() => setShowDetails(!showDetails)}
          >
            <Text style={styles.devToggleText}>
              {showDetails ? 'Hide' : 'Show'} Technical Details
            </Text>
          </Pressable>
        )}

        {/* Dev-only: Error Details */}
        {__DEV__ && showDetails && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>Error Message:</Text>
            <Text style={styles.detailsText}>{error?.message}</Text>

            {componentStack && (
              <>
                <Text style={styles.detailsTitle}>Component Stack:</Text>
                <Text style={styles.detailsText}>{componentStack}</Text>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// =============================================================================
// Main ErrorBoundary Class
// =============================================================================

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorId: null,
      error: null,
      componentStack: null,
      resetKey: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    return {
      hasError: true,
      error,
      errorId,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Update state with component stack
    this.setState({
      componentStack: errorInfo.componentStack || null,
    });

    // Log the error
    logAppError(error, {
      errorId: this.state.errorId,
      componentStack: errorInfo.componentStack,
    });

    // Send to Sentry
    Sentry.captureException(error, {
      extra: {
        errorId: this.state.errorId,
        componentStack: errorInfo.componentStack,
      },
    });

    // Call optional onError callback
    this.props.onError?.(error, errorInfo);

    // Dev logging
    if (__DEV__) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      componentStack: null,
      resetKey: this.state.resetKey + 1,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallbackUI
          error={this.state.error}
          errorId={this.state.errorId}
          componentStack={this.state.componentStack}
          onReset={this.resetErrorBoundary}
        />
      );
    }

    // Use key to force remount on reset
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: LUXURY_THEME.spacing.cardPadding,
    paddingVertical: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 92, 108, 0.1)', // Error color with low opacity
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    maxWidth: 300,
  },
  errorIdContainer: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },
  errorIdLabel: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  errorIdValue: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: LUXURY_THEME.gold.brushed,
    borderRadius: LUXURY_THEME.spacing.borderRadius,
    paddingVertical: 16,
    minHeight: 56,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderRadius: LUXURY_THEME.spacing.borderRadius,
    borderWidth: 1.5,
    borderColor: LUXURY_THEME.gold.brushed,
    paddingVertical: 14,
    minHeight: 52,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.gold.brushed,
  },
  tertiaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    minHeight: 44,
  },
  tertiaryButtonText: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  devToggle: {
    marginTop: 24,
    paddingVertical: 8,
  },
  devToggleText: {
    fontSize: 12,
    color: LUXURY_THEME.text.muted,
    textDecorationLine: 'underline',
  },
  detailsContainer: {
    width: '100%',
    marginTop: 16,
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 16,
    maxHeight: 200,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
    marginBottom: 4,
    marginTop: 8,
  },
  detailsText: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default ErrorBoundary;
