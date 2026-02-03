// =====================================================
// SeasonInfoCard Component
// =====================================================
// Displays season name, status, and live countdown timer.

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SeasonStatus } from '@pick-rivals/shared-types';
import { LUXURY_THEME, GRADIENTS, SHADOWS } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface SeasonInfoCardProps {
  name: string;
  endDate: Date | string;
  status: SeasonStatus;
}

// =====================================================
// Countdown Hook
// =====================================================

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  isUrgent: boolean; // Less than 24 hours remaining
  formatted: string; // "DD:HH:MM" format
}

function useCountdown(endDate: Date | string): CountdownResult {
  const [countdown, setCountdown] = useState<CountdownResult>(() =>
    calculateCountdown(endDate)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(calculateCountdown(endDate));
    }, 1000);

    return () => clearInterval(interval);
  }, [endDate]);

  return countdown;
}

function calculateCountdown(endDate: Date | string): CountdownResult {
  const now = Date.now();
  const end = new Date(endDate).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      isUrgent: false,
      formatted: 'ENDED',
    };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const isUrgent = diff < 24 * 60 * 60 * 1000; // Less than 24 hours

  // Format as DD:HH:MM
  const formatted = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    isUrgent,
    formatted,
  };
}

// =====================================================
// Component
// =====================================================

export function SeasonInfoCard({ name, endDate, status }: SeasonInfoCardProps) {
  const countdown = useCountdown(endDate);

  // Determine status label
  const getStatusLabel = () => {
    switch (status) {
      case SeasonStatus.ACTIVE:
        return countdown.isExpired ? 'ENDED' : 'ACTIVE';
      case SeasonStatus.SCHEDULED:
        return 'COMING SOON';
      case SeasonStatus.ENDED:
        return 'ENDED';
      case SeasonStatus.ARCHIVED:
        return 'ARCHIVED';
      default:
        return status;
    }
  };

  // Determine countdown label
  const getCountdownLabel = () => {
    if (status === SeasonStatus.SCHEDULED) {
      return 'STARTS IN';
    }
    if (countdown.isExpired || status !== SeasonStatus.ACTIVE) {
      return 'SEASON ENDED';
    }
    return 'TIME REMAINING';
  };

  return (
    <LinearGradient
      colors={GRADIENTS.glassCard}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.container}
    >
      {/* Season Name and Status */}
      <View style={styles.header}>
        <Text style={styles.seasonName}>{name}</Text>
        <View
          style={[
            styles.statusBadge,
            status === SeasonStatus.ACTIVE && styles.statusActive,
            status === SeasonStatus.ENDED && styles.statusEnded,
          ]}
        >
          <Text style={styles.statusText}>{getStatusLabel()}</Text>
        </View>
      </View>

      {/* Countdown */}
      <View style={styles.countdownContainer}>
        <Text style={styles.countdownLabel}>{getCountdownLabel()}</Text>
        {status === SeasonStatus.ACTIVE && !countdown.isExpired ? (
          <View style={styles.timerContainer}>
            <Text
              style={[
                styles.countdownValue,
                countdown.isUrgent && styles.countdownUrgent,
              ]}
            >
              {countdown.formatted}
            </Text>
            <Text style={styles.timerFormat}>DD : HH : MM</Text>
          </View>
        ) : (
          <Text style={styles.countdownTBD}>
            {countdown.isExpired ? 'Season has ended' : 'Season end date TBD'}
          </Text>
        )}
      </View>
    </LinearGradient>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: LUXURY_THEME.spacing.borderRadius,
    padding: LUXURY_THEME.spacing.cardPadding,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seasonName: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: LUXURY_THEME.surface.raised,
  },
  statusActive: {
    backgroundColor: 'rgba(63, 208, 143, 0.15)',
  },
  statusEnded: {
    backgroundColor: 'rgba(255, 92, 108, 0.15)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: LUXURY_THEME.gold.brushed,
    letterSpacing: 1.2,
  },
  countdownContainer: {
    alignItems: 'center',
  },
  countdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  timerContainer: {
    alignItems: 'center',
  },
  countdownValue: {
    fontSize: 36,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  countdownUrgent: {
    color: LUXURY_THEME.status.error,
  },
  timerFormat: {
    fontSize: 10,
    fontWeight: '500',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 3,
    marginTop: 4,
  },
  countdownTBD: {
    fontSize: 16,
    fontWeight: '500',
    color: LUXURY_THEME.text.secondary,
  },
});

export default SeasonInfoCard;
