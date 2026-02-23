// =====================================================
// useReducedMotion Hook
// =====================================================
// Subscribes to the system Reduce Motion accessibility
// setting and returns a boolean. Use this to shorten or
// skip non-essential animations while keeping the app
// functional.

import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the user has enabled Reduce Motion
 * in their device accessibility settings.
 *
 * @example
 * const { reduceMotion } = useReducedMotion();
 * if (reduceMotion) {
 *   // Use shorter/no animation
 * }
 */
export function useReducedMotion(): { reduceMotion: boolean } {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Query initial value
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled);
    });

    // Listen for changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduceMotion(enabled);
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return { reduceMotion };
}

export default useReducedMotion;
