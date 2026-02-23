// =====================================================
// OnboardingOverlay Component
// =====================================================
// Full-screen modal walkthrough for new users.
//
// 4 steps covering the core Pick-Rivals loop:
//   0 - Build Your Slip
//   1 - Challenge a Rival
//   2 - Win Coins
//   3 - Track Your Rank
//
// UX decisions:
//   - BlurView backdrop preserves context (user sees the
//     app behind the tutorial, not a blank screen)
//   - Spring-animated step transitions feel physical
//   - Skip link at top-right — never hidden from the user
//   - "Try Demo" offered on last step when feature enabled
//   - API sync fires in the background so dismiss is instant

import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import {
  ListBulletsIcon,
  SwordIcon,
  TrophyIcon,
  ChartLineUpIcon,
} from 'phosphor-react-native';
import { router } from 'expo-router';

import { LUXURY_THEME } from '../../constants/theme';
import { GoldButton } from '../ui/GoldButton';
import { StepIndicator } from './StepIndicator';
import { useOnboardingStore, ONBOARDING_TOTAL_STEPS } from '../../stores/onboarding.store';
import { OnboardingService } from '../../services/onboarding.service';
import { trackEvent } from '../../utils/analytics';
import { ANALYTICS_EVENTS } from '../../constants/analytics';

// =====================================================
// Step Data
// =====================================================

interface StepData {
  IconComponent: React.ComponentType<{ size: number; color: string; weight: 'fill' | 'regular' | 'bold' }>;
  title: string;
  description: string;
}

const STEPS: StepData[] = [
  {
    IconComponent: ListBulletsIcon,
    title: 'Build Your Slip',
    description:
      'Browse events, pick games, and add them to your slip. Mix spreads, moneylines, and totals.',
  },
  {
    IconComponent: SwordIcon,
    title: 'Challenge a Rival',
    description:
      'Send your slip to a friend or find a random opponent. Both players put up coins.',
  },
  {
    IconComponent: TrophyIcon,
    title: 'Win Coins',
    description:
      'If your picks hit more than your rival\'s, you earn coins and climb the leaderboard.',
  },
  {
    IconComponent: ChartLineUpIcon,
    title: 'Track Your Rank',
    description:
      'Earn rank points each season. Unlock higher tiers for premium picks.',
  },
];

// =====================================================
// Types
// =====================================================

interface OnboardingOverlayProps {
  visible: boolean;
}

// =====================================================
// Component
// =====================================================

