// =====================================================
// Haptics Service — Unit Tests
// =====================================================
// Tests for the semantic haptics mapping engine.
// Verifies event→platform mapping, throttle, enable/disable,
// and configuration gating.

import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';
import { Haptics, HAPTIC_EVENTS, type HapticEvent } from '../services/haptics.service';

// =====================================================
// Mocks
// =====================================================

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationFeedbackType: {
    Success: 'Success',
    Error: 'Error',
    Warning: 'Warning',
  },
}));

// =====================================================
// Helpers
// =====================================================

function clearAllMocks() {
  (ExpoHaptics.selectionAsync as jest.Mock).mockClear();
  (ExpoHaptics.impactAsync as jest.Mock).mockClear();
  (ExpoHaptics.notificationAsync as jest.Mock).mockClear();
}

// =====================================================
// Tests
// =====================================================

describe('Haptics Service', () => {
  beforeEach(() => {
    clearAllMocks();
    Haptics.setEnabled(true);
    Haptics._resetThrottles();
    Haptics.configure({ countdownTickEnabled: false });
  });

  // ---- Enable / Disable ----

  describe('setEnabled / isEnabled', () => {
    it('starts enabled by default', () => {
      expect(Haptics.isEnabled()).toBe(true);
    });

    it('can be disabled', () => {
      Haptics.setEnabled(false);
      expect(Haptics.isEnabled()).toBe(false);
    });

    it('does not fire any haptic when disabled', () => {
      Haptics.setEnabled(false);
      Haptics.trigger('pick-selected');
      Haptics.trigger('slip-lockin-close');
      Haptics.trigger('settlement-win');

      expect(ExpoHaptics.selectionAsync).not.toHaveBeenCalled();
      expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
      expect(ExpoHaptics.notificationAsync).not.toHaveBeenCalled();
    });

    it('re-enables correctly', () => {
      Haptics.setEnabled(false);
      Haptics.setEnabled(true);
      Haptics.trigger('pick-selected');

      expect(ExpoHaptics.selectionAsync).toHaveBeenCalled();
    });
  });

  // ---- iOS Platform Mapping ----

  describe('iOS platform mapping', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('pick-selected fires selectionAsync', () => {
      Haptics.trigger('pick-selected');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('pick-deselected fires selectionAsync', () => {
      Haptics.trigger('pick-deselected');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('pick-underdog-selected fires impactAsync(Medium)', () => {
      Haptics.trigger('pick-underdog-selected');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Medium');
    });

    it('slip-lockin-prepare fires impactAsync(Light)', () => {
      Haptics.trigger('slip-lockin-prepare');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Light');
    });

    it('slip-lockin-close fires impactAsync(Heavy)', () => {
      Haptics.trigger('slip-lockin-close');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Heavy');
    });

    it('slip-lockin-reverb fires impactAsync(Medium)', () => {
      Haptics.trigger('slip-lockin-reverb');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Medium');
    });

    it('slip-lockin-stamp fires impactAsync(Light)', () => {
      Haptics.trigger('slip-lockin-stamp');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Light');
    });

    it('settlement-win fires triple impactAsync (3 calls)', async () => {
      jest.useFakeTimers();
      Haptics.trigger('settlement-win');

      // First impact fires immediately
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(1);

      // Advance through the setTimeout chain
      jest.advanceTimersByTime(60);
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(60);
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    it('settlement-loss fires notificationAsync(Error)', () => {
      Haptics.trigger('settlement-loss');
      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledWith('Error');
    });

    it('settlement-push fires notificationAsync(Warning)', () => {
      Haptics.trigger('settlement-push');
      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledWith('Warning');
    });

    it('rival-matched fires notificationAsync(Success)', () => {
      Haptics.trigger('rival-matched');
      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledWith('Success');
    });

    it('rank-updated fires impactAsync(Medium)', () => {
      Haptics.trigger('rank-updated');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Medium');
    });
  });

  // ---- Android Platform Mapping ----

  describe('Android platform mapping', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it('pick-selected fires selectionAsync', () => {
      Haptics.trigger('pick-selected');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('slip-lockin-reverb fires impactAsync(Light) on Android', () => {
      Haptics.trigger('slip-lockin-reverb');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Light');
    });

    it('slip-lockin-stamp fires selectionAsync on Android', () => {
      Haptics.trigger('slip-lockin-stamp');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('settlement-win fires notificationAsync(Success) on Android (not triple pulse)', () => {
      Haptics.trigger('settlement-win');
      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledWith('Success');
      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Throttling ----

  describe('throttle', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('throttles pick-selected within 50ms window', () => {
      Haptics.trigger('pick-selected');
      Haptics.trigger('pick-selected');
      Haptics.trigger('pick-selected');

      // Only the first call should fire
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);
    });

    it('allows pick-selected after throttle window expires', () => {
      jest.useFakeTimers();

      Haptics.trigger('pick-selected');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(51);
      Haptics.trigger('pick-selected');
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('does not throttle lock-in ceremony events (throttleMs = 0)', () => {
      Haptics.trigger('slip-lockin-prepare');
      Haptics.trigger('slip-lockin-close');
      Haptics.trigger('slip-lockin-reverb');
      Haptics.trigger('slip-lockin-stamp');

      // All four should fire — impactAsync for prepare, close, reverb
      // plus selectionAsync would be iOS stamp but stamp is impactAsync(Light)
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledTimes(4);
    });

    it('throttles settlement events at 5000ms', () => {
      Haptics.trigger('settlement-loss');
      Haptics.trigger('settlement-loss');

      expect(ExpoHaptics.notificationAsync).toHaveBeenCalledTimes(1);
    });

    it('different event types have independent throttles', () => {
      Haptics.trigger('pick-selected');
      Haptics.trigger('pick-deselected');

      // Both should fire since they're different events
      expect(ExpoHaptics.selectionAsync).toHaveBeenCalledTimes(2);
    });
  });

  // ---- countdown-tick gating ----

  describe('countdown-tick gating', () => {
    it('does not fire countdown-tick when not enabled', () => {
      Haptics.trigger('countdown-tick');
      expect(ExpoHaptics.impactAsync).not.toHaveBeenCalled();
      expect(ExpoHaptics.selectionAsync).not.toHaveBeenCalled();
    });

    it('fires countdown-tick when enabled via configure', () => {
      (Platform as any).OS = 'ios';
      Haptics.configure({ countdownTickEnabled: true });
      Haptics.trigger('countdown-tick');
      expect(ExpoHaptics.impactAsync).toHaveBeenCalledWith('Light');
    });
  });

  // ---- configure ----

  describe('configure', () => {
    it('returns config via getConfig', () => {
      Haptics.configure({ intensityScale: 0.5 });
      expect(Haptics.getConfig().intensityScale).toBe(0.5);
    });

    it('merges config incrementally', () => {
      Haptics.configure({ intensityScale: 0.5 });
      Haptics.configure({ countdownTickEnabled: true });
      const config = Haptics.getConfig();
      expect(config.intensityScale).toBe(0.5);
      expect(config.countdownTickEnabled).toBe(true);
    });

    it('supports platformOverrides', () => {
      (Platform as any).OS = 'ios';
      const customAction = jest.fn().mockResolvedValue(undefined);
      Haptics.configure({
        platformOverrides: { 'pick-selected': customAction },
      });

      Haptics.trigger('pick-selected');
      expect(customAction).toHaveBeenCalledTimes(1);
      expect(ExpoHaptics.selectionAsync).not.toHaveBeenCalled();
    });
  });

  // ---- Graceful degradation ----

  describe('graceful degradation', () => {
    it('does not throw when expo-haptics rejects', () => {
      (Platform as any).OS = 'ios';
      (ExpoHaptics.selectionAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Haptics not available')
      );

      // Should not throw
      expect(() => Haptics.trigger('pick-selected')).not.toThrow();
    });
  });

  // ---- HAPTIC_EVENTS array ----

  describe('HAPTIC_EVENTS', () => {
    it('contains all expected events', () => {
      const expected: HapticEvent[] = [
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
      expect(HAPTIC_EVENTS).toEqual(expected);
    });
  });
});
