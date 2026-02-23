// =====================================================
// Haptics Service — Semantic Haptic Feedback Engine
// =====================================================
// Provides a semantic API for triggering haptic feedback
// tied to meaningful app events. Maps event names to
// platform-specific expo-haptics calls with throttling,
// enable/disable, and graceful degradation.
//
// Usage:
//   import { Haptics } from '../services/haptics.service';
//   Haptics.trigger('pick-selected');
//   Haptics.trigger('slip-lockin-close');

import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

// =====================================================
// Types
// =====================================================

export type HapticEvent =
  // Pick interactions
  | 'pick-selected'
  | 'pick-deselected'
  | 'pick-underdog-selected'
  // Lock-in ceremony (4 phases)
  | 'slip-lockin-prepare'
  | 'slip-lockin-close'
  | 'slip-lockin-reverb'
  | 'slip-lockin-stamp'
  // Settlement outcomes
  | 'settlement-win'
  | 'settlement-loss'
  | 'settlement-push'
  // Social / rank
  | 'rival-matched'
  | 'rank-updated'
  // Optional gated
  | 'countdown-tick';

export const HAPTIC_EVENTS: HapticEvent[] = [
  'pick-selected',
  'pick-deselected',
  'pick-underdog-selected',
  'slip-lockin-prepare',
  'slip-lockin-close',
  'slip-lockin-reverb',
  'slip-lockin-stamp',
  'settlement-win',
  'settlement-loss',
  'settlement-push',
  'rival-matched',
  'rank-updated',
  'countdown-tick',
];

export interface HapticsConfig {
  /** Override platform-specific behavior per event */
  platformOverrides?: Partial<Record<HapticEvent, () => Promise<void>>>;
  /** Global intensity scale (0-1). Reserved for future use. */
  intensityScale?: number;
  /** Enable countdown-tick haptic (default: false) */
  countdownTickEnabled?: boolean;
}

// =====================================================
// Platform Mapping
// =====================================================

type HapticAction = () => Promise<void>;

interface PlatformMapping {
  ios: HapticAction;
  android: HapticAction;
  throttleMs: number;
}

const { ImpactFeedbackStyle, NotificationFeedbackType } = ExpoHaptics;

const PLATFORM_MAP: Record<HapticEvent, PlatformMapping> = {
  // ---- Pick interactions ----
  'pick-selected': {
    ios: () => ExpoHaptics.selectionAsync(),
    android: () => ExpoHaptics.selectionAsync(),
    throttleMs: 50,
  },
  'pick-deselected': {
    ios: () => ExpoHaptics.selectionAsync(),
    android: () => ExpoHaptics.selectionAsync(),
    throttleMs: 50,
  },
  'pick-underdog-selected': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium),
    android: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium),
    throttleMs: 50,
  },

  // ---- Lock-in ceremony ----
  'slip-lockin-prepare': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Light),
    android: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Light),
    throttleMs: 0,
  },
  'slip-lockin-close': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Heavy),
    android: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Heavy),
    throttleMs: 0,
  },
  'slip-lockin-reverb': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium),
    android: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Light),
    throttleMs: 0,
  },
  'slip-lockin-stamp': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Light),
    android: () => ExpoHaptics.selectionAsync(),
    throttleMs: 0,
  },

  // ---- Settlement outcomes ----
  'settlement-win': {
    ios: () => tripleImpactPulse(),
    android: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Success),
    throttleMs: 5000,
  },
  'settlement-loss': {
    ios: () => ExpoHaptics.notificationAsync(NotificationFeedbackType.Error),
    android: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Error),
    throttleMs: 5000,
  },
  'settlement-push': {
    ios: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Warning),
    android: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Warning),
    throttleMs: 5000,
  },

  // ---- Social / rank ----
  'rival-matched': {
    ios: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Success),
    android: () =>
      ExpoHaptics.notificationAsync(NotificationFeedbackType.Success),
    throttleMs: 2000,
  },
  'rank-updated': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium),
    android: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium),
    throttleMs: 2000,
  },

  // ---- Optional gated ----
  'countdown-tick': {
    ios: () => ExpoHaptics.impactAsync(ImpactFeedbackStyle.Light),
    android: () => ExpoHaptics.selectionAsync(),
    throttleMs: 1000,
  },
};

