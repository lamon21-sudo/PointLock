import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../ui/GlassCard';
import { GoldButton } from '../ui/GoldButton';
import { LUXURY_THEME } from '../../constants/theme';

export interface LiveMatchData {
  id: string;
  opponent: string;
  status: string;
  yourPoints: number;
  opponentPoints: number;
  totalPotential?: number;
}

export interface LiveMatchesCarouselProps {
  matches: LiveMatchData[];
  onPressMatch?: (matchId: string) => void;
  loading?: boolean;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  onEmptyStateCTA?: () => void;
  emptyStateCTALabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Live Match Card Internal Component
 */
interface LiveMatchCardProps {
  match: LiveMatchData;
  onPress: () => void;
}

function LiveMatchCard({ match, onPress }: LiveMatchCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const progressPercentage = (match.totalPotential ?? 0) > 0
    ? (match.yourPoints / match.totalPotential!) * 100
    : 0;

  return (
    <GlassCard
      pressable
      onPress={onPress}
      style={styles.matchCard}
    >
      <View style={styles.matchContent}>
        {/* LIVE Badge */}
        <View style={styles.liveBadge}>
          <Animated.View
            style={[
              styles.liveDot,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
          <Text style={styles.liveText}>LIVE</Text>
        </View>

        {/* Points Display */}
        <View style={styles.pointsContainer}>
          <Text style={styles.pointsValue}>{match.yourPoints}</Text>
          <Text style={styles.potentialText}>
            / {match.totalPotential || 0} potential pts
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, progressPercentage)}%` },
            ]}
          />
        </View>

        {/* Opponent Info */}
        <Text style={styles.opponentText} numberOfLines={1}>
          vs {match.opponent}
        </Text>
      </View>
    </GlassCard>
  );
}

/**
 * Live Matches Carousel Component
 * Horizontal scrolling list of active matches with loading and empty states
 */
export function LiveMatchesCarousel({
  matches,
  onPressMatch,
  loading = false,
  emptyStateTitle = 'No Active Matches',
  emptyStateSubtitle = 'Start a match to see it here',
  onEmptyStateCTA,
  emptyStateCTALabel = 'Find Match',
  style,
}: LiveMatchesCarouselProps) {
  // Loading State
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, style]}>
        <ActivityIndicator
          color={LUXURY_THEME.gold.main}
          size="large"
        />
      </View>
    );
  }

  // Empty State
  if (matches.length === 0) {
    return (
      <GlassCard style={[styles.emptyStateCard, style]}>
        <View style={styles.emptyStateContent}>
          <View style={styles.emptyIconContainer}>
            <Ionicons
              name="trophy"
              size={32}
              color={LUXURY_THEME.gold.main}
            />
          </View>
          <Text style={styles.emptyTitle}>{emptyStateTitle}</Text>
          <Text style={styles.emptySubtitle}>{emptyStateSubtitle}</Text>
          {onEmptyStateCTA && (
            <GoldButton
              onPress={onEmptyStateCTA}
              variant="outline"
              size="sm"
              style={styles.emptyCTA}
            >
              {emptyStateCTALabel}
            </GoldButton>
          )}
        </View>
      </GlassCard>
    );
  }

  // Matches List
  return (
    <View style={[styles.container, style]}>
      <FlatList
        data={matches}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <LiveMatchCard
            match={item}
            onPress={() => onPressMatch?.(item.id)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 140,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    gap: 12,
    paddingHorizontal: 2,
  },
  matchCard: {
    width: 160,
  },
  matchContent: {
    padding: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LUXURY_THEME.status.success,
    marginRight: 6,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: LUXURY_THEME.status.success,
    letterSpacing: 0.5,
  },
  pointsContainer: {
    marginBottom: 8,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: '800',
    color: LUXURY_THEME.text.primary,
  },
  potentialText: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
  },
  progressTrack: {
    height: 4,
    backgroundColor: LUXURY_THEME.surface.raised,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: LUXURY_THEME.status.success,
    borderRadius: 2,
  },
  opponentText: {
    fontSize: 12,
    color: LUXURY_THEME.text.secondary,
  },
  emptyStateCard: {
    minHeight: 140,
  },
  emptyStateContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: LUXURY_THEME.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
    maxWidth: 200,
    marginBottom: 16,
  },
  emptyCTA: {
    minWidth: 120,
  },
});

export default LiveMatchesCarousel;
