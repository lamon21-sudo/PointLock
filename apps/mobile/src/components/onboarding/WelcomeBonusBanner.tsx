// =====================================================
// WelcomeBonusBanner Component
// =====================================================
// Shown on the Home screen for new users who have just
// completed (or are mid-) onboarding.
//
// UX decisions:
//   - Coin icon + bold number creates immediate delight
//   - "Build Your First Slip" CTA is the primary action
//   - X dismiss button gives users agency without friction
//   - Entry scale-spring keeps the reveal feeling alive

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from 'react-native';
import { CurrencyCircleDollarIcon, XIcon } from 'phosphor-react-native';
import { router } from 'expo-router';

import { LUXURY_THEME } from '../../constants/theme';
import { GoldButton } from '../ui/GoldButton';
import { GlassCard } from '../ui/GlassCard';
import { trackEvent } from '../../utils/analytics';
import { ANALYTICS_EVENTS } from '../../constants/analytics';

// =====================================================
// Types
// =====================================================

interface WelcomeBonusBannerProps {
  onDismiss: () => void;
}

// =====================================================
// Component
// =====================================================

export function WelcomeBonusBanner({ onDismiss }: WelcomeBonusBannerProps) {
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Entry animation — spring for that satisfying "pop"
  useEffect(() => {
    trackEvent({ name: ANALYTICS_EVENTS.SIGNUP_BONUS_VIEWED });

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 200,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  const handleBuildSlip = useCallback(() => {
    router.push('/(tabs)/events' as Parameters<typeof router.push>[0]);
  }, []);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <GlassCard style={styles.card} variant="elevated" showBorder>
        {/* Dismiss button */}
        <Pressable
          style={styles.dismissButton}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss welcome bonus banner"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <XIcon size={18} color={LUXURY_THEME.text.secondary} weight="bold" />
        </Pressable>

        {/* Icon + Headline row */}
        <View style={styles.contentRow}>
          <View style={styles.iconCircle}>
            <CurrencyCircleDollarIcon
              size={36}
              color={LUXURY_THEME.gold.main}
              weight="fill"
            />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.headline}>Welcome Bonus!</Text>
            <Text style={styles.coinAmount}>
              750{' '}
              <Text style={styles.coinLabel}>Rival Coins</Text>
            </Text>
            <Text style={styles.subtext}>
              You've received 750 Rival Coins to get started!
            </Text>
          </View>
        </View>

        {/* CTA */}
        <GoldButton
          onPress={handleBuildSlip}
          variant="solid"
          size="sm"
          fullWidth
          style={styles.ctaButton}
        >
          Build Your First Slip
        </GoldButton>
      </GlassCard>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: LUXURY_THEME.spacing.sectionMargin,
  },
  card: {
    padding: 20,
    // Extra gold glow to make the bonus feel premium
    ...Platform.select({
      ios: {
        shadowColor: LUXURY_THEME.gold.main,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  // Dismiss
  dismissButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 1,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16,
    paddingRight: 24, // leave room for dismiss button
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: LUXURY_THEME.gold.glow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.gold,
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  headline: {
    color: LUXURY_THEME.gold.main,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  coinAmount: {
    color: LUXURY_THEME.text.primary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  coinLabel: {
    color: LUXURY_THEME.gold.main,
    fontSize: 18,
    fontWeight: '700',
  },
  subtext: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },

  // CTA
  ctaButton: {
    marginTop: 4,
  },
});

export default WelcomeBonusBanner;
