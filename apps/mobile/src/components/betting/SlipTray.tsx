// =====================================================
// SlipTray Component
// =====================================================
// Fixed bottom sticky tray showing slip summary and CTA.
// Replaces SlipFAB with more comprehensive slip information.

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  usePicksCount,
  useTotalCoinCost,
  useMinCoinSpend,
  useCoinSpendMet,
  useSlipStoreHydration,
} from '../../stores/slip.store';
import { MinSpendProgressBar } from './MinSpendProgressBar';
import { LUXURY_THEME } from '../../constants/theme';

export interface SlipTrayProps {
  /** Whether the tray is visible (default: auto-detect from picks) */
  visible?: boolean;
  /** Custom CTA label (default: "Review Slip") */
  ctaLabel?: string;
}

/**
 * SlipTray - Fixed bottom tray for slip management
 *
 * Features:
 * - Shows pick count and total coin cost
 * - MinSpendProgressBar showing progress
 * - CTA button disabled until minimum spend met
 * - Slide up/down animation based on picks
 * - Spring physics for natural motion
 * - Navigates to /slip/review on CTA press
 */
export function SlipTray({ visible, ctaLabel = 'Review Slip' }: SlipTrayProps) {
  const router = useRouter();
  const isHydrated = useSlipStoreHydration();
  const picksCount = usePicksCount();
  const totalCoinCost = useTotalCoinCost();
  const minCoinSpend = useMinCoinSpend();
  const isMinimumMet = useCoinSpendMet();

  // Animation values
  const translateY = useRef(new Animated.Value(200)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Determine visibility
  const shouldBeVisible = visible !== undefined ? visible : picksCount > 0;

  // Show/hide animation
  useEffect(() => {
    if (!isHydrated) return;

    if (shouldBeVisible) {
      // Slide up
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 12,
      }).start();
    } else {
      // Slide down (hide)
      Animated.timing(translateY, {
        toValue: 200,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldBeVisible, isHydrated, translateY]);

  // Press animations
  const handlePressIn = () => {
    if (!isMinimumMet) return;

    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePress = () => {
    if (!isMinimumMet) return;
    router.push('/slip/review' as any);
  };

  // Don't render until hydrated
  if (!isHydrated) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
        },
      ]}
      pointerEvents={shouldBeVisible ? 'auto' : 'none'}
    >
      <View style={styles.tray}>
        {/* Summary Section */}
        <View style={styles.summarySection}>
          {/* Pick count and coin cost */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Picks</Text>
              <Text style={styles.statValue}>{picksCount}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Total Cost</Text>
              <Text style={styles.statValue}>{totalCoinCost} coins</Text>
            </View>
          </View>

          {/* Progress bar (only show if minimum exists) */}
          {minCoinSpend > 0 && (
            <View style={styles.progressSection}>
              <MinSpendProgressBar
                currentSpend={totalCoinCost}
                minimumSpend={minCoinSpend}
                animated={true}
                height={6}
              />
            </View>
          )}
        </View>

        {/* CTA Button */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Pressable
            onPress={handlePress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={!isMinimumMet}
            style={[styles.ctaButton, !isMinimumMet && styles.ctaButtonDisabled]}
            accessibilityRole="button"
            accessibilityLabel={
              isMinimumMet
                ? `${ctaLabel} with ${picksCount} picks`
                : `Minimum spend not met. Need ${minCoinSpend - totalCoinCost} more coins.`
            }
            accessibilityState={{ disabled: !isMinimumMet }}
          >
            <LinearGradient
              colors={
                isMinimumMet
                  ? [LUXURY_THEME.gold.main, LUXURY_THEME.gold.depth]
                  : ['rgba(212, 175, 55, 0.3)', 'rgba(170, 119, 28, 0.3)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Text style={[styles.ctaText, !isMinimumMet && styles.ctaTextDisabled]}>
                {ctaLabel}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  tray: {
    backgroundColor: LUXURY_THEME.surface.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 32, // Extra padding for safe area
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.gold,
    // Floating shadow
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  summarySection: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    color: LUXURY_THEME.text.muted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: LUXURY_THEME.border.muted,
    marginHorizontal: 16,
  },
  progressSection: {
    paddingHorizontal: 8,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
    // Gold glow
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaButtonDisabled: {
    shadowOpacity: 0.1,
    elevation: 2,
  },
  ctaGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  ctaText: {
    color: LUXURY_THEME.bg.primary, // Dark text on gold
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ctaTextDisabled: {
    color: LUXURY_THEME.text.muted,
    opacity: 0.5,
  },
});

export default SlipTray;
