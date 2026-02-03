import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { SportsEvent, formatOdds, formatSpread } from '@pick-rivals/shared-types';
import { formatEventDate, formatEventTime, isLive } from '../../utils/date-helpers';

interface EventCardProps {
  event: SportsEvent;
  index?: number;
}

/**
 * Individual odds button with proper touch feedback
 * Minimum 44pt touch target with visual feedback
 */
function OddsButton({
  children,
  disabled,
  onPress,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 bg-background rounded-lg py-3 mx-1 ${
        disabled ? 'opacity-40' : 'active:bg-surface-elevated'
      }`}
      style={({ pressed }) => [
        styles.oddsButton,
        pressed && !disabled && styles.oddsButtonPressed,
      ]}
    >
      <Text className="text-white text-center text-sm font-semibold">{children}</Text>
    </Pressable>
  );
}

/**
 * Team logo placeholder - uses sport-based colors when no logo available
 */
function TeamLogo({ sport, abbr }: { sport: string; abbr: string }) {
  // Sport-based color mapping
  const sportColors: Record<string, string> = {
    NFL: 'bg-green-600',
    NBA: 'bg-orange-600',
    MLB: 'bg-blue-600',
    NHL: 'bg-slate-600',
    SOCCER: 'bg-emerald-600',
  };

  const bgColor = sportColors[sport] || 'bg-gray-600';

  return (
    <View className={`w-12 h-12 ${bgColor} rounded-full items-center justify-center`}>
      <Text className="text-white font-bold text-sm">{abbr.substring(0, 3).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Live indicator with pulse animation
 */
function LiveIndicator() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View className="flex-row items-center">
      <Animated.View
        style={[
          styles.liveDot,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      <Text className="text-error font-bold text-xs ml-2">LIVE</Text>
    </View>
  );
}

/**
 * Enhanced Event Card Component
 *
 * Features:
 * - Fade-in animation on mount
 * - Team logo placeholders with sport-based colors
 * - Live game visual distinction with pulse animation
 * - Proper 44pt touch targets on all odds buttons
 * - Score display for live/final games
 * - Defensive odds handling with proper null checks
 */
export function EventCard({ event, index = 0 }: EventCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Stagger animation based on index for smooth list appearance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  const odds = event.oddsData;
  const gameDate = new Date(event.scheduledAt);
  const eventIsLive = isLive(event.status);
  const showScores = event.homeScore !== null && event.awayScore !== null;

  // Defensive odds checks
  const hasSpread = odds?.spread?.away && odds?.spread?.home;
  const hasMoneyline = odds?.moneyline?.away != null && odds?.moneyline?.home != null;
  const hasTotal = odds?.total?.line != null;

  return (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        className={`bg-surface rounded-2xl p-4 mb-3 ${eventIsLive ? 'border-2 border-error/30' : ''}`}
        style={styles.card}
      >
        {/* Header - Sport badge and time/status */}
        <View className="flex-row justify-between items-center mb-4">
          <View className="flex-row items-center">
            <View className="bg-primary/20 px-3 py-1.5 rounded-lg mr-3">
              <Text className="text-primary text-xs font-bold">{event.sport}</Text>
            </View>
            {eventIsLive ? (
              <LiveIndicator />
            ) : (
              <Text className="text-gray-400 text-xs">
                {formatEventDate(gameDate)} • {formatEventTime(gameDate)}
              </Text>
            )}
          </View>
        </View>

        {/* Teams - with logos and scores */}
        <View className="mb-4">
          {/* Away Team */}
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center flex-1">
              <TeamLogo sport={event.sport} abbr={event.awayTeamAbbr || event.awayTeamName} />
              <View className="ml-3 flex-1">
                <Text className="text-white font-bold text-base">
                  {event.awayTeamAbbr || event.awayTeamName}
                </Text>
                <Text className="text-gray-400 text-xs">Away</Text>
              </View>
            </View>
            {showScores && (
              <Text className="text-white font-bold text-2xl ml-2">{event.awayScore}</Text>
            )}
          </View>

          {/* Home Team */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <TeamLogo sport={event.sport} abbr={event.homeTeamAbbr || event.homeTeamName} />
              <View className="ml-3 flex-1">
                <Text className="text-white font-bold text-base">
                  {event.homeTeamAbbr || event.homeTeamName}
                </Text>
                <Text className="text-gray-400 text-xs">Home</Text>
              </View>
            </View>
            {showScores && (
              <Text className="text-white font-bold text-2xl ml-2">{event.homeScore}</Text>
            )}
          </View>
        </View>

        {/* Odds Grid */}
        <View className="border-t border-background pt-3">
          {/* Spread */}
          <View className="flex-row items-center mb-2">
            <Text className="text-gray-400 text-xs font-semibold w-16">Spread</Text>
            <View className="flex-1 flex-row">
              <OddsButton disabled={!hasSpread}>
                {hasSpread
                  ? `${formatSpread(odds.spread.away.line)} (${formatOdds(odds.spread.away.odds)})`
                  : '--'}
              </OddsButton>
              <OddsButton disabled={!hasSpread}>
                {hasSpread
                  ? `${formatSpread(odds.spread.home.line)} (${formatOdds(odds.spread.home.odds)})`
                  : '--'}
              </OddsButton>
            </View>
          </View>

          {/* Moneyline */}
          <View className="flex-row items-center mb-2">
            <Text className="text-gray-400 text-xs font-semibold w-16">Money</Text>
            <View className="flex-1 flex-row">
              <OddsButton disabled={!hasMoneyline}>
                {hasMoneyline ? formatOdds(odds.moneyline.away) : '--'}
              </OddsButton>
              <OddsButton disabled={!hasMoneyline}>
                {hasMoneyline ? formatOdds(odds.moneyline.home) : '--'}
              </OddsButton>
            </View>
          </View>

          {/* Total */}
          <View className="flex-row items-center">
            <Text className="text-gray-400 text-xs font-semibold w-16">Total</Text>
            <View className="flex-1 flex-row">
              <OddsButton disabled={!hasTotal}>
                {hasTotal ? `O ${odds.total.line} (${formatOdds(odds.total.over)})` : '--'}
              </OddsButton>
              <OddsButton disabled={!hasTotal}>
                {hasTotal ? `U ${odds.total.line} (${formatOdds(odds.total.under)})` : '--'}
              </OddsButton>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  oddsButton: {
    // Ensure minimum 44pt touch target
    minHeight: 44,
    minWidth: 44,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  oddsButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
});
