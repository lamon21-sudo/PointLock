// =====================================================
// Demo Slip Screen — Practice Mode
// =====================================================
// A fully sandboxed betting experience for new users.
//
// Two phases:
//   Phase 1 (Pick Selection): User browses DEMO_EVENTS
//     and selects picks. Minimum 2 picks to proceed.
//   Phase 2 (Completion): Congratulations view with a
//     spring-scale entrance and "Start Building Real Slips" CTA.
//
// Key constraints:
//   - Uses BettingEventCard in EXTERNAL STATE mode so the
//     real useSlipStore is never touched.
//   - DemoModeProvider wraps the tree so child components
//     can conditionally hide real-money UI.
//   - API sync fires in background — never blocks the user.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { CheckCircleIcon, StarIcon } from 'phosphor-react-native';

import { DemoModeProvider } from '../../src/contexts/DemoModeContext';
import { DEMO_EVENTS, DEMO_MIN_PICKS } from '../../src/constants/demo-data';
import { BettingEventCard } from '../../src/components/betting/BettingEventCard';
import { GoldButton } from '../../src/components/ui/GoldButton';
import { LUXURY_THEME } from '../../src/constants/theme';
import { useOnboardingStore } from '../../src/stores/onboarding.store';
import { OnboardingService } from '../../src/services/onboarding.service';
import { trackEvent } from '../../src/utils/analytics';
import { ANALYTICS_EVENTS } from '../../src/constants/analytics';
import type { DraftPick } from '../../src/types/slip.types';

// =====================================================
// Confetti Particle (lightweight CSS-level animation)
// =====================================================

interface ParticleProps {
  x: number;
  delay: number;
  color: string;
  size: number;
}

function ConfettiParticle({ x, delay, color, size }: ParticleProps) {
  const translateY = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 200,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 400,
            delay: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(rotate, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [translateY, opacity, rotate, delay]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '720deg'],
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: x,
          width: size,
          height: size,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { rotate: spin }],
        },
      ]}
    />
  );
}

// =====================================================
// Confetti Burst
// =====================================================

const PARTICLE_COLORS = [
  LUXURY_THEME.gold.main,
  LUXURY_THEME.gold.vibrant,
  LUXURY_THEME.status.success,
  '#A78BFA', // violet
  '#38BDF8', // sky
];

function ConfettiBurst() {
  const particles = Array.from({ length: 18 }).map((_, i) => ({
    x: (i / 18) * 340 - 10,
    delay: Math.random() * 300,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    size: 6 + (i % 3) * 3,
  }));

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((p, i) => (
        <ConfettiParticle key={i} {...p} />
      ))}
    </View>
  );
}

// =====================================================
// Completion Phase
// =====================================================

interface CompletionViewProps {
  pickCount: number;
  onContinue: () => void;
}

function CompletionView({ pickCount, onContinue }: CompletionViewProps) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 160,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.completionContainer,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <ConfettiBurst />

      {/* Icon */}
      <View style={styles.completionIconRing}>
        <CheckCircleIcon
          size={72}
          color={LUXURY_THEME.status.success}
          weight="fill"
        />
      </View>

      {/* Headline */}
      <Text style={styles.completionTitle}>Great Job!</Text>
      <Text style={styles.completionSubtitle}>
        You built a {pickCount}-pick slip
      </Text>

      {/* Stars */}
      <View style={styles.starsRow}>
        {[0, 1, 2].map((i) => (
          <StarIcon
            key={i}
            size={28}
            color={LUXURY_THEME.gold.main}
            weight="fill"
          />
        ))}
      </View>

      {/* Description */}
      <Text style={styles.completionDescription}>
        In a real match, your picks would be locked in and your rival would see
        exactly what you chose. The player with more correct picks wins the
        coin stake.
      </Text>

      {/* CTA */}
      <GoldButton
        onPress={onContinue}
        variant="solid"
        size="lg"
        fullWidth
        style={styles.completionCTA}
      >
        Start Building Real Slips
      </GoldButton>
    </Animated.View>
  );
}

// =====================================================
// Bottom Tray — Pick count + proceed button
// =====================================================

interface PickTrayProps {
  pickCount: number;
  onComplete: () => void;
}

function PickTray({ pickCount, onComplete }: PickTrayProps) {
  const canProceed = pickCount >= DEMO_MIN_PICKS;

  return (
    <View style={styles.tray}>
      <View style={styles.trayLeft}>
        <Text style={styles.trayPickCount}>{pickCount}</Text>
        <Text style={styles.trayLabel}>
          {pickCount === 1 ? 'Pick' : 'Picks'} Selected
        </Text>
        {!canProceed && (
          <Text style={styles.trayHint}>
            Add {DEMO_MIN_PICKS - pickCount} more to proceed
          </Text>
        )}
      </View>
      <GoldButton
        onPress={onComplete}
        variant="solid"
        size="md"
        disabled={!canProceed}
        style={styles.trayButton}
      >
        Complete Demo
      </GoldButton>
    </View>
  );
}

