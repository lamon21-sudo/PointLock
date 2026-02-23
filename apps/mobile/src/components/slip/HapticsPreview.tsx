// =====================================================
// HapticsPreview — Dev-Only Haptics Testing Component
// =====================================================
// Provides buttons to trigger every semantic haptic event
// and preview the PointLock ceremony animation.
// Gated behind __DEV__ — stripped from production builds.
//
// Usage:
//   {__DEV__ && <HapticsPreview />}

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { Haptics, HAPTIC_EVENTS, type HapticEvent } from '../../services/haptics.service';
import { LUXURY_THEME } from '../../constants/theme';
import { PointLockMoment } from './PointLockMoment';

// =====================================================
// Constants
// =====================================================

// Group events for display
const EVENT_GROUPS: { title: string; events: HapticEvent[] }[] = [
  {
    title: 'Pick Interactions',
    events: ['pick-selected', 'pick-deselected', 'pick-underdog-selected'],
  },
  {
    title: 'Lock-In Ceremony',
    events: [
      'slip-lockin-prepare',
      'slip-lockin-close',
      'slip-lockin-reverb',
      'slip-lockin-stamp',
    ],
  },
  {
    title: 'Settlement',
    events: ['settlement-win', 'settlement-loss', 'settlement-push'],
  },
  {
    title: 'Social / Rank',
    events: ['rival-matched', 'rank-updated'],
  },
  {
    title: 'Optional',
    events: ['countdown-tick'],
  },
];

// =====================================================
// Component
// =====================================================

export function HapticsPreview() {
  const [isEnabled, setIsEnabled] = useState(Haptics.isEnabled());
  const [showCeremony, setShowCeremony] = useState(false);
  const [lastFired, setLastFired] = useState<string | null>(null);

  const handleToggleEnabled = useCallback((value: boolean) => {
    Haptics.setEnabled(value);
    setIsEnabled(value);
  }, []);

  const handleTrigger = useCallback((event: HapticEvent) => {
    Haptics._resetThrottles(); // Reset throttles so dev can test repeatedly
    Haptics.trigger(event);
    setLastFired(event);
  }, []);

  const handleCeremonyComplete = useCallback(() => {
    setShowCeremony(false);
  }, []);

  if (!__DEV__) return null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.title}>Haptics Preview</Text>
        <Text style={styles.subtitle}>Tap to trigger each haptic event</Text>

        {/* Enable toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Haptics Enabled</Text>
          <Switch
            value={isEnabled}
            onValueChange={handleToggleEnabled}
            trackColor={{ false: '#3a3a4e', true: LUXURY_THEME.gold.depth }}
            thumbColor={isEnabled ? LUXURY_THEME.gold.brushed : '#6b7280'}
          />
        </View>

        {/* Last fired indicator */}
        {lastFired && (
          <View style={styles.lastFiredRow}>
            <Text style={styles.lastFiredLabel}>Last fired:</Text>
            <Text style={styles.lastFiredValue}>{lastFired}</Text>
          </View>
        )}

        {/* Event groups */}
        {EVENT_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.events.map((event) => (
              <Pressable
                key={event}
                style={({ pressed }) => [
                  styles.eventButton,
                  pressed && styles.eventButtonPressed,
                ]}
                onPress={() => handleTrigger(event)}
              >
                <Text style={styles.eventButtonText}>{event}</Text>
                <Text style={styles.throttleText}>
                  {Haptics._getThrottleMs(event)}ms
                </Text>
              </Pressable>
            ))}
          </View>
        ))}

        {/* Ceremony preview */}
        <View style={styles.group}>
          <Text style={styles.groupTitle}>Full Ceremony</Text>
          <Pressable
            style={({ pressed }) => [
              styles.ceremonyButton,
              pressed && styles.ceremonyButtonPressed,
            ]}
            onPress={() => setShowCeremony(true)}
          >
            <Text style={styles.ceremonyButtonText}>Play PointLock Moment</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Ceremony overlay */}
      <PointLockMoment
        visible={showCeremony}
        onComplete={handleCeremonyComplete}
      />
    </View>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: LUXURY_THEME.text.primary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: LUXURY_THEME.surface.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleLabel: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  lastFiredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  lastFiredLabel: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
  },
  lastFiredValue: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  group: {
    marginBottom: 20,
  },
  groupTitle: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  eventButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: LUXURY_THEME.surface.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.muted,
  },
  eventButtonPressed: {
    backgroundColor: LUXURY_THEME.surface.elevated,
    borderColor: LUXURY_THEME.gold.border,
  },
  eventButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  throttleText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  ceremonyButton: {
    backgroundColor: LUXURY_THEME.gold.depth,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ceremonyButtonPressed: {
    backgroundColor: LUXURY_THEME.gold.brushed,
  },
  ceremonyButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default HapticsPreview;
