// =====================================================
// PickItem Component
// =====================================================
// Reusable pick card for displaying individual picks.
// Extracted and enhanced from review.tsx PickCard.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DraftPick } from '../../types/slip.types';
import { formatOdds, formatSpread, formatPropType } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';
import { getRiskColor } from '../../utils/risk-classification';

// =====================================================
// Types
// =====================================================

interface PickItemProps {
  /** The pick to display */
  pick: DraftPick;
  /** Optional remove handler */
  onRemove?: () => void;
  /** Show remove button (default: true) */
  showRemove?: boolean;
  /** Compact mode - smaller padding, single line layout */
  compact?: boolean;
  /** Whether this pick has a validation error */
  isInvalid?: boolean;
  /** The validation error message to display */
  invalidReason?: string;
  /** Show risk indicator rail (default: true) */
  showRiskIndicator?: boolean;
  /** Show coin cost row (default: true) */
  showCoinCost?: boolean;
}

// =====================================================
// Component
// =====================================================

/**
 * PickItem - Individual pick display card
 *
 * Features:
 * - Shows matchup, selection, odds, and point value
 * - Pick type badge with color coding
 * - Optional remove button with 44pt touch target
 * - Compact mode for list views
 * - Accessible labels for screen readers
 */
export function PickItem({
  pick,
  onRemove,
  showRemove = true,
  compact = false,
  isInvalid = false,
  invalidReason,
  showRiskIndicator = true,
  showCoinCost = true,
}: PickItemProps): React.ReactElement {
  // =====================================================
  // Helper Functions
  // =====================================================

  // Get market badge label
  const getMarketBadgeLabel = (): string => {
    switch (pick.pickType) {
      case 'moneyline':
        return 'ML';
      case 'spread':
        return 'SPREAD';
      case 'total':
        return 'O/U';
      case 'prop':
        return formatPropType(pick.propType || '').toUpperCase();
    }
  };

  // Get primary display name (player for props, team for others)
  const getPrimaryName = (): string => {
    if (pick.pickType === 'prop' && pick.propPlayerName) {
      return pick.propPlayerName;
    }
    if (pick.selection === 'home') {
      return pick.eventInfo.homeTeamName;
    }
    if (pick.selection === 'away') {
      return pick.eventInfo.awayTeamName;
    }
    // For totals, show matchup
    return `${pick.eventInfo.awayTeamAbbr || pick.eventInfo.awayTeamName} @ ${pick.eventInfo.homeTeamAbbr || pick.eventInfo.homeTeamName}`;
  };

  const getSelectionLabel = (): string => {
    const { pickType, selection, line } = pick;

    if (pickType === 'moneyline') {
      return selection === 'home'
        ? pick.eventInfo.homeTeamAbbr || pick.eventInfo.homeTeamName
        : pick.eventInfo.awayTeamAbbr || pick.eventInfo.awayTeamName;
    }

    if (pickType === 'spread') {
      const teamName =
        selection === 'home'
          ? pick.eventInfo.homeTeamAbbr || pick.eventInfo.homeTeamName
          : pick.eventInfo.awayTeamAbbr || pick.eventInfo.awayTeamName;
      return `${teamName} ${line !== null ? formatSpread(line) : ''}`;
    }

    if (pickType === 'total') {
      return `${selection.toUpperCase()} ${line}`;
    }

    // Prop bet
    if (pickType === 'prop' && pick.propPlayerName) {
      const propTypeLabel = pick.propType ? formatPropType(pick.propType) : '';
      return `${pick.propPlayerName} ${propTypeLabel} ${selection.toUpperCase()} ${line}`;
    }

    return selection;
  };

  // =====================================================
  // Render
  // =====================================================

  // Determine if we should show the risk rail (not when invalid)
  const showRiskRail = showRiskIndicator && !isInvalid;
  const riskColor = getRiskColor(pick.odds);

  return (
    <View
      style={[
        styles.container,
        compact && styles.containerCompact,
        isInvalid && styles.containerInvalid,
      ]}
    >
      {/* Risk Rail - Left edge color indicator */}
      {showRiskRail && (
        <View style={[styles.riskRail, { backgroundColor: riskColor }]} />
      )}

      {/* Main Content */}
      <View style={[styles.pickInfo, showRiskRail && styles.contentWithRail]}>
        {/* Header Row: Primary Name + Market Badge */}
        <View style={styles.headerRow}>
          <Text style={styles.primaryName} numberOfLines={1}>
            {getPrimaryName()}
          </Text>
          <View style={styles.marketBadge}>
            <Text style={styles.marketBadgeText}>{getMarketBadgeLabel()}</Text>
          </View>
        </View>

        {/* Details Row: Selection + Odds */}
        <View style={styles.detailsRow}>
          <Text style={styles.selectionText} numberOfLines={1}>
            {getSelectionLabel()}
          </Text>
          <Text style={styles.oddsText}>{formatOdds(pick.odds)}</Text>
        </View>

        {/* Values Row: Coin Cost + Points */}
        <View style={styles.valuesRow}>
          {/* Coin Cost */}
          {showCoinCost && pick.coinCost > 0 && (
            <View style={styles.valueItem}>
              <Ionicons name="ellipse" size={12} color={LUXURY_THEME.gold.brushed} />
              <Text style={styles.coinCostText}>{pick.coinCost}</Text>
            </View>
          )}

          {/* Points Value */}
          <View style={styles.valueItem}>
            <Ionicons name="star" size={12} color="#22c55e" />
            <Text style={styles.pointsText}>{pick.pointValue} pts</Text>
          </View>
        </View>

        {/* Validation Error Message */}
        {isInvalid && invalidReason && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{invalidReason}</Text>
          </View>
        )}
      </View>

      {/* Remove Button */}
      {showRemove && onRemove && (
        <Pressable
          onPress={onRemove}
          style={({ pressed }) => [
            styles.removeButton,
            pressed && styles.removeButtonPressed,
          ]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${getSelectionLabel()} pick`}
        >
          <Text style={styles.removeButtonText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    overflow: 'hidden', // For risk rail
  },
  containerCompact: {
    padding: 10,
    minHeight: 60,
  },
  containerInvalid: {
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  // Risk rail - left edge color indicator
  riskRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  // Main content container
  pickInfo: {
    flex: 1,
  },
  // Add left padding when risk rail is shown
  contentWithRail: {
    paddingLeft: 10,
  },
  // Header Row: Primary Name + Market Badge
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  primaryName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.2,
  },
  // Market badge (gold tinted)
  marketBadge: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  marketBadgeText: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Details Row: Selection + Odds
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  selectionText: {
    color: '#A3A3A3',
    fontSize: 13,
    flex: 1,
  },
  oddsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Values Row: Coin + Points
  valuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  coinCostText: {
    color: LUXURY_THEME.gold.brushed,
    fontSize: 13,
    fontWeight: '600',
  },
  pointsText: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
  },
  // Error display
  errorContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  // Remove button
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    minWidth: 44, // Accessibility - ensure 44pt touch target
    minHeight: 44,
  },
  removeButtonPressed: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    transform: [{ scale: 0.96 }],
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default PickItem;
