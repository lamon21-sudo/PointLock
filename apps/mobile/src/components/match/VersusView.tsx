// =====================================================
// VersusView Component
// =====================================================
// Main versus layout for PvP match display.
// Shows side-by-side user scores with stake amount.
//
// Layout:
// ┌─────────────────────────────────────────────┐
// │  [UserScore]    VS    [UserScore]           │
// │   Creator       ⚔️     Opponent             │
// │                5000 RC                       │
// │              (stake)                         │
// ├─────────────────────────────────────────────┤
// │ [LiveTracker: Creator's Picks]              │
// ├─────────────────────────────────────────────┤
// │ [LiveTracker: Opponent's Picks]             │
// └─────────────────────────────────────────────┘

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { UserScore } from './UserScore';
import { LiveTracker } from './LiveTracker';
import type { MatchWithDetails } from '@pick-rivals/shared-types';
import type { ApiSlipResponse } from '../../services/slip.service';
import type { EventScore } from '../../hooks/useMatchSocket';

// =====================================================
// Types
// =====================================================

interface VersusViewProps {
  /** Full match data */
  match: MatchWithDetails;
  /** Current authenticated user ID */
  currentUserId: string;
  /** Live scores from socket */
  liveScores: Map<string, EventScore>;
  /** Full slip data with picks for creator */
  creatorSlip?: ApiSlipResponse | null;
  /** Full slip data with picks for opponent */
  opponentSlip?: ApiSlipResponse | null;
}

// =====================================================
// Component
// =====================================================

export function VersusView({
  match,
  currentUserId,
  liveScores,
  creatorSlip,
  opponentSlip,
}: VersusViewProps): React.ReactElement {
  // Determine winning state
  const winningState = useMemo(() => {
    const creatorPts = match.creatorPoints;
    const opponentPts = match.opponentPoints;

    if (match.status === 'settled') {
      return {
        creatorWinning: match.winnerId === match.creatorId,
        opponentWinning: match.winnerId === match.opponentId,
        isTie: match.winnerId === null && creatorPts === opponentPts,
        creatorIsWinner: match.winnerId === match.creatorId,
        opponentIsWinner: match.winnerId === match.opponentId,
      };
    }

    // During active match
    return {
      creatorWinning: creatorPts > opponentPts,
      opponentWinning: opponentPts > creatorPts,
      isTie: creatorPts === opponentPts,
      creatorIsWinner: false,
      opponentIsWinner: false,
    };
  }, [match]);

  // Check if current user is creator or opponent
  const isCreatorCurrentUser = match.creatorId === currentUserId;
  const isOpponentCurrentUser = match.opponentId === currentUserId;

  // Get slip summaries
  const creatorSlipSummary = match.creatorSlip;
  const opponentSlipSummary = match.opponentSlip;

  // Waiting for opponent state
  const isWaitingForOpponent = !match.opponent;

  return (
    <View style={styles.container}>
      {/* Versus Header */}
      <View style={styles.versusSection}>
        {/* Creator Score */}
        <UserScore
          user={match.creator}
          points={match.creatorPoints}
          pointPotential={creatorSlipSummary?.pointPotential ?? 0}
          pickSummary={{
            correct: creatorSlipSummary?.correctPicks ?? 0,
            total: creatorSlipSummary?.totalPicks ?? 0,
          }}
          isWinning={winningState.creatorWinning}
          isTie={winningState.isTie}
          isSettled={match.status === 'settled'}
          isWinner={winningState.creatorIsWinner}
          position="left"
          isCurrentUser={isCreatorCurrentUser}
        />

        {/* VS Badge with Stake */}
        <View style={styles.vsBadgeContainer}>
          <View style={styles.vsBadge}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.stakeBadge}>
            <Text style={styles.stakeAmount}>
              {match.stakeAmount.toLocaleString()}
            </Text>
            <Text style={styles.stakeCurrency}>RC</Text>
          </View>
        </View>

        {/* Opponent Score or Waiting */}
        {isWaitingForOpponent ? (
          <View style={[styles.waitingContainer, styles.containerRight]}>
            <View style={styles.waitingAvatar}>
              <Text style={styles.waitingIcon}>?</Text>
            </View>
            <Text style={styles.waitingText}>Waiting for{'\n'}opponent</Text>
          </View>
        ) : (
          <UserScore
            user={match.opponent!}
            points={match.opponentPoints}
            pointPotential={opponentSlipSummary?.pointPotential ?? 0}
            pickSummary={{
              correct: opponentSlipSummary?.correctPicks ?? 0,
              total: opponentSlipSummary?.totalPicks ?? 0,
            }}
            isWinning={winningState.opponentWinning}
            isTie={winningState.isTie}
            isSettled={match.status === 'settled'}
            isWinner={winningState.opponentIsWinner}
            position="right"
            isCurrentUser={isOpponentCurrentUser}
          />
        )}
      </View>

      {/* Live Trackers */}
      <View style={styles.trackersSection}>
        {/* Creator's Picks */}
        {creatorSlip && creatorSlip.picks.length > 0 && (
          <LiveTracker
            picks={creatorSlip.picks}
            liveScores={liveScores}
            username={match.creator.displayName || match.creator.username}
            pointsEarned={match.creatorPoints}
            pointPotential={creatorSlipSummary?.pointPotential ?? 0}
            isCurrentUser={isCreatorCurrentUser}
            initialCollapsed={!isCreatorCurrentUser}
          />
        )}

        {/* Opponent's Picks */}
        {opponentSlip && opponentSlip.picks.length > 0 && (
          <LiveTracker
            picks={opponentSlip.picks}
            liveScores={liveScores}
            username={match.opponent?.displayName || match.opponent?.username || 'Opponent'}
            pointsEarned={match.opponentPoints}
            pointPotential={opponentSlipSummary?.pointPotential ?? 0}
            isCurrentUser={isOpponentCurrentUser}
            initialCollapsed={!isOpponentCurrentUser}
          />
        )}

        {/* No slips loaded message */}
        {!creatorSlip && !opponentSlip && (
          <View style={styles.noSlipsContainer}>
            <Text style={styles.noSlipsText}>Loading pick details...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },

  // Versus Section
  versusSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // VS Badge
  vsBadgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    gap: 8,
  },
  vsBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a42',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3a3a52',
  },
  vsText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stakeBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  stakeAmount: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '700',
  },
  stakeCurrency: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: '600',
  },

  // Waiting for Opponent
  waitingContainer: {
    flex: 1,
    backgroundColor: '#1e1e32',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
    borderWidth: 2,
    borderColor: 'rgba(107, 114, 128, 0.3)',
    borderStyle: 'dashed',
  },
  containerRight: {
    marginLeft: 6,
  },
  waitingAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2a2a42',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  waitingIcon: {
    color: '#6b7280',
    fontSize: 24,
    fontWeight: '700',
  },
  waitingText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Trackers Section
  trackersSection: {
    gap: 12,
  },

  // No Slips
  noSlipsContainer: {
    backgroundColor: '#1e1e32',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  noSlipsText: {
    color: '#6b7280',
    fontSize: 14,
  },
});

export default VersusView;
