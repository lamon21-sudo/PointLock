// =====================================================
// PickFeedItem Component
// =====================================================
// Displays a single pick in the combined progress feed.
// Shows owner identification, status, and pick details.
//
// Features:
// - Owner dot color (green=you, red=opponent)
// - Status badge with icon
// - Market badge (ML/SPREAD/O-U/PROP)
// - Flash animation on status change
// - Scale bounce on update

import React, { memo, useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { getPickStatusConfig } from './pick-status.config';
import { formatOdds, formatSpread } from '@pick-rivals/shared-types';
import type { CombinedPick } from '../../utils/pick-feed';
import type { EventScore } from '../../hooks/useMatchSocket';

// =====================================================
// Types
// =====================================================

interface PickFeedItemProps {
  /** The combined pick data with owner info */
  pick: CombinedPick;
  /** Real-time score from socket (optional) */
  liveScore?: EventScore;
  /** Whether to trigger flash animation (status just changed) */
  shouldFlash?: boolean;
}

// =====================================================
// Constants
// =====================================================

const USER_COLOR = '#22c55e';
const OPPONENT_COLOR = '#ef4444';

// =====================================================
// Component
// =====================================================

function PickFeedItemComponent({
  pick,
  liveScore,
  shouldFlash = false,
}: PickFeedItemProps): React.ReactElement {
  const statusConfig = getPickStatusConfig(pick.status);

  // Animation refs
  const flashAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // =====================================================
  // Flash Animation
  // =====================================================

  useEffect(() => {
    if (shouldFlash) {
      // Flash background
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: false,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]).start();

      // Scale bounce
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.02,
          useNativeDriver: true,
          tension: 200,
          friction: 8,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 120,
          friction: 10,
        }),
      ]).start();
    }
  }, [shouldFlash, flashAnim, scaleAnim]);

  // Interpolate flash background color
  const flashBgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', 'rgba(34, 197, 94, 0.25)'],
  });

  // =====================================================
  // Helper Functions
  // =====================================================

  const getMarketBadge = (): string => {
    switch (pick.pickType) {
      case 'moneyline':
        return 'ML';
      case 'spread':
        return 'SPREAD';
      case 'total':
        return 'O/U';
      case 'prop':
        return 'PROP';
      default:
        return pick.pickType.toUpperCase();
    }
  };

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

  const ownerColor = pick.owner === 'user' ? USER_COLOR : OPPONENT_COLOR;
  const isLive = liveScore?.status === 'LIVE';

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: flashBgColor, transform: [{ scale: scaleAnim }] }]}
    >
      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusConfig.backgroundColor }]}>
        <Text style={[styles.statusIcon, { color: statusConfig.color }]}>{statusConfig.icon}</Text>
      </View>

      {/* Pick Info */}
      <View style={styles.pickInfo}>
        {/* Owner Row */}
        <View style={styles.ownerRow}>
          <View style={[styles.ownerDot, { backgroundColor: ownerColor }]} />
          <Text style={styles.ownerName}>{pick.ownerName}</Text>
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Selection */}
        <Text style={styles.selection} numberOfLines={1}>
          {getSelectionLabel()}
        </Text>

        {/* Meta Row: Market + Points */}
        <View style={styles.metaRow}>
          <View style={styles.marketBadge}>
            <Text style={styles.marketText}>{getMarketBadge()}</Text>
          </View>
          <Text style={styles.odds}>{formatOdds(pick.odds)}</Text>
          <Text style={[styles.points, { color: statusConfig.color }]}>
            {pick.status === 'HIT' ? '+' : ''}
            {pick.pointValue} pts
          </Text>
        </View>
      </View>

      {/* Matchup (compact) */}
      <View style={styles.matchupContainer}>
        <Text style={styles.matchupText} numberOfLines={1}>
          {pick.event.awayTeamAbbr || pick.event.awayTeamName.substring(0, 3)}
        </Text>
        <Text style={styles.matchupAt}>@</Text>
        <Text style={styles.matchupText} numberOfLines={1}>
          {pick.event.homeTeamAbbr || pick.event.homeTeamName.substring(0, 3)}
        </Text>
      </View>
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
    gap: 12,
  },

  // Status Badge
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Pick Info
  pickInfo: {
    flex: 1,
    gap: 2,
  },

  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ownerName: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22c55e',
  },
  liveText: {
    color: '#22c55e',
    fontSize: 9,
    fontWeight: '700',
  },

  selection: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  marketBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  marketText: {
    color: '#818cf8',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  odds: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  points: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Matchup
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f0f23',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  matchupText: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '600',
  },
  matchupAt: {
    color: '#4b5563',
    fontSize: 9,
  },
});

// =====================================================
// Memoization
// =====================================================

/**
 * Custom comparison for PickFeedItem to prevent unnecessary re-renders.
 * Only re-render when meaningful props change.
 */
function arePropsEqual(
  prev: PickFeedItemProps,
  next: PickFeedItemProps
): boolean {
  // Always re-render if flash state changes
  if (prev.shouldFlash !== next.shouldFlash) return false;

  // Re-render if pick data changes
  if (prev.pick.id !== next.pick.id) return false;
  if (prev.pick.status !== next.pick.status) return false;
  if (prev.pick.pointValue !== next.pick.pointValue) return false;

  // Re-render if live score status changes
  if (prev.liveScore?.status !== next.liveScore?.status) return false;

  return true;
}

export const PickFeedItem = memo(PickFeedItemComponent, arePropsEqual);
export default PickFeedItem;
