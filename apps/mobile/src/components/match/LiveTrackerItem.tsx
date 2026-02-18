// =====================================================
// LiveTrackerItem Component
// =====================================================
// Displays a single pick with status, matchup, and live score.
// Includes animations for status changes and score updates.
//
// Features:
// - Status icon with color coding
// - Live score overlay when available
// - Flash animation on score change
// - Scale animation on status change
// - 44pt minimum touch target

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Platform } from 'react-native';
import { getPickStatusConfig } from './pick-status.config';
import { AppIcon } from '../ui/AppIcon';
import type { ApiPickResponse } from '../../services/slip.service';
import type { EventScore } from '../../hooks/useMatchSocket';
import { formatOdds, formatSpread } from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

interface LiveTrackerItemProps {
  /** The pick data with event info */
  pick: ApiPickResponse;
  /** Real-time score from socket (optional) */
  liveScore?: EventScore;
  /** Whether to show compact layout */
  compact?: boolean;
}

// =====================================================
// Component
// =====================================================

export function LiveTrackerItem({
  pick,
  liveScore,
  compact = false,
}: LiveTrackerItemProps): React.ReactElement {
  const statusConfig = getPickStatusConfig(pick.status);

  // Animation refs
  const statusScaleAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Track previous values for change detection
  const prevStatusRef = useRef(pick.status);
  const prevScoreRef = useRef<{ home: number; away: number } | null>(null);

  // =====================================================
  // Status Change Animation
  // =====================================================

  useEffect(() => {
    if (prevStatusRef.current !== pick.status) {
      prevStatusRef.current = pick.status;

      // Bounce animation: scale up then settle
      Animated.sequence([
        Animated.spring(statusScaleAnim, {
          toValue: 1.15,
          useNativeDriver: true,
          tension: 200,
          friction: 8,
        }),
        Animated.spring(statusScaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 120,
          friction: 10,
        }),
      ]).start();
    }
  }, [pick.status, statusScaleAnim]);

  // =====================================================
  // Score Update Flash Animation
  // =====================================================

  useEffect(() => {
    if (!liveScore) return;

    const currentScore = { home: liveScore.homeScore, away: liveScore.awayScore };
    const prevScore = prevScoreRef.current;

    const scoreChanged =
      prevScore &&
      (prevScore.home !== currentScore.home || prevScore.away !== currentScore.away);

    if (scoreChanged) {
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: false,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: false,
        }),
      ]).start();
    }

    prevScoreRef.current = currentScore;
  }, [liveScore, flashAnim]);

  // Interpolate flash background
  const flashBgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', 'rgba(34, 197, 94, 0.2)'],
  });

  // =====================================================
  // Selection Label
  // =====================================================

  const getSelectionLabel = (): string => {
    const { pickType, selection, line } = pick;
    const event = pick.event;

    if (pickType === 'moneyline') {
      return selection === 'home'
        ? event.homeTeamAbbr || event.homeTeamName
        : event.awayTeamAbbr || event.awayTeamName;
    }

    if (pickType === 'spread') {
      const teamName =
        selection === 'home'
          ? event.homeTeamAbbr || event.homeTeamName
          : event.awayTeamAbbr || event.awayTeamName;
      return `${teamName} ${line !== null ? formatSpread(line) : ''}`;
    }

    if (pickType === 'total') {
      return `${selection.toUpperCase()} ${line}`;
    }

    // Prop bet
    if (pickType === 'prop' && pick.propPlayerName) {
      return `${pick.propPlayerName} ${selection.toUpperCase()} ${line}`;
    }

    return selection;
  };

  // =====================================================
  // Render
  // =====================================================

  const event = pick.event;
  const isLive = liveScore?.status === 'LIVE';

  return (
    <Animated.View
      style={[
        styles.container,
        compact && styles.containerCompact,
        { backgroundColor: flashBgColor },
      ]}
    >
      {/* Status Icon */}
      <Animated.View
        style={[
          styles.statusBadge,
          { backgroundColor: statusConfig.backgroundColor },
          { transform: [{ scale: statusScaleAnim }] },
        ]}
        accessibilityLabel={`Status: ${statusConfig.label}`}
      >
        <AppIcon name={statusConfig.iconName} size={16} color={statusConfig.color} />
      </Animated.View>

      {/* Pick Info */}
      <View style={styles.pickInfo}>
        {/* Matchup */}
        <Text style={[styles.matchup, compact && styles.matchupCompact]} numberOfLines={1}>
          {event.awayTeamAbbr || event.awayTeamName} @ {event.homeTeamAbbr || event.homeTeamName}
        </Text>

        {/* Selection */}
        <Text style={[styles.selection, compact && styles.selectionCompact]} numberOfLines={1}>
          {getSelectionLabel()}
        </Text>

        {/* Pick Type + Odds + Points */}
        <View style={styles.metaRow}>
          <View style={styles.pickTypeBadge}>
            <Text style={styles.pickTypeText}>{pick.pickType.toUpperCase()}</Text>
          </View>
          <Text style={styles.odds}>{formatOdds(pick.odds)}</Text>
          <Text style={[styles.points, { color: statusConfig.color }]}>
            {pick.pointValue} pts
          </Text>
        </View>
      </View>

      {/* Live Score (if available) */}
      {liveScore && (
        <View style={styles.liveScoreContainer}>
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
            </View>
          )}
          <View style={styles.scoreBox}>
            <Text style={styles.scoreTeam}>{event.awayTeamAbbr || 'AWY'}</Text>
            <Text style={styles.scoreValue}>{liveScore.awayScore}</Text>
          </View>
          <Text style={styles.scoreSeparator}>-</Text>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreValue}>{liveScore.homeScore}</Text>
            <Text style={styles.scoreTeam}>{event.homeTeamAbbr || 'HOM'}</Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 12,
    minHeight: 72,
    gap: 12,
  },
  containerCompact: {
    padding: 10,
    minHeight: 60,
    gap: 10,
  },

  // Status Badge
  statusBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  // Pick Info
  pickInfo: {
    flex: 1,
    gap: 2,
  },
  matchup: {
    color: '#9ca3af',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  matchupCompact: {
    fontSize: 10,
  },
  selection: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  selectionCompact: {
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pickTypeBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pickTypeText: {
    color: '#818cf8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  odds: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  points: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Live Score
  liveScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  liveBadge: {
    marginRight: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  scoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreTeam: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '500',
  },
  scoreValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 20,
    textAlign: 'center',
  },
  scoreSeparator: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
  },
});

export default LiveTrackerItem;
