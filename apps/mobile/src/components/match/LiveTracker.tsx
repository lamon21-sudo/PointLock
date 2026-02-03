// =====================================================
// LiveTracker Component
// =====================================================
// Displays a list of picks for one user's slip with status tracking.
// Shows progress bar for points earned vs potential.
//
// Features:
// - Header with username and points
// - Progress bar visualization
// - Collapsible pick list
// - Integration with LiveTrackerItem

import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { LiveTrackerItem } from './LiveTrackerItem';
import type { ApiPickResponse } from '../../services/slip.service';
import type { EventScore } from '../../hooks/useMatchSocket';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =====================================================
// Types
// =====================================================

interface LiveTrackerProps {
  /** Array of picks to display */
  picks: ApiPickResponse[];
  /** Map of live scores by eventId from useMatchSocket */
  liveScores: Map<string, EventScore>;
  /** User display name for header */
  username: string;
  /** Total points earned so far */
  pointsEarned: number;
  /** Total point potential */
  pointPotential: number;
  /** Whether this is the current user's slip */
  isCurrentUser?: boolean;
  /** Initial collapsed state */
  initialCollapsed?: boolean;
}

// =====================================================
// Component
// =====================================================

export function LiveTracker({
  picks,
  liveScores,
  username,
  pointsEarned,
  pointPotential,
  isCurrentUser = false,
  initialCollapsed = false,
}: LiveTrackerProps): React.ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  // Calculate pick summary
  const pickSummary = useMemo(() => {
    const hit = picks.filter((p) => p.status === 'HIT').length;
    const miss = picks.filter((p) => p.status === 'MISS').length;
    const pending = picks.filter((p) => p.status === 'PENDING').length;
    return { hit, miss, pending, total: picks.length };
  }, [picks]);

  // Progress percentage
  const progressPercentage = pointPotential > 0 ? (pointsEarned / pointPotential) * 100 : 0;

  // Toggle collapse with animation
  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsCollapsed(!isCollapsed);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${username}'s picks. ${isCollapsed ? 'Expand' : 'Collapse'}`}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.username} numberOfLines={1}>
            {isCurrentUser ? 'Your Picks' : `${username}'s Picks`}
          </Text>
          <View style={styles.pickSummary}>
            <Text style={styles.pickSummaryText}>
              <Text style={styles.pickCountHit}>{pickSummary.hit}</Text>
              <Text style={styles.pickCountDivider}>/</Text>
              <Text>{pickSummary.total}</Text>
              {pickSummary.pending > 0 && (
                <Text style={styles.pendingCount}> ({pickSummary.pending} pending)</Text>
              )}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.pointsEarned}>{pointsEarned}</Text>
          <Text style={styles.pointsPotential}>/ {pointPotential} pts</Text>
          <Text style={styles.chevron}>{isCollapsed ? '\u25BC' : '\u25B2'}</Text>
        </View>
      </Pressable>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(progressPercentage, 100)}%` },
            ]}
          />
        </View>
      </View>

      {/* Pick List */}
      {!isCollapsed && (
        <View style={styles.pickList}>
          {picks.map((pick) => (
            <LiveTrackerItem
              key={pick.id}
              pick={pick}
              liveScore={liveScores.get(pick.sportsEventId)}
              compact
            />
          ))}
        </View>
      )}

      {/* Collapsed Summary */}
      {isCollapsed && picks.length > 0 && (
        <View style={styles.collapsedSummary}>
          <Text style={styles.collapsedText}>
            {pickSummary.hit > 0 && (
              <Text style={styles.hitText}>{pickSummary.hit} won</Text>
            )}
            {pickSummary.hit > 0 && pickSummary.miss > 0 && <Text> \u2022 </Text>}
            {pickSummary.miss > 0 && (
              <Text style={styles.missText}>{pickSummary.miss} lost</Text>
            )}
            {(pickSummary.hit > 0 || pickSummary.miss > 0) && pickSummary.pending > 0 && (
              <Text> \u2022 </Text>
            )}
            {pickSummary.pending > 0 && (
              <Text style={styles.pendingText}>{pickSummary.pending} pending</Text>
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    minHeight: 56,
  },
  headerPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  username: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pickSummary: {
    flexDirection: 'row',
  },
  pickSummaryText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  pickCountHit: {
    color: '#22c55e',
    fontWeight: '600',
  },
  pickCountDivider: {
    color: '#6b7280',
  },
  pendingCount: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  pointsEarned: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pointsPotential: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  chevron: {
    color: '#6b7280',
    fontSize: 10,
    marginLeft: 8,
  },

  // Progress Bar
  progressContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(107, 114, 128, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 2,
  },

  // Pick List
  pickList: {
    padding: 10,
    paddingTop: 0,
    gap: 8,
  },

  // Collapsed Summary
  collapsedSummary: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  collapsedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  hitText: {
    color: '#22c55e',
    fontWeight: '500',
  },
  missText: {
    color: '#ef4444',
    fontWeight: '500',
  },
  pendingText: {
    color: '#9ca3af',
  },
});

export default LiveTracker;
