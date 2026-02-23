// =====================================================
// PointLockMoment — Lock-In Ceremony Animation
// =====================================================
// Signature "Lock-In" ceremony that plays after a slip
// is successfully committed via the API. Choreographs
// a composed lock visual (body + animated shackle),
// shockwave ring, and stamped "LOCKED" text — all synced
// to precise haptic events via Reanimated runOnJS callbacks.
//
// Timeline (full motion):
//   0ms    — lock fades in, scale springs 0.3→1.0       → haptic: slip-lockin-prepare
//   400ms  — shackle begins rotating shut
//   600ms  — shackle snaps closed                        → haptic: slip-lockin-close
//   650ms  — shockwave ring expands                      → haptic: slip-lockin-reverb
//   1000ms — "LOCKED" stamps in below lock               → haptic: slip-lockin-stamp
//   1400ms — brief hold
//   1800ms — everything fades out, onComplete() fires
//
// Reduced-motion variant:
//   300ms  — lock appears closed, "LOCKED" fades in
//   600ms  — onComplete() fires
//   Haptics: slip-lockin-close + slip-lockin-stamp only

import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import { LUXURY_THEME } from '../../constants/theme';
import { Haptics } from '../../services/haptics.service';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// =====================================================
// Types
// =====================================================

export interface PointLockMomentProps {
  /** Whether the ceremony is visible/playing */
  visible: boolean;
  /** Called when the full ceremony completes (navigate away) */
  onComplete: () => void;
}

// =====================================================
// Constants
// =====================================================

// Lock body dimensions
const LOCK_BODY_WIDTH = 44;
const LOCK_BODY_HEIGHT = 38;
const LOCK_BODY_RADIUS = 8;

// Shackle dimensions — the U-arch sitting above the body
const SHACKLE_WIDTH = 28;
const SHACKLE_HEIGHT = 26;
const SHACKLE_BORDER_RADIUS = 14; // half of width = full half-circle top
const SHACKLE_BORDER_WIDTH = 5;

// Shockwave starts slightly larger than the overall lock footprint
const SHOCKWAVE_BASE_SIZE = 72;

// Open shackle tilts right so it reads as "unlatched"
const SHACKLE_OPEN_DEG = 25;

// Animation timing (ms) — full motion
const T_PREPARE = 0;
const T_SHACKLE_START = 400;
const T_SHACKLE_SNAP = 600;
const T_SHOCKWAVE_START = 650;
const T_STAMP_START = 1000;
const T_HOLD_END = 1400;
const T_FADE_OUT = 1800;

// Duration constants
const LOCK_APPEAR_DURATION = 350;
const SHACKLE_SWING_DURATION = T_SHACKLE_SNAP - T_SHACKLE_START; // 200ms
const SHOCKWAVE_DURATION = 400;
const STAMP_SPRING_DAMPING = 18;
const STAMP_SPRING_STIFFNESS = 260;
const FADE_OUT_DURATION = 300;

// =====================================================
// Haptic bridge helpers
// =====================================================
// These plain JS functions are safe to call via runOnJS
// from inside Reanimated worklets.

function triggerPrepare(): void {
  Haptics.trigger('slip-lockin-prepare');
}

function triggerClose(): void {
  Haptics.trigger('slip-lockin-close');
}

function triggerReverb(): void {
  Haptics.trigger('slip-lockin-reverb');
}

function triggerStamp(): void {
  Haptics.trigger('slip-lockin-stamp');
}

// =====================================================
// Component
// =====================================================