// =====================================================
// Main Screen
// =====================================================

export default function DemoSlipScreen() {
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [phase, setPhase] = useState<'selection' | 'completion'>('selection');
  const { completeDemoSlip } = useOnboardingStore();

  // Track demo start
  useEffect(() => {
    trackEvent({ name: ANALYTICS_EVENTS.DEMO_SLIP_STARTED });
  }, []);

  const handlePickSelect = useCallback((pick: DraftPick) => {
    setPicks((prev) => {
      // Enforce one pick per market type per event (replace existing)
      const withoutConflict = prev.filter(
        (p) =>
          !(
            p.sportsEventId === pick.sportsEventId &&
            p.pickType === pick.pickType
          )
      );
      const next = [...withoutConflict, pick];
      trackEvent({
        name: ANALYTICS_EVENTS.DEMO_SLIP_PICK_ADDED,
        properties: {
          eventId: pick.sportsEventId,
          pickType: pick.pickType,
          selection: pick.selection,
          totalPicks: next.length,
        },
      });
      return next;
    });
  }, []);

  const handlePickRemove = useCallback((pickId: string) => {
    setPicks((prev) => prev.filter((p) => p.id !== pickId));
  }, []);

  // Guard against rapid double-taps on "Complete Demo"
  const isCompleting = useRef(false);

  const handleComplete = useCallback(async () => {
    // Prevent double-submission (button may still be visible before re-render)
    if (isCompleting.current) return;
    if (picks.length < DEMO_MIN_PICKS) return;
    isCompleting.current = true;

    // Update store immediately so UI is responsive
    completeDemoSlip();

    trackEvent({
      name: ANALYTICS_EVENTS.DEMO_SLIP_COMPLETED,
      properties: { totalPicks: picks.length },
    });

    setPhase('completion');

    // Sync to server in the background
    OnboardingService.markDemoSlipComplete().catch(() => {});
  }, [picks.length, completeDemoSlip]);

  const handleNavigateToEvents = useCallback(() => {
    router.replace('/(tabs)/events' as Parameters<typeof router.replace>[0]);
  }, []);

  return (
    <DemoModeProvider>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {phase === 'selection' ? (
          <>
            {/* Practice Mode Banner */}
            <View style={styles.practiceBanner}>
              <View style={styles.practicePill}>
                <Text style={styles.practicePillText}>PRACTICE MODE</Text>
              </View>
              <Text style={styles.practiceSubtext}>
                No real coins — just pick and learn
              </Text>
            </View>

            {/* Events List */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {DEMO_EVENTS.map((event, index) => (
                <BettingEventCard
                  key={event.id}
                  event={event}
                  index={index}
                  existingPicks={picks}
                  onPickSelect={handlePickSelect}
                  onPickRemove={handlePickRemove}
                />
              ))}
              {/* Bottom pad so tray doesn't cover last card */}
              <View style={styles.listBottomPad} />
            </ScrollView>

            {/* Pick Tray */}
            <PickTray pickCount={picks.length} onComplete={handleComplete} />
          </>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.completionScroll}
          >
            <CompletionView
              pickCount={picks.length}
              onContinue={handleNavigateToEvents}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </DemoModeProvider>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },

  // Practice mode banner
  practiceBanner: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.subtle,
  },
  practicePill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 6,
  },
  practicePillText: {
    color: LUXURY_THEME.status.warning,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  practiceSubtext: {
    color: LUXURY_THEME.text.muted,
    fontSize: 12,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
  },
  listBottomPad: {
    height: 120,
  },
  completionScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },

  // Pick Tray
  tray: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    backgroundColor: LUXURY_THEME.surface.raised,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.gold,
    gap: 16,
    // Elevated shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  trayLeft: {
    flex: 1,
  },
  trayPickCount: {
    color: LUXURY_THEME.gold.main,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
  },
  trayLabel: {
    color: LUXURY_THEME.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  trayHint: {
    color: LUXURY_THEME.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  trayButton: {
    flexShrink: 0,
  },

  // Completion Phase
  completionContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    top: 0,
    borderRadius: 2,
  },
  completionIconRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(63, 208, 143, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(63, 208, 143, 0.3)',
  },
  completionTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  completionSubtitle: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 17,
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  completionDescription: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  completionCTA: {
    width: '100%',
  },
});
