// =====================================================
// UserScore Component
// =====================================================
// Displays a user's avatar, points, and pick summary.
// Used in VersusView for side-by-side comparison.
//
// Features:
// - Avatar with initials fallback
// - Prominent points display
// - Pick summary (x/y correct)
// - Winning highlight with glow animation
// - Winner crown for settled matches

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Image } from 'react-native';
import { AnimatedPointsChange } from './AnimatedPointsChange';

// =====================================================
// Types
// =====================================================

interface UserData {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface UserScoreProps {
  /** User data */
  user: UserData;
  /** Current points */
  points: number;
  /** Point potential */
  pointPotential: number;
  /** Pick summary */
  pickSummary: { correct: number; total: number };
  /** Whether this user is currently winning */
  isWinning: boolean;
  /** Whether this is a tie */
  isTie?: boolean;
  /** Match is settled - show final styling */
  isSettled?: boolean;
  /** This user won the match */
  isWinner?: boolean;
  /** Position: left or right side of versus view */
  position: 'left' | 'right';
  /** Whether this is the current authenticated user */
  isCurrentUser?: boolean;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get initials from username or display name.
 */
function getInitials(user: UserData): string {
  const name = user.displayName || user.username;
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// =====================================================
// Component
// =====================================================

export function UserScore({
  user,
  points,
  pointPotential,
  pickSummary,
  isWinning,
  isTie = false,
  isSettled = false,
  isWinner = false,
  position,
  isCurrentUser = false,
}: UserScoreProps): React.ReactElement {
  // Glow animation for winning state
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isWinning && !isSettled) {
      // Continuous pulse for live winning state
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1200,
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else if (isWinner && isSettled) {
      // Static glow for winner
      glowAnim.setValue(1);
    } else {
      glowAnim.setValue(0);
    }
  }, [isWinning, isSettled, isWinner, glowAnim]);

  // Interpolate shadow for glow effect
  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  // Determine border color
  const borderColor = isWinner
    ? '#22c55e'
    : isWinning && !isTie
    ? '#22c55e'
    : isTie
    ? '#eab308'
    : 'transparent';

  return (
    <Animated.View
      style={[
        styles.container,
        position === 'left' ? styles.containerLeft : styles.containerRight,
        isWinning || isWinner
          ? {
              shadowColor: '#22c55e',
              shadowOpacity,
              shadowRadius: 12,
              elevation: 8,
            }
          : null,
        { borderColor, borderWidth: isWinning || isWinner || isTie ? 2 : 0 },
      ]}
    >
      {/* Winner Crown */}
      {isWinner && isSettled && (
        <View style={styles.crownContainer}>
          <Text style={styles.crown}>{'\uD83D\uDC51'}</Text>
        </View>
      )}

      {/* Avatar */}
      <View
        style={[
          styles.avatarContainer,
          isCurrentUser && styles.avatarContainerCurrentUser,
        ]}
      >
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{getInitials(user)}</Text>
          </View>
        )}
      </View>

      {/* Username */}
      <Text style={styles.username} numberOfLines={1}>
        {isCurrentUser ? 'You' : user.displayName || user.username}
      </Text>

      {/* Points */}
      <AnimatedPointsChange
        points={points}
        size="lg"
        color={
          isWinner || (isWinning && !isTie) ? '#22c55e' : '#ffffff'
        }
      />
      <Text style={styles.pointsLabel}>points</Text>

      {/* Pick Summary */}
      <View style={styles.pickSummary}>
        <Text style={styles.pickSummaryText}>
          <Text style={styles.pickCorrect}>{pickSummary.correct}</Text>
          <Text style={styles.pickDivider}>/</Text>
          <Text>{pickSummary.total}</Text>
        </Text>
        <Text style={styles.pickLabel}>picks hit</Text>
      </View>

      {/* Point Potential */}
      <Text style={styles.potential}>
        {pointPotential} max
      </Text>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e32',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  containerLeft: {
    marginRight: 6,
  },
  containerRight: {
    marginLeft: 6,
  },

  // Crown
  crownContainer: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
  },
  crown: {
    fontSize: 24,
  },

  // Avatar
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarContainerCurrentUser: {
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },

  // Username
  username: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '100%',
  },

  // Points
  points: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 4,
  },
  pointsWinning: {
    color: '#22c55e',
  },
  pointsWinner: {
    color: '#22c55e',
  },
  pointsLabel: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
  },

  // Pick Summary
  pickSummary: {
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(107, 114, 128, 0.2)',
    width: '100%',
  },
  pickSummaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  pickCorrect: {
    color: '#22c55e',
  },
  pickDivider: {
    color: '#6b7280',
  },
  pickLabel: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },

  // Potential
  potential: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
});

export default UserScore;
