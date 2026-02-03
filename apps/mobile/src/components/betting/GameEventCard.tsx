// =====================================================
// GameEventCard Component
// =====================================================
// Event card using the GameEvent domain schema.
// Renders the 3x2 odds grid with integrated slip state.

import React, { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import {
  GameEvent,
  OddSelection,
  MarketType,
  SelectionType,
  formatOddsDisplay,
  formatLineDisplay,
} from '../../types/domain';
import { useSlipStore } from '../../stores/slip.store';
import { AddPickInput, DraftPickEventInfo } from '../../types/slip.types';
import { OddsButton } from './OddsButton';

// =====================================================
// Types
// =====================================================

interface GameEventCardProps {
  event: GameEvent;
  index?: number;
}

// =====================================================
// Sub-components
// =====================================================

/**
 * Team logo placeholder with sport-based colors
 */
function TeamLogo({ sport, abbr }: { sport: string; abbr: string }) {
  const sportColors: Record<string, string> = {
    NFL: '#16a34a',
    NBA: '#ea580c',
    MLB: '#2563eb',
    NHL: '#475569',
    SOCCER: '#059669',
    UFC: '#dc2626',
    NCAAF: '#16a34a',
    NCAAB: '#ea580c',
  };

  const bgColor = sportColors[sport] || '#4b5563';

  return (
    <View style={[styles.teamLogo, { backgroundColor: bgColor }]}>
      <Text style={styles.teamLogoText}>{abbr.substring(0, 3)}</Text>
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
          toValue: 1.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.liveContainer}>
      <Animated.View
        style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]}
      />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

/**
 * GameEventCard - Premium event card for slip building
 *
 * Uses the GameEvent domain schema for clean type safety.
 *
 * Features:
 * - Integrated OddsButton grid (Spread, Total, Moneyline)
 * - Connected to Zustand slip store
 * - Automatic swap logic (selecting new pick removes conflicting one)
 * - Staggered fade-in animation
 * - Live event visual distinction
 * - Minimum 44pt touch targets on all buttons
 */
