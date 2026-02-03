// =====================================================
// BettingEventCard Component - Premium Sportsbook UI
// =====================================================
// Event card with glassmorphism design and gold glow effects.
// Matches premium sportsbook aesthetic.

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, Animated, StyleSheet, Platform, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  SportsEvent,
  formatOdds,
  formatSpread,
  PickType,
  MARKET_TIER_MAP,
  TIER_COIN_COST,
  PickTier,
  MarketType,
} from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';
import { isLive, getEventTimeLabel } from '../../utils/date-helpers';
import { useSlipStore, useIsSlipFull } from '../../stores/slip.store';
import {
  AddPickInput,
  DraftPick,
  DraftPickEventInfo,
  createDraftPick,
  SLIP_MAX_PICKS,
} from '../../types/slip.types';
import { OddsButton } from './OddsButton';

// =====================================================
// Types
// =====================================================

interface BettingEventCardProps {
  event: SportsEvent;
  index?: number;
  existingPicks?: DraftPick[];
  onPickSelect?: (pick: DraftPick) => void;
  onPickRemove?: (pickId: string) => void;
  disabled?: boolean;
  /** User's current tier (0=FREE, 1=STANDARD, 2=PREMIUM, 3=ELITE) */
  userTier?: number;
}

// =====================================================
// Sub-components
// =====================================================

/**
 * Sport badge - premium pill with gold accents
 */
function SportBadge({ sport }: { sport: string }) {
  const sportColors: Record<string, { bg: string; text: string }> = {
    NFL: { bg: 'rgba(22, 163, 74, 0.2)', text: '#22c55e' },
    NBA: { bg: 'rgba(234, 88, 12, 0.2)', text: '#f97316' },
    MLB: { bg: 'rgba(37, 99, 235, 0.2)', text: '#3b82f6' },
    NHL: { bg: 'rgba(71, 85, 105, 0.2)', text: '#94a3b8' },
    SOCCER: { bg: 'rgba(5, 150, 105, 0.2)', text: '#10b981' },
  };

  const colors = sportColors[sport] || { bg: 'rgba(75, 85, 99, 0.2)', text: '#9ca3af' };

  return (
    <View style={[styles.sportBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.sportBadgeText, { color: colors.text }]}>{sport}</Text>
    </View>
  );
}

/**
 * Live indicator with premium gold pulse animation
 */
