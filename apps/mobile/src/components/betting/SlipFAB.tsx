// =====================================================
// SlipFAB Component
// =====================================================
// Floating action button showing current slip picks count.
// Animates in/out based on slip state.

import React, { useEffect, useRef } from 'react';
import { Pressable, Text, Animated, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  usePicksCount,
  usePointPotential,
  useSlipStoreHydration,
  useIsSlipFull,
} from '../../stores/slip.store';
import { SLIP_MAX_PICKS } from '../../types/slip.types';
import { LUXURY_THEME } from '../../constants/theme';
import { TEST_IDS } from '../../constants/testIds';

// =====================================================
// Types
// =====================================================

interface SlipFABProps {
  /** Optional custom onPress handler (defaults to navigation) */
  onPress?: () => void;
}

// =====================================================
// Component
// =====================================================

/**
 * SlipFAB - Floating action button for slip review
 *
 * Features:
 * - Shows pick count badge
 * - Displays point potential
 * - Spring animation on count change
 * - Fade in/out based on empty state
 * - 48pt touch target
 */
export function SlipFAB({ onPress }: SlipFABProps): React.ReactElement | null {
  const router = useRouter();
  const isHydrated = useSlipStoreHydration();
  const picksCount = usePicksCount();
  const pointPotential = usePointPotential();
  const isSlipFull = useIsSlipFull();

  // Animation values
  const translateY = useRef(new Animated.Value(100)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const countScale = useRef(new Animated.Value(1)).current;

  // Track previous count for badge bounce
  const prevCount = useRef(picksCount);

  // Show/hide animation based on picks count
  useEffect(() => {
    if (!isHydrated) return;

    if (picksCount > 0) {
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
        toValue: 100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [picksCount, isHydrated, translateY]);

  // Badge bounce when count changes
  useEffect(() => {
    if (picksCount !== prevCount.current && picksCount > 0) {
      Animated.sequence([
        Animated.timing(countScale, {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(countScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
      ]).start();
    }
    prevCount.current = picksCount;
  }, [picksCount, countScale]);

  // Press animation
  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Default: navigate to slip review
      router.push('/slip/review');
    }
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
          transform: [
            { translateY },
            { scale },
          ],
        },
      ]}
      pointerEvents={picksCount > 0 ? 'auto' : 'none'}
    >
      <Pressable
        testID={TEST_IDS.slip.fab}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.button, isSlipFull && styles.buttonFull]}
        accessibilityRole="button"
        accessibilityLabel={`Review slip with ${picksCount} picks, ${pointPotential} potential points${isSlipFull ? ', slip is full' : ''}`}
      >
        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.label}>
            {isSlipFull ? 'Slip Full - Review' : 'Review Slip'}
          </Text>
          <Text style={styles.points}>{pointPotential} pts</Text>
        </View>

        {/* Count badge */}
        <Animated.View
          testID={TEST_IDS.slip.fabBadge}
          style={[
            styles.badge,
            isSlipFull && styles.badgeFull,
            { transform: [{ scale: countScale }] },
          ]}
        >
          <Text style={[styles.badgeText, isSlipFull && styles.badgeTextFull]}>
            {isSlipFull ? `${picksCount}/${SLIP_MAX_PICKS}` : picksCount}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100, // Above floating dock navigation
    left: 20,
    right: 20,
    zIndex: 100,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: LUXURY_THEME.gold.main,
    borderRadius: LUXURY_THEME.spacing.borderRadiusPill, // Pill shape
    paddingVertical: 16,
    paddingHorizontal: 24,
    minHeight: 56,
    // Gold outer glow
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  buttonFull: {
    backgroundColor: LUXURY_THEME.status.warning, // Amber when full
    shadowColor: LUXURY_THEME.status.warning,
  },
  content: {
    flex: 1,
  },
  label: {
    color: LUXURY_THEME.bg.primary, // Dark text on gold
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  points: {
    color: 'rgba(10, 10, 10, 0.7)', // Slightly transparent dark
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  badge: {
    backgroundColor: LUXURY_THEME.status.success, // Mint green
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginLeft: 12,
  },
  badgeFull: {
    backgroundColor: LUXURY_THEME.bg.primary, // Dark badge when full
    minWidth: 44, // Wider to fit "10/10"
  },
  badgeText: {
    color: LUXURY_THEME.bg.primary, // Dark text on mint
    fontSize: 14,
    fontWeight: '800',
  },
  badgeTextFull: {
    color: LUXURY_THEME.status.warning, // Amber text on dark badge
  },
});

export default SlipFAB;
