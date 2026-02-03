// =====================================================
// PickResultItem Component
// =====================================================
// Extended pick display with result status indicator.
// Used in slip detail view to show settled pick results.

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ApiPickResponse } from '../../services/slip.service';
import { getPickResultColor, PickResultStatus } from '../../types/api-slip.types';

// =====================================================
// Types
// =====================================================

interface PickResultItemProps {
  /** Pick data from API */
  pick: ApiPickResponse;
  /** Whether to show result status indicator */
  showResult?: boolean;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Format pick type for display
 */
function formatPickType(pickType: string): string {
  switch (pickType.toLowerCase()) {
    case 'spread':
      return 'Spread';
    case 'moneyline':
      return 'ML';
    case 'total':
      return 'O/U';
    case 'prop':
      return 'Prop';
    default:
      return pickType;
  }
}

/**
 * Format selection for display
 */
function formatSelection(
  pick: ApiPickResponse
): string {
  const { pickType, selection, line, event } = pick;
  const type = pickType.toLowerCase();

  if (type === 'spread') {
    const teamName =
      selection.toLowerCase() === 'home'
        ? event.homeTeamAbbr || event.homeTeamName
        : event.awayTeamAbbr || event.awayTeamName;
    const lineStr = line !== null ? (line > 0 ? `+${line}` : `${line}`) : '';
    return `${teamName} ${lineStr}`.trim();
  }

  if (type === 'moneyline') {
    return selection.toLowerCase() === 'home'
      ? event.homeTeamAbbr || event.homeTeamName
      : event.awayTeamAbbr || event.awayTeamName;
  }

  if (type === 'total') {
    const direction = selection.toLowerCase() === 'over' ? 'Over' : 'Under';
    return line !== null ? `${direction} ${line}` : direction;
  }

  // Props and others
  if (pick.propPlayerName) {
    return `${pick.propPlayerName} - ${selection}`;
  }

  return selection;
}

/**
 * Format odds for display
 */
function formatOdds(odds: number): string {
  if (odds >= 0) {
    return `+${odds}`;
  }
  return `${odds}`;
}

/**
 * Get result icon based on status
 */
function getResultIcon(status: PickResultStatus | string): string {
  const upperStatus = status.toUpperCase();
  switch (upperStatus) {
    case 'CORRECT':
      return '✓';
    case 'INCORRECT':
      return '✗';
    case 'VOID':
      return '—';
    case 'PENDING':
    default:
      return '•';
  }
}

/**
 * Get result label for accessibility
 */
function getResultLabel(status: PickResultStatus | string): string {
  const upperStatus = status.toUpperCase();
  switch (upperStatus) {
    case 'CORRECT':
      return 'Correct pick';
    case 'INCORRECT':
      return 'Incorrect pick';
    case 'VOID':
      return 'Voided pick';
    case 'PENDING':
    default:
      return 'Pending result';
  }
}

// =====================================================
// Component
// =====================================================

/**
 * PickResultItem - Pick display with result status
 *
 * Features:
 * - Matchup display (team names)
 * - Pick selection with line/spread
 * - Odds display
 * - Point value
 * - Result status indicator (CORRECT/INCORRECT/VOID/PENDING)
 * - Color-coded left border based on result
 * - Score display for completed events
 */
function PickResultItemComponent({
  pick,
  showResult = true,
}: PickResultItemProps): React.ReactElement {
  const { event, pointValue, odds, status } = pick;
  const resultColor = getPickResultColor(status);
  const isVoid = status.toUpperCase() === 'VOID';
  const isSettled = ['CORRECT', 'INCORRECT', 'VOID'].includes(status.toUpperCase());

  // Format matchup
  const matchup = `${event.awayTeamAbbr || event.awayTeamName} @ ${event.homeTeamAbbr || event.homeTeamName}`;

  // Format score if available
  const hasScore = event.homeScore !== null && event.awayScore !== null;
  const scoreText = hasScore ? `${event.awayScore} - ${event.homeScore}` : null;

  return (
    <View
      style={[
        styles.container,
        showResult && { borderLeftColor: resultColor },
        isVoid && styles.containerVoid,
      ]}
      accessibilityLabel={`${formatSelection(pick)} pick, ${getResultLabel(status)}`}
    >
      {/* Result Indicator */}
      {showResult && (
        <View style={[styles.resultIndicator, { backgroundColor: resultColor }]}>
          <Text style={styles.resultIcon}>{getResultIcon(status)}</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* Header: Matchup + Score */}
        <View style={styles.header}>
          <Text style={[styles.matchup, isVoid && styles.textVoid]} numberOfLines={1}>
            {matchup}
          </Text>
          {scoreText && (
            <Text style={styles.score}>{scoreText}</Text>
          )}
        </View>

        {/* Pick Details */}
        <View style={styles.pickRow}>
          {/* Pick Type Badge */}
          <View style={[styles.pickTypeBadge, isVoid && styles.badgeVoid]}>
            <Text style={[styles.pickTypeText, isVoid && styles.textVoid]}>
              {formatPickType(pick.pickType)}
            </Text>
          </View>

          {/* Selection */}
          <Text style={[styles.selection, isVoid && styles.textVoid]} numberOfLines={1}>
            {formatSelection(pick)}
          </Text>
        </View>

        {/* Footer: Odds + Points */}
        <View style={styles.footer}>
          <Text style={[styles.odds, isVoid && styles.textVoid]}>
            {formatOdds(odds)}
          </Text>
          <Text style={[styles.points, isVoid && styles.textVoid]}>
            {isSettled && status.toUpperCase() === 'CORRECT'
              ? `+${pointValue} pts`
              : `${pointValue} pts`}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Memoize for list performance
export const PickResultItem = memo(PickResultItemComponent);

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    padding: 12,
    marginBottom: 10,
  },
  containerVoid: {
    opacity: 0.6,
  },
  resultIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    alignSelf: 'center',
  },
  resultIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchup: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  score: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickTypeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeVoid: {
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
  },
  pickTypeText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
  },
  selection: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  odds: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
  },
  points: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '700',
  },
  textVoid: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
});

export default PickResultItem;