function LiveIndicator() {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim, opacityAnim]);

  return (
    <View style={styles.liveContainer}>
      <View style={styles.liveDotOuter}>
        <Animated.View
          style={[
            styles.liveDotPulse,
            {
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            },
          ]}
        />
        <View style={styles.liveDotInner} />
      </View>
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

/**
 * Game clock/period display
 */
function GameClock({ status, scheduledAt }: { status: string; scheduledAt: string }) {
  const isLiveGame = isLive(status);
  const timeLabel = getEventTimeLabel(new Date(scheduledAt), status);

  if (isLiveGame) {
    // Mock live game clock - in production, this would come from live data
    return (
      <Text style={styles.gameClock}>Q2 6:14</Text>
    );
  }

  return <Text style={styles.timeText}>{timeLabel}</Text>;
}

// =====================================================
// Main Component
// =====================================================

export function BettingEventCard({
  event,
  index = 0,
  existingPicks,
  onPickSelect,
  onPickRemove,
  disabled = false,
  userTier = 0,
}: BettingEventCardProps): React.ReactElement {
  // Mode Detection
  const useExternalState = existingPicks !== undefined && onPickSelect !== undefined;

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Store
  const storeAddPick = useSlipStore((s) => s.addPick);
  const storeRemovePick = useSlipStore((s) => s.removePick);
  const storePicks = useSlipStore((s) => s.picks);
  const storeIsSlipFull = useIsSlipFull();

  // Unified State
  const picks = useExternalState ? existingPicks : storePicks;
  const isSlipFull = useExternalState
    ? existingPicks.length >= SLIP_MAX_PICKS
    : storeIsSlipFull;

  const eventInfo: DraftPickEventInfo = useMemo(() => ({
    homeTeamName: event.homeTeamName,
    homeTeamAbbr: event.homeTeamAbbr,
    awayTeamName: event.awayTeamName,
    awayTeamAbbr: event.awayTeamAbbr,
    scheduledAt: new Date(event.scheduledAt).toISOString(),
    sport: event.sport,
    league: event.league,
  }), [event]);

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        tension: 80,
        friction: 12,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  const isPickSelected = useCallback(
    (pickType: PickType, selection: string): boolean => {
      return picks.some(
        (p) =>
          p.sportsEventId === event.id &&
          p.pickType === pickType &&
          p.selection === selection
      );
    },
    [picks, event.id]
  );

  const findExistingPick = useCallback(
    (pickType: PickType): DraftPick | null => {
      const existing = picks.find(
        (p) => p.sportsEventId === event.id && p.pickType === pickType
      );
      return existing || null;
    },
    [picks, event.id]
  );

  const handleOddsPress = useCallback(
    (pickType: PickType, selection: string, odds: number, line: number | null) => {
      if (disabled) return;

      const isCurrentlySelected = isPickSelected(pickType, selection);
      const existingPick = findExistingPick(pickType);

      if (useExternalState) {
        if (isCurrentlySelected) {
          const pickToRemove = picks.find(
            (p) =>
              p.sportsEventId === event.id &&
              p.pickType === pickType &&
              p.selection === selection
          );
          if (pickToRemove && onPickRemove) {
            onPickRemove(pickToRemove.id);
          }
        } else {
          const pickInput: AddPickInput = {
            sportsEventId: event.id,
            pickType,
            selection,
            line,
            odds,
            eventInfo,
          };
          const newPick = createDraftPick(pickInput);
          onPickSelect(newPick);
        }
      } else {
        if (isCurrentlySelected) {
          const pickToRemove = picks.find(
            (p) =>
              p.sportsEventId === event.id &&
              p.pickType === pickType &&
              p.selection === selection
          );
          if (pickToRemove) {
            storeRemovePick(pickToRemove.id);
          }
        } else {
          if (existingPick) {
            storeRemovePick(existingPick.id);
          }

          const pickInput: AddPickInput = {
            sportsEventId: event.id,
            pickType,
            selection,
            line,
            odds,
            eventInfo,
          };

          const error = storeAddPick(pickInput);
          if (error) {
            console.warn('[BettingEventCard] Failed to add pick:', error);
          }
        }
      }
    },
    [
      disabled,
      useExternalState,
      event.id,
      eventInfo,
      picks,
      isPickSelected,
      findExistingPick,
      onPickSelect,
      onPickRemove,
      storeAddPick,
      storeRemovePick,
    ]
  );

  // Derived values
  const odds = event.oddsData;
  const eventIsLive = isLive(event.status);
  const isScheduled = event.status.toUpperCase() === 'SCHEDULED';

  const canBetOnPick = (pickType: 'spread' | 'total' | 'moneyline', selection: string): boolean => {
    if (disabled) return false;
    if (!isScheduled) return false;
    if (isPickSelected(pickType, selection)) return true;
    return !isSlipFull;
  };

  const hasSpread = odds?.spread?.away && odds?.spread?.home;
  const hasMoneyline = odds?.moneyline?.away != null && odds?.moneyline?.home != null;
  const hasTotal = odds?.total?.line != null;

  const awayAbbr = event.awayTeamAbbr || event.awayTeamName.substring(0, 3).toUpperCase();
  const homeAbbr = event.homeTeamAbbr || event.homeTeamName.substring(0, 3).toUpperCase();

  // Helper: Check if market is locked based on user tier
  const isMarketLocked = useCallback((marketType: MarketType): boolean => {
    const requiredTier = MARKET_TIER_MAP[marketType];
    // Convert tier numbers: our userTier is 0-3, PickTier enum is 1-4
    return (userTier + 1) < requiredTier;
  }, [userTier]);

  // Helper: Get required tier for a market
  const getRequiredTier = useCallback((marketType: MarketType): number => {
    return MARKET_TIER_MAP[marketType];
  }, []);

  // Helper: Get coin cost for a market
  const getCoinCost = useCallback((marketType: MarketType): number => {
    const requiredTier = MARKET_TIER_MAP[marketType];
    return TIER_COIN_COST[requiredTier as PickTier];
  }, []);

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* Gold Glow Border Effect */}
      <View style={styles.glowBorder}>
        <LinearGradient
          colors={['rgba(212, 175, 55, 0.3)', 'rgba(212, 175, 55, 0.05)', 'rgba(212, 175, 55, 0.3)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Main Card */}
      <View style={[styles.card, eventIsLive && styles.cardLive]}>
        {/* Header Row: Sport Badge + Status | Time */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <SportBadge sport={event.sport} />
            {eventIsLive && <LiveIndicator />}
            {!eventIsLive && event.status.toUpperCase() === 'STARTED' && (
              <View style={styles.startedBadge}>
                <Text style={styles.startedText}>Started</Text>
              </View>
            )}
          </View>
          <GameClock status={event.status} scheduledAt={String(event.scheduledAt)} />
        </View>

        {/* Centered Matchup Section */}
        <View style={styles.matchupSection}>
          <View style={styles.matchupRow}>
            <View style={styles.teamBlock}>
              <Text style={styles.teamAbbr}>{awayAbbr}</Text>
              <Text style={styles.teamLabel}>Away</Text>
            </View>
            <Text style={styles.atText}>at</Text>
            <View style={styles.teamBlock}>
              <Text style={styles.teamAbbr}>{homeAbbr}</Text>
              <Text style={styles.teamLabel}>Home</Text>
            </View>
          </View>
        </View>

        {/* Betting Grid - 3x2 Layout */}
        <View style={styles.oddsGrid}>
          {/* Column Headers */}
          <View style={styles.gridHeaderRow}>
            <View style={styles.gridHeaderCell}>
              <Text style={styles.gridHeaderText}>Spread</Text>
            </View>
            <View style={styles.gridHeaderCell}>
              <Text style={styles.gridHeaderText}>Total</Text>
            </View>
            <View style={styles.gridHeaderCell}>
              <Text style={styles.gridHeaderText}>Money</Text>
            </View>
          </View>

          {/* Away Team Row */}
          <View style={styles.gridRow}>
            <OddsButton
              label={hasSpread ? formatSpread(odds.spread.away.line) : '--'}
              odds={hasSpread ? formatOdds(odds.spread.away.odds) : '--'}
              isSelected={isPickSelected('spread', 'away')}
              disabled={!canBetOnPick('spread', 'away') || !hasSpread}
              onPress={() =>
                hasSpread &&
                handleOddsPress('spread', 'away', odds.spread.away.odds, odds.spread.away.line)
              }
              pickType="spread"
              selection="away"
              locked={isMarketLocked('spread')}
              requiredTier={getRequiredTier('spread')}
              coinCost={getCoinCost('spread')}
            />
            <OddsButton
              label={hasTotal ? `O ${odds.total.line}` : '--'}
              odds={hasTotal ? formatOdds(odds.total.over) : '--'}
              isSelected={isPickSelected('total', 'over')}
              disabled={!canBetOnPick('total', 'over') || !hasTotal}
              onPress={() =>
                hasTotal &&
                handleOddsPress('total', 'over', odds.total.over, odds.total.line)
              }
              pickType="total"
              selection="over"
              locked={isMarketLocked('total')}
              requiredTier={getRequiredTier('total')}
              coinCost={getCoinCost('total')}
            />
            <OddsButton
              label=""
              odds={hasMoneyline ? formatOdds(odds.moneyline.away) : '--'}
              isSelected={isPickSelected('moneyline', 'away')}
              disabled={!canBetOnPick('moneyline', 'away') || !hasMoneyline}
              onPress={() =>
                hasMoneyline &&
                handleOddsPress('moneyline', 'away', odds.moneyline.away, null)
              }
              pickType="moneyline"
              selection="away"
              compact
              locked={isMarketLocked('moneyline')}
              requiredTier={getRequiredTier('moneyline')}
              coinCost={getCoinCost('moneyline')}
            />
          </View>

          {/* Home Team Row */}
          <View style={styles.gridRow}>
            <OddsButton
              label={hasSpread ? formatSpread(odds.spread.home.line) : '--'}
              odds={hasSpread ? formatOdds(odds.spread.home.odds) : '--'}
              isSelected={isPickSelected('spread', 'home')}
              disabled={!canBetOnPick('spread', 'home') || !hasSpread}
              onPress={() =>
                hasSpread &&
                handleOddsPress('spread', 'home', odds.spread.home.odds, odds.spread.home.line)
              }
              pickType="spread"
              selection="home"
              locked={isMarketLocked('spread')}
              requiredTier={getRequiredTier('spread')}
              coinCost={getCoinCost('spread')}
            />
            <OddsButton
              label={hasTotal ? `U ${odds.total.line}` : '--'}
              odds={hasTotal ? formatOdds(odds.total.under) : '--'}
              isSelected={isPickSelected('total', 'under')}
              disabled={!canBetOnPick('total', 'under') || !hasTotal}
              onPress={() =>
                hasTotal &&
                handleOddsPress('total', 'under', odds.total.under, odds.total.line)
              }
              pickType="total"
              selection="under"
              locked={isMarketLocked('total')}
              requiredTier={getRequiredTier('total')}
              coinCost={getCoinCost('total')}
            />
            <OddsButton
              label=""
              odds={hasMoneyline ? formatOdds(odds.moneyline.home) : '--'}
              isSelected={isPickSelected('moneyline', 'home')}
              disabled={!canBetOnPick('moneyline', 'home') || !hasMoneyline}
              onPress={() =>
                hasMoneyline &&
                handleOddsPress('moneyline', 'home', odds.moneyline.home, null)
              }
              pickType="moneyline"
              selection="home"
              compact
              locked={isMarketLocked('moneyline')}
              requiredTier={getRequiredTier('moneyline')}
              coinCost={getCoinCost('moneyline')}
            />
          </View>
        </View>

        {/* View Props Button */}
        <ViewPropsButton eventId={event.id} />
      </View>
    </Animated.View>
  );
}

/**
 * Button to navigate to player props screen
 */
function ViewPropsButton({ eventId }: { eventId: string }) {
  const router = useRouter();

  const handlePress = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/event/${eventId}` as any);
  }, [router, eventId]);

  return (
    <Pressable
      style={styles.viewPropsButton}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="View player props"
    >
      <Text style={styles.viewPropsText}>View Player Props</Text>
      <Text style={styles.viewPropsArrow}>{'>'}</Text>
    </Pressable>
  );
}

// =====================================================
// Styles - Premium Sportsbook Design
// =====================================================

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 16,
    marginHorizontal: 16,
    position: 'relative',
  },
  glowBorder: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 17,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#0D0D0D', // Deep matte black
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.15)', // Subtle gold border
    // Premium shadow
    ...Platform.select({
      ios: {
        shadowColor: LUXURY_THEME.gold.main,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  cardLive: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1.5,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sportBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  sportBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  startedBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  startedText: {
    color: '#eab308',
    fontSize: 10,
    fontWeight: '600',
  },
  timeText: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '500',
  },
  gameClock: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Live Indicator
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDotOuter: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDotPulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
  },
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  // Matchup Section - Centered Layout
  matchupSection: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 8,
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 16,
  },
  teamBlock: {
    alignItems: 'center',
    minWidth: 60,
  },
  teamAbbr: {
    color: LUXURY_THEME.text.primary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  teamLabel: {
    color: LUXURY_THEME.text.muted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  atText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
    fontWeight: '400',
    marginTop: 6,
  },

  // Odds Grid
  oddsGrid: {
    gap: 6,
  },
  gridHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  gridHeaderCell: {
    flex: 1,
    alignItems: 'center',
  },
  gridHeaderText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 6,
  },

  // View Props Button
  viewPropsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.subtle,
  },
  viewPropsText: {
    color: LUXURY_THEME.gold.main,
    fontSize: 13,
    fontWeight: '600',
  },
  viewPropsArrow: {
    color: LUXURY_THEME.gold.main,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default BettingEventCard;