// =====================================================
// Helpers
// =====================================================

/**
 * iOS-only triple ascending impact pulse for settlement wins.
 * Fires 3 medium impacts spaced 60ms apart.
 */
function tripleImpactPulse(): Promise<void> {
  return new Promise<void>((resolve) => {
    ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium).catch(() => {});
    setTimeout(() => {
      if (!_enabled) { resolve(); return; }
      ExpoHaptics.impactAsync(ImpactFeedbackStyle.Medium).catch(() => {});
    }, 60);
    setTimeout(() => {
      if (!_enabled) { resolve(); return; }
      ExpoHaptics.impactAsync(ImpactFeedbackStyle.Heavy).catch(() => {});
      resolve();
    }, 120);
  });
}

// =====================================================
// Singleton State
// =====================================================

let _enabled = true;
let _config: HapticsConfig = {};
const _lastFiredMap = new Map<HapticEvent, number>();

// Auto-disable in test environments
if (
  typeof process !== 'undefined' &&
  (process as any).env?.EXPO_PUBLIC_DISABLE_HAPTICS === 'true'
) {
  _enabled = false;
}

// =====================================================
// Public API
// =====================================================

export const Haptics = {
  /**
   * Trigger a semantic haptic event.
   * Respects enabled state, throttle limits, and platform mapping.
   * Silently no-ops if haptics are disabled or unavailable.
   */
  trigger(event: HapticEvent): void {
    if (!_enabled) return;

    // Gate countdown-tick behind config
    if (event === 'countdown-tick' && !_config.countdownTickEnabled) return;

    const mapping = PLATFORM_MAP[event];
    if (!mapping) return;

    // Resolve action: check for platform overrides first
    const override = _config.platformOverrides?.[event];
    const platformKey = Platform.OS === 'ios' ? 'ios' : 'android';
    const action = override ?? mapping[platformKey];

    // Throttle check — stamp timestamp BEFORE invoking action so that
    // a synchronous double-call (e.g. toast + modal in same tick)
    // sees the stamp and deduplicates correctly.
    if (mapping.throttleMs > 0) {
      const now = Date.now();
      const lastFired = _lastFiredMap.get(event) ?? 0;
      if (now - lastFired < mapping.throttleMs) return;
      _lastFiredMap.set(event, now);
    }

    // Fire and forget — never let haptics crash the app
    try {
      action().catch((err) => {
        if (__DEV__) {
          console.warn(`[Haptics] Failed to fire "${event}":`, err);
        }
      });
    } catch (err) {
      if (__DEV__) {
        console.warn(`[Haptics] Sync error for "${event}":`, err);
      }
    }
  },

  /** Enable or disable all haptic feedback globally. */
  setEnabled(value: boolean): void {
    _enabled = value;
  },

  /** Check if haptics are currently enabled. */
  isEnabled(): boolean {
    return _enabled;
  },

  /**
   * Configure haptics behavior.
   * Call once at app startup or from a settings screen.
   */
  configure(config: HapticsConfig): void {
    _config = { ..._config, ...config };
  },

  /** Get the current configuration. */
  getConfig(): Readonly<HapticsConfig> {
    return _config;
  },

  /**
   * Reset throttle timestamps. Useful for testing.
   * @internal
   */
  _resetThrottles(): void {
    _lastFiredMap.clear();
  },

  /**
   * Get the throttle duration for an event. Useful for testing.
   * @internal
   */
  _getThrottleMs(event: HapticEvent): number {
    return PLATFORM_MAP[event]?.throttleMs ?? 0;
  },
};

export default Haptics;