export function PointLockMoment({ visible, onComplete }: PointLockMomentProps) {
  const { reduceMotion } = useReducedMotion();

  // --------------------------------------------------
  // Guard: onComplete fires exactly once per showing.
  // onCompleteRef stabilizes the callback identity so
  // fireComplete never changes — preventing mid-ceremony
  // restarts when the parent re-renders.
  // --------------------------------------------------
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const fireComplete = useCallback(() => {
    if (!completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current();
    }
  }, []);

  // --------------------------------------------------
  // Shared values
  // --------------------------------------------------

  // Outer container — fades in instantly, fades out at end
  const containerOpacity = useSharedValue(0);

  // Lock group — scale spring + opacity
  const lockOpacity = useSharedValue(0);
  const lockScale = useSharedValue(0.3);

  // Shackle rotation: open (25°) → closed (0°)
  // Stored as degrees; applied via rotateZ transform
  const shackleRotation = useSharedValue(SHACKLE_OPEN_DEG);

  // Shockwave ring
  const shockwaveScale = useSharedValue(1);
  const shockwaveOpacity = useSharedValue(0);

  // "LOCKED" stamp text
  const stampScale = useSharedValue(1.3);
  const stampOpacity = useSharedValue(0);

  // --------------------------------------------------
  // Cancel all in-flight animations (cleanup)
  // --------------------------------------------------
  const cancelAll = useCallback(() => {
    cancelAnimation(containerOpacity);
    cancelAnimation(lockOpacity);
    cancelAnimation(lockScale);
    cancelAnimation(shackleRotation);
    cancelAnimation(shockwaveScale);
    cancelAnimation(shockwaveOpacity);
    cancelAnimation(stampScale);
    cancelAnimation(stampOpacity);
  }, [
    containerOpacity,
    lockOpacity,
    lockScale,
    shackleRotation,
    shockwaveScale,
    shockwaveOpacity,
    stampScale,
    stampOpacity,
  ]);

  // --------------------------------------------------
  // Reset shared values to initial state
  // --------------------------------------------------
  const resetValues = useCallback(() => {
    containerOpacity.value = 0;
    lockOpacity.value = 0;
    lockScale.value = 0.3;
    shackleRotation.value = SHACKLE_OPEN_DEG;
    shockwaveScale.value = 1;
    shockwaveOpacity.value = 0;
    stampScale.value = 1.3;
    stampOpacity.value = 0;
  }, [
    containerOpacity,
    lockOpacity,
    lockScale,
    shackleRotation,
    shockwaveScale,
    shockwaveOpacity,
    stampScale,
    stampOpacity,
  ]);

  // --------------------------------------------------
  // Reduced-motion ceremony
  // --------------------------------------------------
  const playReducedMotion = useCallback(() => {
    // Container fades up
    containerOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });

    // Lock appears at full scale with shackle already closed
    lockOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    lockScale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });

    // Shackle is pre-closed — snap immediately
    shackleRotation.value = withTiming(
      0,
      { duration: 50 },
      (finished) => {
        'worklet';
        if (finished) runOnJS(triggerClose)();
      },
    );

    // Stamp fades in at 300ms
    stampOpacity.value = withDelay(
      300,
      withTiming(
        1,
        { duration: 150, easing: Easing.out(Easing.ease) },
        (finished) => {
          'worklet';
          if (finished) runOnJS(triggerStamp)();
        },
      ),
    );
    stampScale.value = withDelay(
      300,
      withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) }),
    );

    // Complete after 600ms
    containerOpacity.value = withDelay(
      600,
      withTiming(0, { duration: 150, easing: Easing.in(Easing.ease) }, (finished) => {
        'worklet';
        if (finished) runOnJS(fireComplete)();
      }),
    );
  }, [
    containerOpacity,
    lockOpacity,
    lockScale,
    shackleRotation,
    stampOpacity,
    stampScale,
    fireComplete,
  ]);

  // --------------------------------------------------
  // Full ceremony
  // --------------------------------------------------
  const playFullCeremony = useCallback(() => {
    // ---- Phase 1: Container + lock appear (0ms) ----
    // Container backdrop fades in
    containerOpacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });

    // Lock opacity fades in and scale springs up from 0.3
    // The withTiming callback fires the prepare haptic when fade completes
    lockOpacity.value = withTiming(
      1,
      { duration: LOCK_APPEAR_DURATION, easing: Easing.out(Easing.ease) },
      (finished) => {
        'worklet';
        if (finished) runOnJS(triggerPrepare)();
      },
    );
    lockScale.value = withSpring(1, {
      damping: 14,
      stiffness: 220,
      mass: 0.7,
    });

    // ---- Phase 2: Shackle swings shut (400ms → 600ms) ----
    // Delay 400ms then smoothly arc from open angle to 0 over 200ms.
    // The withTiming completion callback fires the close haptic at the
    // exact frame the shackle lands.
    shackleRotation.value = withDelay(
      T_SHACKLE_START,
      withTiming(
        0,
        {
          duration: SHACKLE_SWING_DURATION,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          'worklet';
          if (finished) runOnJS(triggerClose)();
        },
      ),
    );

    // ---- Phase 3: Shockwave ring expands (650ms) ----
    // Opacity flashes to 1 then fades to 0 while scale grows to 3
    shockwaveOpacity.value = withDelay(
      T_SHOCKWAVE_START,
      withSequence(
        // Flash in instantly
        withTiming(1, { duration: 30 }, (finished) => {
          'worklet';
          // Fire reverb haptic exactly when the ring becomes visible
          if (finished) runOnJS(triggerReverb)();
        }),
        // Fade out over the expand duration
        withTiming(0, { duration: SHOCKWAVE_DURATION - 30, easing: Easing.out(Easing.ease) }),
      ),
    );
    shockwaveScale.value = withDelay(
      T_SHOCKWAVE_START,
      withTiming(3, {
        duration: SHOCKWAVE_DURATION,
        easing: Easing.out(Easing.ease),
      }),
    );

    // ---- Phase 4: Lock micro-bounce + "LOCKED" stamps in (1000ms) ----
    // The lock body dips slightly then returns to full scale
    lockScale.value = withDelay(
      T_STAMP_START,
      withSequence(
        withSpring(0.92, { damping: 10, stiffness: 400, mass: 0.5 }),
        withSpring(1.0, { damping: 12, stiffness: 300, mass: 0.5 }),
      ),
    );

    // Stamp text springs in from scale 1.3 → 1.0
    stampOpacity.value = withDelay(
      T_STAMP_START,
      withTiming(
        1,
        { duration: 120, easing: Easing.out(Easing.ease) },
        (finished) => {
          'worklet';
          if (finished) runOnJS(triggerStamp)();
        },
      ),
    );
    stampScale.value = withDelay(
      T_STAMP_START,
      withSpring(1.0, {
        damping: STAMP_SPRING_DAMPING,
        stiffness: STAMP_SPRING_STIFFNESS,
        mass: 0.6,
      }),
    );

    // ---- Phase 5: Hold then fade out (1800ms) ----
    // containerOpacity drives the full exit; fireComplete is called
    // when the fade finishes.
    const fadeOutDelay = T_FADE_OUT - T_HOLD_END;
    containerOpacity.value = withDelay(
      T_HOLD_END,
      withTiming(0, { duration: FADE_OUT_DURATION, easing: Easing.in(Easing.ease) }),
    );
    // Use stampOpacity as the "last value to settle" anchor for onComplete
    // so it fires after the container is gone
    stampOpacity.value = withDelay(
      T_HOLD_END,
      withTiming(
        0,
        { duration: FADE_OUT_DURATION + fadeOutDelay, easing: Easing.in(Easing.ease) },
        (finished) => {
          'worklet';
          if (finished) runOnJS(fireComplete)();
        },
      ),
    );
    lockOpacity.value = withDelay(
      T_HOLD_END,
      withTiming(0, { duration: FADE_OUT_DURATION, easing: Easing.in(Easing.ease) }),
    );
  }, [
    containerOpacity,
    lockOpacity,
    lockScale,
    shackleRotation,
    shockwaveScale,
    shockwaveOpacity,
    stampScale,
    stampOpacity,
    fireComplete,
  ]);

  // --------------------------------------------------
  // Orchestrate on visibility change
  // --------------------------------------------------
  useEffect(() => {
    if (visible) {
      completedRef.current = false;
      resetValues();
      if (reduceMotion) {
        playReducedMotion();
      } else {
        playFullCeremony();
      }
    } else {
      // Visible toggled off mid-animation — cancel and reset
      cancelAll();
      resetValues();
    }

    return () => {
      cancelAll();
      resetValues();
    };
  }, [visible, reduceMotion, resetValues, cancelAll, playReducedMotion, playFullCeremony]);

  // --------------------------------------------------
  // Animated styles
  // --------------------------------------------------

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const lockGroupAnimatedStyle = useAnimatedStyle(() => ({
    opacity: lockOpacity.value,
    transform: [{ scale: lockScale.value }],
  }));

  const shackleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${shackleRotation.value}deg` }],
  }));

  const shockwaveAnimatedStyle = useAnimatedStyle(() => ({
    opacity: shockwaveOpacity.value,
    transform: [{ scale: shockwaveScale.value }],
  }));

  const stampAnimatedStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ scale: stampScale.value }],
  }));

  // --------------------------------------------------
  // Render — hidden from layout when not visible and
  // opacity is 0 so it doesn't intercept touches.
  // --------------------------------------------------
  if (!visible && containerOpacity.value === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[styles.outerContainer, containerAnimatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject} />

      {/* Dark scrim sits on top of the blur for additional depth */}
      <View style={styles.scrim} />

      {/* Ceremony stage — vertically and horizontally centered */}
      <View style={styles.stage}>

        {/* Lock group: body + shackle as composed View elements */}
        <Animated.View style={[styles.lockGroup, lockGroupAnimatedStyle]}>

          {/* Shockwave ring — absolutely centered behind the lock */}
          <Animated.View
            style={[styles.shockwaveRing, shockwaveAnimatedStyle]}
            pointerEvents="none"
          />

          {/* Shackle — the U-arch above the body */}
          {/*
            The shackle sits above the body. Its transform-origin is
            effectively the bottom-center of the shackle shape (where it
            meets the body). We achieve this by translating the anchor point
            into the rotation origin via a translateY trick:
            translate down by half height → rotate → translate back up.
            This makes it rotate around the latch point, not its center.
          */}
          <View style={styles.shackleWrapper}>
            <Animated.View style={[styles.shackle, shackleAnimatedStyle]} />
          </View>

          {/* Lock body */}
          <View style={styles.lockBody}>
            {/* Keyhole — decorative cutout */}
            <View style={styles.keyhole} />
          </View>

        </Animated.View>

        {/* "LOCKED" stamp text below the lock */}
        <Animated.View style={[styles.stampContainer, stampAnimatedStyle]}>
          <Text style={styles.stampText}>LOCKED</Text>
        </Animated.View>

      </View>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const GOLD = LUXURY_THEME.gold.brushed;         // #D4AF37
const GOLD_LIGHT = LUXURY_THEME.gold.light;     // #FCF6BA
const SURFACE_RAISED = LUXURY_THEME.surface.raised; // #1A1A1A

const styles = StyleSheet.create({
  // ---- Outer container ----
  outerContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },

  // ---- Stage — centers the lock + stamp cluster ----
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- Lock group ----
  lockGroup: {
    width: 80,
    height: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
    // Gold glow shadow on the lock group
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },

  // ---- Shockwave ring ----
  shockwaveRing: {
    position: 'absolute',
    width: SHOCKWAVE_BASE_SIZE,
    height: SHOCKWAVE_BASE_SIZE,
    borderRadius: SHOCKWAVE_BASE_SIZE / 2,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'transparent',
    // Center the ring on the lock body center
    top: '50%',
    left: '50%',
    marginTop: -(SHOCKWAVE_BASE_SIZE / 2),
    marginLeft: -(SHOCKWAVE_BASE_SIZE / 2),
  },

  // ---- Shackle (U-arch above body) ----
  shackleWrapper: {
    // Position the shackle so it sits directly above the body,
    // horizontally centered. The rotation transform-origin anchor
    // is approximated by the translateY trick in shackleAnimatedStyle.
    width: SHACKLE_WIDTH + SHACKLE_BORDER_WIDTH * 2,
    height: SHACKLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    // Pull the shackle down so its bottom edge aligns with the
    // top of the lock body — no visible gap.
    marginBottom: -1,
  },

  shackle: {
    width: SHACKLE_WIDTH,
    height: SHACKLE_HEIGHT,
    borderWidth: SHACKLE_BORDER_WIDTH,
    borderColor: GOLD,
    // U-shape: round the top, leave the bottom open
    borderTopLeftRadius: SHACKLE_BORDER_RADIUS,
    borderTopRightRadius: SHACKLE_BORDER_RADIUS,
    borderBottomWidth: 0,
    backgroundColor: 'transparent',
    // Origin of rotation should appear to be the bottom-center
    // (the hinge point where shackle enters the body). Reanimated
    // does not expose transformOrigin directly, but because the
    // shackle element's bottom edge is aligned to the body top,
    // and the rotation angle is small (~25°), the visual is correct.
  },

  // ---- Lock body ----
  lockBody: {
    width: LOCK_BODY_WIDTH,
    height: LOCK_BODY_HEIGHT,
    borderRadius: LOCK_BODY_RADIUS,
    borderWidth: 2.5,
    borderColor: GOLD,
    backgroundColor: SURFACE_RAISED,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ---- Keyhole ----
  keyhole: {
    width: 10,
    height: 14,
    borderRadius: 5,
    backgroundColor: GOLD,
    opacity: 0.6,
    // Small notch at the bottom of the keyhole circle
    // is represented by the taller rectangle shape
  },

  // ---- "LOCKED" stamp text ----
  stampContainer: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
    // Subtle gold border to frame the text badge
    borderWidth: 1,
    borderColor: `rgba(212, 175, 55, 0.35)`,
    borderRadius: 4,
  },

  stampText: {
    color: GOLD_LIGHT,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    textTransform: 'uppercase',
    // Gold text glow
    textShadowColor: GOLD,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});

export default PointLockMoment;