export function OnboardingOverlay({ visible }: OnboardingOverlayProps) {
  const {
    currentStep,
    featureFlags,
    nextStep,
    prevStep,
    completeOnboarding,
    skipOnboarding,
  } = useOnboardingStore();

  // Content slide + fade animation — resets on step change
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const iconScaleAnim = useRef(new Animated.Value(1)).current;

  // Fired once when the modal becomes visible
  useEffect(() => {
    if (visible) {
      trackEvent({
        name: ANALYTICS_EVENTS.ONBOARDING_STARTED,
        properties: { totalSteps: ONBOARDING_TOTAL_STEPS },
      });
    }
  }, [visible]);

  // Track each step view
  useEffect(() => {
    if (!visible) return;
    trackEvent({
      name: ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED,
      properties: { step: currentStep, stepTitle: STEPS[currentStep].title },
    });
  }, [currentStep, visible]);

  const animateTransition = useCallback(
    (direction: 1 | -1, onMidpoint: () => void) => {
      // Phase 1: slide out + fade out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: direction * -40,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(iconScaleAnim, {
          toValue: 0.7,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onMidpoint();
        // Reset slide to opposite side before sliding in
        slideAnim.setValue(direction * 40);
        // Phase 2: slide in + fade in
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 180,
            friction: 18,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.spring(iconScaleAnim, {
            toValue: 1,
            tension: 200,
            friction: 15,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [slideAnim, fadeAnim, iconScaleAnim]
  );

  const handleNext = useCallback(() => {
    animateTransition(1, nextStep);
  }, [animateTransition, nextStep]);

  const handleBack = useCallback(() => {
    animateTransition(-1, prevStep);
  }, [animateTransition, prevStep]);

  const handleComplete = useCallback(() => {
    trackEvent({
      name: ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
      properties: { totalSteps: ONBOARDING_TOTAL_STEPS },
    });
    completeOnboarding();
    // Fire-and-forget — do not block dismiss on network
    OnboardingService.markOnboardingComplete().catch(() => {});
  }, [completeOnboarding]);

  const handleSkip = useCallback(() => {
    trackEvent({
      name: ANALYTICS_EVENTS.ONBOARDING_SKIPPED,
      properties: { skippedAtStep: currentStep },
    });
    skipOnboarding();
    OnboardingService.markOnboardingComplete().catch(() => {});
  }, [skipOnboarding, currentStep]);

  const handleTryDemo = useCallback(() => {
    // Complete the overlay first, then navigate
    handleComplete();
    router.push('/demo/slip' as Parameters<typeof router.push>[0]);
  }, [handleComplete]);

  const isLastStep = currentStep === ONBOARDING_TOTAL_STEPS - 1;
  const step = STEPS[currentStep];
  const { IconComponent } = step;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <BlurView intensity={70} tint="dark" style={styles.backdrop}>
        {/* ----------------------------------------- */}
        {/* Skip link */}
        {/* ----------------------------------------- */}
        <Pressable
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        {/* ----------------------------------------- */}
        {/* Content card */}
        {/* ----------------------------------------- */}
        <View style={styles.card}>
          {/* Icon */}
          <Animated.View
            style={[
              styles.iconContainer,
              {
                opacity: fadeAnim,
                transform: [
                  { translateX: slideAnim },
                  { scale: iconScaleAnim },
                ],
              },
            ]}
          >
            <IconComponent
              size={80}
              color={LUXURY_THEME.gold.main}
              weight="fill"
            />
          </Animated.View>

          {/* Text content */}
          <Animated.View
            style={[
              styles.textBlock,
              {
                opacity: fadeAnim,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.description}>{step.description}</Text>
          </Animated.View>

          {/* Step dots */}
          <View style={styles.dotsContainer}>
            <StepIndicator
              totalSteps={ONBOARDING_TOTAL_STEPS}
              currentStep={currentStep}
            />
          </View>

          {/* Navigation buttons */}
          <View style={styles.buttonsRow}>
            {currentStep > 0 ? (
              <GoldButton
                onPress={handleBack}
                variant="outline"
                size="md"
                style={styles.backButton}
              >
                Back
              </GoldButton>
            ) : (
              // Invisible spacer to keep layout stable on step 0
              <View style={styles.backButton} />
            )}

            {isLastStep ? (
              <View style={styles.lastStepButtons}>
                {featureFlags.demoSlipEnabled && (
                  <GoldButton
                    onPress={handleTryDemo}
                    variant="outline"
                    size="md"
                    style={styles.demoButton}
                  >
                    Try Demo
                  </GoldButton>
                )}
                <GoldButton
                  onPress={handleComplete}
                  variant="solid"
                  size="md"
                  style={styles.nextButton}
                >
                  Get Started
                </GoldButton>
              </View>
            ) : (
              <GoldButton
                onPress={handleNext}
                variant="solid"
                size="md"
                style={styles.nextButton}
              >
                Next
              </GoldButton>
            )}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    // Additional dark tint on top of blur
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },

  // Skip link — top-right, always reachable
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
    right: 24,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    fontWeight: '500',
  },

  // Card
  card: {
    width: '100%',
    backgroundColor: LUXURY_THEME.surface.raised,
    borderRadius: 24,
    paddingTop: 40,
    paddingHorizontal: 28,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.gold,
    // iOS shadow
    ...Platform.select({
      ios: {
        shadowColor: LUXURY_THEME.gold.main,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: {
        elevation: 10,
      },
    }),
  },

  // Icon
  iconContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },

  // Text
  textBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    color: LUXURY_THEME.text.primary,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  description: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Dots
  dotsContainer: {
    marginBottom: 32,
  },

  // Buttons
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    // Matches the width of a sm GoldButton to keep layout stable
    width: 88,
    minHeight: 48,
  },
  nextButton: {
    flex: 1,
  },

  // Last step — may have two buttons side by side
  lastStepButtons: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  demoButton: {
    flex: 1,
  },
});

export default OnboardingOverlay;
