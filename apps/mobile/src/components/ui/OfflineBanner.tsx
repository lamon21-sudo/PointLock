// =====================================================
// Offline Banner Component
// =====================================================
// Displays a warning banner when the device is offline.
// Use in screens where network connectivity affects functionality.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface OfflineBannerProps {
  /** Custom message to display (default: generic offline message) */
  message?: string;
  /** Whether to show the banner (controlled externally) */
  visible?: boolean;
}

// =====================================================
// Components
// =====================================================

/**
 * Generic offline warning banner.
 * Shows an icon and message when the device is offline.
 */
export function OfflineBanner({
  message = 'You are offline. Some features may be unavailable.',
  visible = true,
}: OfflineBannerProps) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Ionicons
        name="cloud-offline-outline"
        size={18}
        color={LUXURY_THEME.status.warning}
      />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

/**
 * Slip-specific offline banner.
 * Shows message about odds potentially being outdated.
 */
export function SlipOfflineBanner({ visible = true }: { visible?: boolean }) {
  return (
    <OfflineBanner
      message="Offline mode. Odds may be outdated and will refresh when connected."
      visible={visible}
    />
  );
}

/**
 * Stale odds warning banner.
 * Shows when picks have outdated odds that need refresh.
 */
export function StaleOddsBanner({
  staleCount,
  visible = true,
}: {
  staleCount: number;
  visible?: boolean;
}) {
  if (!visible || staleCount === 0) {
    return null;
  }

  const message =
    staleCount === 1
      ? '1 pick has outdated odds. Refresh before submitting.'
      : `${staleCount} picks have outdated odds. Refresh before submitting.`;

  return (
    <View style={styles.staleContainer}>
      <Ionicons
        name="alert-circle-outline"
        size={18}
        color={LUXURY_THEME.gold.brushed}
      />
      <Text style={styles.staleText}>{message}</Text>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  text: {
    flex: 1,
    color: LUXURY_THEME.status.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  staleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  staleText: {
    flex: 1,
    color: LUXURY_THEME.gold.brushed,
    fontSize: 13,
    lineHeight: 18,
  },
});

export default OfflineBanner;
