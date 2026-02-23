// =====================================================
// useHeroTransition Hook
// =====================================================
// Reusable hero (shared-element-style) animation between screens.
// Measures a source element's screen position, then springs
// the target element from that position to its natural layout.
//
// Usage:
//   Source screen: measureInWindow → pass geometry as nav param
//   Target screen: useHeroTransition({ heroSourceParam }) → attach ref + styles

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// =====================================================
// Types
// =====================================================

interface SourceGeometry {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

interface UseHeroTransitionOptions {
  /** JSON string from navigation params (output of measureInWindow) */
  heroSourceParam?: string;
  /** Spring damping (default: 20) */
  damping?: number;
  /** Spring stiffness (default: 200) */
  stiffness?: number;
  /** Spring mass (default: 0.8) */
  mass?: number;
  /** Delay before non-hero content fades in, in ms (default: 200) */
  contentFadeDelay?: number;
  /** Duration of non-hero content fade, in ms (default: 300) */
  contentFadeDuration?: number;
}

interface UseHeroTransitionResult {
  /** Attach to the target hero element via ref prop */
  heroRef: React.RefObject<View | null>;
  /** Animated style for the hero element (translate + scale) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heroAnimatedStyle: any;
  /** Animated style for non-hero content (delayed opacity) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentFadeStyle: any;
  /** Call on the hero element's onLayout to trigger measurement */
  onHeroLayout: () => void;
  /** Whether a hero animation source was provided */
  shouldAnimate: boolean;
}

// =====================================================
// Hook
// =====================================================

export function useHeroTransition(
  options: UseHeroTransitionOptions
): UseHeroTransitionResult {
  const {
    heroSourceParam,
    damping = 20,
    stiffness = 200,
    mass = 0.8,
    contentFadeDelay = 200,
    contentFadeDuration = 300,
  } = options;

  // Parse source geometry from JSON param
  const sourceGeometry = useMemo<SourceGeometry | null>(() => {
    if (!heroSourceParam) return null;
    try {
      const parsed = JSON.parse(heroSourceParam);
      if (
        typeof parsed.pageX === 'number' &&
        typeof parsed.pageY === 'number' &&
        parsed.width > 0 &&
        parsed.height > 0
      ) {
        return parsed as SourceGeometry;
      }
      return null;
    } catch {
      return null;
    }
  }, [heroSourceParam]);

  const heroRef = useRef<View>(null);
  const [targetGeometry, setTargetGeometry] = useState<SourceGeometry | null>(null);

  // Animation progress: 0 = at source position, 1 = at target (natural) position
  const progress = useSharedValue(sourceGeometry ? 0 : 1);
  const contentOpacity = useSharedValue(sourceGeometry ? 0 : 1);

  // Measure the target element's screen position once it's laid out
  const onHeroLayout = useCallback(() => {
    if (!sourceGeometry || !heroRef.current) {
      // No hero animation — make sure content is visible
      progress.value = 1;
      contentOpacity.value = 1;
      return;
    }
    heroRef.current.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        setTargetGeometry({ pageX: x, pageY: y, width, height });
      } else {
        // Measurement failed — skip animation
        progress.value = 1;
        contentOpacity.value = 1;
      }
    });
  }, [sourceGeometry, progress, contentOpacity]);

  // Start animation once both geometries are known
  useEffect(() => {
    if (sourceGeometry && targetGeometry) {
      progress.value = withSpring(1, { damping, stiffness, mass });
      contentOpacity.value = withDelay(
        contentFadeDelay,
        withTiming(1, {
          duration: contentFadeDuration,
          easing: Easing.out(Easing.ease),
        })
      );
    }
  }, [
    sourceGeometry,
    targetGeometry,
    damping,
    stiffness,
    mass,
    contentFadeDelay,
    contentFadeDuration,
    progress,
    contentOpacity,
  ]);

  // Animated style: morph from source → target
  const heroAnimatedStyle = useAnimatedStyle(() => {
    if (!sourceGeometry || !targetGeometry) {
      return {};
    }

    const p = progress.value;
    const sx = sourceGeometry;
    const tx = targetGeometry;

    // Interpolate position: at p=0 → source position, at p=1 → natural position (translate=0)
    const translateX = sx.pageX * (1 - p) + tx.pageX * p - tx.pageX;
    const translateY = sx.pageY * (1 - p) + tx.pageY * p - tx.pageY;

    // Interpolate scale
    const scaleX = (sx.width * (1 - p) + tx.width * p) / tx.width;
    const scaleY = (sx.height * (1 - p) + tx.height * p) / tx.height;

    return {
      transform: [
        { translateX },
        { translateY },
        { scaleX },
        { scaleY },
      ],
    };
  });

  // Animated style: delayed fade for non-hero content
  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  return {
    heroRef,
    heroAnimatedStyle,
    contentFadeStyle,
    onHeroLayout,
    shouldAnimate: sourceGeometry !== null,
  };
}
