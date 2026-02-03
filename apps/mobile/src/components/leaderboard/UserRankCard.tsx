// =====================================================
// UserRankCard Component
// =====================================================
// Sticky bottom card showing current user's rank

import React from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import type { LeaderboardEntry } from '../../types/leaderboard.types';
import RankChangeBadge from './RankChangeBadge';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface UserRankCardProps {
  /** Current user's leaderboard entry (null if not ranked) */
  entry: LeaderboardEntry | null;
  /** Loading state */
  isLoading: boolean;
  /** Press handler */
  onPress?: () => void;
}

// =====================================================
// Constants
// =====================================================

const DEFAULT_AVATAR_BASE = 'https://api.dicebear.com/7.x/initials/png';

// =====================================================
// Component
// =====================================================

export function UserRankCard({
  entry,
  isLoading,
  onPress,
}: UserRankCardProps): React.ReactElement {
  // Not ranked state
  if (!entry && !isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.notRankedSection}>
            <Text style={styles.notRankedTitle}>Not Ranked Yet</Text>
            <Text style={styles.notRankedSubtitle}>
              Complete matches to appear on the leaderboard
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Loading state
  if (isLoading || !entry) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.skeletonRank} />
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonInfo}>
            <View style={styles.skeletonText} />
            <View style={styles.skeletonTextSmall} />
          </View>
          <View style={styles.skeletonScore} />
        </View>
      </View>
    );
  }

  const avatarUri =
    entry.avatarUrl ||
    `${DEFAULT_AVATAR_BASE}?seed=${encodeURIComponent(entry.username)}`;

  const showRankChange = entry.rankChange !== null && entry.rankChange !== 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <View style={styles.labelRow}>
        <Text style={styles.label}>Your Ranking</Text>
        {showRankChange && (
          <RankChangeBadge change={entry.rankChange} size="sm" />
        )}
      </View>

      <View style={styles.content}>
        {/* Rank */}
        <View style={styles.rankSection}>
          <Text style={styles.rankNumber}>#{entry.rank}</Text>
        </View>

        {/* Avatar */}
        <Image source={{ uri: avatarUri }} style={styles.avatar} />

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.username} numberOfLines={1}>
            {entry.username}
          </Text>
          <Text style={styles.stats}>
            {entry.wins}W - {entry.losses}L {'\u2022'}{' '}
            {Math.round(entry.winRate * 100)}%
          </Text>
        </View>

        {/* Score */}
        <View style={styles.scoreSection}>
          <Text style={styles.score}>{entry.score.toLocaleString()}</Text>
          <Text style={styles.scoreLabel}>pts</Text>
        </View>
      </View>
    </Pressable>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderTopWidth: 1,
    borderTopColor: 'rgba(214, 179, 106, 0.12)', // Subtle gold border
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24, // Extra padding for bottom safe area
  },
  containerPressed: {
    backgroundColor: LUXURY_THEME.bg.tertiary,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: LUXURY_THEME.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankSection: {
    width: 50,
  },
  rankNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: LUXURY_THEME.gold.main,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: LUXURY_THEME.bg.tertiary,
  },
  infoSection: {
    flex: 1,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 2,
  },
  stats: {
    fontSize: 12,
    color: LUXURY_THEME.text.muted,
  },
  scoreSection: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  scoreLabel: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
  },
  // Not ranked state
  notRankedSection: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  notRankedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
    marginBottom: 4,
  },
  notRankedSubtitle: {
    fontSize: 13,
    color: LUXURY_THEME.text.muted,
  },
  // Skeleton
  skeletonRank: {
    width: 40,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    marginRight: 12,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 12,
  },
  skeletonInfo: {
    flex: 1,
  },
  skeletonText: {
    width: 100,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    marginBottom: 6,
  },
  skeletonTextSmall: {
    width: 70,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
  },
  skeletonScore: {
    width: 50,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
  },
});

export default UserRankCard;