export function GameEventCard({ event, index = 0 }: GameEventCardProps): React.ReactElement {
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  // Slip store - use atomic swapOrAddPick to prevent race conditions
  const swapOrAddPick = useSlipStore((s) => s.swapOrAddPick);
  const removePick = useSlipStore((s) => s.removePick);
  const picks = useSlipStore((s) => s.picks);
  const isProcessing = useSlipStore((s) => s._isProcessing);

  // Debounce state to prevent rapid tapping exploits
  const [isDebouncing, setIsDebouncing] = useState(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Memoize event info for pick creation
  const eventInfo: DraftPickEventInfo = useMemo(
    () => ({
      homeTeamName: event.homeTeam.name,
      homeTeamAbbr: event.homeTeam.abbreviation,
      awayTeamName: event.awayTeam.name,
      awayTeamAbbr: event.awayTeam.abbreviation,
      scheduledAt: event.startTime,
      sport: event.sport,
      league: event.sport,
    }),
    [event]
  );

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        delay: index * 40,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        delay: index * 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index]);

  // Check if a specific selection is in the slip
  const isSelectionInSlip = useCallback(
    (marketType: MarketType, selectionType: SelectionType): boolean => {
      // Map to pick type format used in slip store
      const pickType = marketType;
      const selection = selectionType;

      return picks.some(
        (p) =>
          p.sportsEventId === event.id &&
          p.pickType === pickType &&
          p.selection === selection
      );
    },
    [picks, event.id]
  );

  // Find existing pick for this event and market type
  const findExistingPick = useCallback(
    (marketType: MarketType): string | null => {
      const existing = picks.find(
        (p) => p.sportsEventId === event.id && p.pickType === marketType
      );
      return existing?.id || null;
    },
    [picks, event.id]
  );

  // Handle odds button press with atomic swap logic and debouncing
  const handleSelectionPress = useCallback(
    (selection: OddSelection) => {
      // Prevent rapid tapping - debounce for 150ms
      if (isDebouncing || isProcessing) {
        return;
      }

      // Set debounce lock
      setIsDebouncing(true);
      debounceTimeoutRef.current = setTimeout(() => {
        setIsDebouncing(false);
      }, 150);

      const isCurrentlySelected = isSelectionInSlip(
        selection.marketType,
        selection.selectionType
      );

      if (isCurrentlySelected) {
        // Toggle off - find and remove the pick
        const existingPickId = picks.find(
          (p) =>
            p.sportsEventId === event.id &&
            p.pickType === selection.marketType &&
            p.selection === selection.selectionType
        )?.id;

        if (existingPickId) {
          removePick(existingPickId);
        }
      } else {
        // Use atomic swapOrAddPick - handles removal + addition in single operation
        const existingPickId = findExistingPick(selection.marketType);

        const pickInput: AddPickInput = {
          sportsEventId: event.id,
          pickType: selection.marketType,
          selection: selection.selectionType,
          line: selection.point ?? null,
          odds: selection.price,
          eventInfo,
        };

        // Atomic operation: removes conflicting pick (if any) and adds new pick
        const error = swapOrAddPick(pickInput, existingPickId ?? undefined);
        if (error) {
          console.warn('[GameEventCard] Failed to add pick:', error);
        }
      }
    },
    [event.id, eventInfo, picks, isSelectionInSlip, findExistingPick, swapOrAddPick, removePick, isDebouncing, isProcessing, setIsDebouncing]
  );

  // Derived values - use uppercase to match Prisma enum values
  const isLive = event.status.toUpperCase() === 'LIVE';
  const canBet = event.status.toUpperCase() === 'SCHEDULED';
  const hasMarkets = event.markets !== null;

  // Format start time
  const startTimeDisplay = useMemo(() => {
    const date = new Date(event.startTime);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [event.startTime]);

  // Render an odds button for a selection
  const renderOddsButton = (
    selection: OddSelection | null,
    labelOverride?: string
  ) => {
    if (!selection) {
      return (
        <OddsButton
          label="--"
          odds="--"
          isSelected={false}
          disabled={true}
          onPress={() => {}}
          pickType="moneyline"
          selection="home"
        />
      );
    }

    const isSelected = isSelectionInSlip(selection.marketType, selection.selectionType);
    let label = labelOverride || '';

    // Generate label based on market type
    if (!labelOverride) {
      if (selection.marketType === 'spread' && selection.point !== undefined) {
        label = formatLineDisplay(selection.point, 'spread');
      } else if (selection.marketType === 'total' && selection.point !== undefined) {
        const prefix = selection.selectionType === 'over' ? 'O' : 'U';
        label = `${prefix} ${selection.point}`;
      }
    }

    return (
      <OddsButton
        label={label}
        odds={formatOddsDisplay(selection.price)}
        isSelected={isSelected}
        disabled={!canBet}
        onPress={() => handleSelectionPress(selection)}
        pickType={selection.marketType}
        selection={selection.selectionType}
        compact={selection.marketType === 'moneyline'}
      />
    );
  };

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
      <View style={[styles.card, isLive && styles.cardLive]}>
        {/* Header - Sport badge + Time/Status */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.sportBadge}>
              <Text style={styles.sportBadgeText}>{event.sport}</Text>
            </View>
            {isLive ? <LiveIndicator /> : <Text style={styles.timeText}>{startTimeDisplay}</Text>}
          </View>
          {event.score && (
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreText}>
                {event.score.away} - {event.score.home}
              </Text>
            </View>
          )}
        </View>

        {/* Teams Row */}
        <View style={styles.teamsSection}>
          {/* Away Team */}
          <View style={styles.teamRow}>
            <TeamLogo sport={event.sport} abbr={event.awayTeam.abbreviation} />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName} numberOfLines={1}>
                {event.awayTeam.abbreviation}
              </Text>
              <Text style={styles.teamLabel}>Away</Text>
            </View>
          </View>

          {/* Home Team */}
          <View style={[styles.teamRow, styles.teamRowHome]}>
            <TeamLogo sport={event.sport} abbr={event.homeTeam.abbreviation} />
            <View style={styles.teamInfo}>
              <Text style={styles.teamName} numberOfLines={1}>
                {event.homeTeam.abbreviation}
              </Text>
              <Text style={styles.teamLabel}>Home</Text>
            </View>
          </View>
        </View>

        {/* Odds Grid - 3 columns */}
        <View style={styles.oddsSection}>
          {/* Column Headers */}
          <View style={styles.oddsHeader}>
            <Text style={styles.oddsHeaderText}>SPREAD</Text>
            <Text style={styles.oddsHeaderText}>TOTAL</Text>
            <Text style={styles.oddsHeaderText}>MONEY</Text>
          </View>

          {/* Away Row */}
          <View style={styles.oddsRow}>
            {renderOddsButton(event.markets?.spread.away ?? null)}
            {renderOddsButton(event.markets?.total.over ?? null)}
            {renderOddsButton(event.markets?.moneyline.away ?? null)}
          </View>

          {/* Home Row */}
          <View style={styles.oddsRow}>
            {renderOddsButton(event.markets?.spread.home ?? null)}
            {renderOddsButton(event.markets?.total.under ?? null)}
            {renderOddsButton(event.markets?.moneyline.home ?? null)}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 12,
    marginHorizontal: 16,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  cardLive: {
    borderWidth: 2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sportBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 10,
  },
  sportBadgeText: {
    color: '#818cf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },
  scoreContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6,
  },
  liveText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  teamsSection: {
    marginBottom: 14,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamRowHome: {
    marginBottom: 0,
  },
  teamLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  teamInfo: {
    marginLeft: 10,
    flex: 1,
  },
  teamName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  teamLabel: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 1,
  },
  oddsSection: {
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
    paddingTop: 12,
  },
  oddsHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  oddsHeaderText: {
    flex: 1,
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  oddsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
});

export default GameEventCard;
