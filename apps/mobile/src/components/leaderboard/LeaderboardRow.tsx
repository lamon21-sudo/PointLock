// =====================================================
// LeaderboardRow Component
// =====================================================
// Displays a single leaderboard entry with Top 3 medal styling

import React, { memo } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import type { LeaderboardEntry } from '../../types/leaderboard.types';
import { getMedalColor, getMedalEmoji } from '../../types/leaderboard.types';
import RankChangeBadge from './RankChangeBadge';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface LeaderboardRowProps {
  /** Leaderboard entry data */
  entry: LeaderboardEntry;
  /** Whether this row is the current user */
  isCurrentUser: boolean;
  /** Press handler */
  onPress?: (entry: LeaderboardEntry) => void;
}

// =====================================================
// Constants
// =====================================================

export const LEADERBOARD_ROW_HEIGHT = 72;

// Default avatar using DiceBear API
const DEFAULT_AVATAR_BASE = 'https://api.dicebear.com/7.x/initials/png';

// =====================================================
// Component
// =====================================================

function LeaderboardRowComponent({
  entry,
  isCurrentUser,
  onPress,
}: LeaderboardRowProps): React.ReactElement {
  const medalColor = getMedalColor(entry.rank);
  const medalEmoji = getMedalEmoji(entry.rank);
  const isTopThree = entry.rank <= 3;

  const avatarUri =
    entry.avatarUrl ||
    `${DEFAULT_AVATAR_BASE}?seed=${encodeURIComponent(entry.username)}`;

  const showRankChange =
    entry.rankChange !== null && entry.rankChange !== 0;

  return (
    <Pressable
      onPress={() => onPress?.(entry)}
      style={({ pressed }) => [
        styles.container,
        isCurrentUser && styles.containerHighlighted,
        isTopThree && styles.containerTopThree,
        pressed && styles.containerPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${entry.username}, rank ${entry.rank}, ${entry.score} points`}
    >
      {/* Rank Section */}
      <View style={styles.rankContainer}>
        {medalEmoji ? (
          <Text style={styles.medalEmoji}>{medalEmoji}</Text>
        ) : (
          <Text
            style={[styles.rankNumber, medalColor && { color: medalColor }]}
          >
            #{entry.rank}
          </Text>
        )}
      </View>

      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <Image
          source={{ uri: avatarUri }}
          style={[
            styles.avatar,
            isTopThree && medalColor && { borderColor: medalColor, borderWidth: 2 },
          ]}
        />
        {/* Rank change indicator positioned on avatar */}
        {showRankChange && (
          <View style={styles.rankChangeOverlay}>
            <RankChangeBadge change={entry.rankChange} size="sm" />
          </View>
        )}
      </View>

      {/* User Info */}
      <View style={styles.userInfo}>
        <Text
          style={[styles.username, isCurrentUser && styles.usernameHighlighted]}
          numberOfLines={1}
        >
          {entry.username}
          {isCurrentUser && ' (You)'}
        </Text>
        <Text style={styles.stats}>
          {entry.wins}W - {entry.losses}L
          {entry.currentStreak > 0 && (
            <Text style={styles.streak}> {'\u2022'} {'\u{1F525}'} {entry.currentStreak}</Text>
          )}
        </Text>
      </View>

      {/* Score Section */}
      <View style={styles.scoreContainer}>
        <Text style={[styles.score, isTopThree && medalColor && { color: medalColor }]}>
          {entry.score.toLocaleString()}
        </Text>
        <Text style={styles.winRate}>
          {Math.round(entry.winRate * 100)}% win
        </Text>
      </View>
    </Pressable>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: LEADERBOARD_ROW_HEIGHT,
    backgroundColor: LUXURY_THEME.surface.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
  },
  containerHighlighted: {
    backgroundColor: 'rgba(214, 179, 106, 0.1)', // Gold tint
    borderWidth: 1,
    borderColor: LUXURY_THEME.gold.main,
  },
  containerTopThree: {
    backgroundColor: LUXURY_THEME.surface.raised,
  },
  containerPressed: {
    opacity: 0.8,
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: {
    fontSize: 24,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: LUXURY_THEME.text.muted,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: LUXURY_THEME.bg.tertiary,
  },
  rankChangeOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  userInfo: {
    flex: 1,
    marginRight: 12,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 2,
  },
  usernameHighlighted: {
    color: LUXURY_THEME.gold.main,
  },
  stats: {
    fontSize: 12,
    color: LUXURY_THEME.text.muted,
  },
  streak: {
    color: LUXURY_THEME.status.warning,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 2,
  },
  winRate: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
  },
});

// Export memoized for FlatList performance
export const LeaderboardRow = memo(LeaderboardRowComponent);
export default LeaderboardRow;
