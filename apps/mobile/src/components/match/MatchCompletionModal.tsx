// =====================================================
// MatchCompletionModal Component
// =====================================================
// Full-screen overlay shown when a match completes.
// Displays winner/loser/draw states with animations.
//
// Features:
// - Winner/loser/draw visual states
// - Animated score reveal
// - Pick summary display
// - Payout information

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import AppIcon from '../ui/AppIcon';

// =====================================================
// Types
// =====================================================

interface UserData {
  id: string;
  username: string;
  displayName: string | null;
}

interface SlipSummary {
  totalPicks: number;
  correctPicks: number;
  pointsEarned: number;
  pointPotential: number;
}

interface MatchData {
  id: string;
  status: string;
  creatorId: string;
  opponentId: string | null;
  winnerId: string | null;
  creatorPoints: number;
  opponentPoints: number;
  stakeAmount: number;
  totalPot?: number | null;
  winnerPayout?: number | null;
  rakeAmount?: number | null;
  /** Settlement reason for tie-breaker info */
  settlementReason?: string | null;
}

interface MatchCompletionModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Match data */
  match: MatchData;
  /** Current authenticated user ID */
  currentUserId: string;
  /** Creator user data */
  creator?: UserData;
  /** Opponent user data */
  opponent?: UserData | null;
  /** Creator's slip summary */
  creatorSlip?: SlipSummary | null;
  /** Opponent's slip summary */
  opponentSlip?: SlipSummary | null;
  /** Called when modal is dismissed */
  onDismiss: () => void;
  /** Called when user wants to play again */
  onPlayAgain?: () => void;
  /** Called when user wants to view match details */
  onViewDetails?: () => void;
  /** Called when user wants to go back to home */
  onBackToHome?: () => void;
}

// =====================================================
// Constants
// =====================================================

type ResultType = 'win' | 'loss' | 'draw';

const RESULT_CONFIG: Record<
  ResultType,
  {
    title: string;
    subtitle: string;
    iconName: string;
    backgroundColor: string;
    accentColor: string;
  }
> = {
  win: {
    title: 'Victory!',
    subtitle: 'You won the match!',
    iconName: 'Trophy',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    accentColor: '#22c55e',
  },
  loss: {
    title: 'Defeat',
    subtitle: 'Better luck next time',
    iconName: 'SmileyMeh',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    accentColor: '#ef4444',
  },
  draw: {
    title: "It's a Draw!",
    subtitle: 'Stakes have been returned',
    iconName: 'Handshake',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    accentColor: '#eab308',
  },
};

// =====================================================
// Component
// =====================================================

export function MatchCompletionModal({
  visible,
  match,
  currentUserId,
  creator,
  opponent,
  creatorSlip,
  opponentSlip,
  onDismiss,
  onPlayAgain,
  onViewDetails,
  onBackToHome,
}: MatchCompletionModalProps): React.ReactElement {
  // Determine result for current user
  const isCreator = match.creatorId === currentUserId;
  const userPoints = isCreator ? match.creatorPoints : match.opponentPoints;
  const opponentPoints = isCreator ? match.opponentPoints : match.creatorPoints;
  const userSlip = isCreator ? creatorSlip : opponentSlip;
  const oppSlip = isCreator ? opponentSlip : creatorSlip;
  const opponentUser = isCreator ? opponent : creator;

  // Determine result type
  let resultType: ResultType;
  if (match.winnerId === null) {
    resultType = 'draw';
  } else if (match.winnerId === currentUserId) {
    resultType = 'win';
  } else {
    resultType = 'loss';
  }

  const config = RESULT_CONFIG[resultType];

  // Animation values
  const headerScale = useRef(new Animated.Value(0.5)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(50)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  // Run animations when modal becomes visible
  useEffect(() => {
    if (visible) {
      // Reset animation values
      headerScale.setValue(0.5);
      headerOpacity.setValue(0);
      contentTranslateY.setValue(50);
      contentOpacity.setValue(0);

      // Header animation (scale + fade in)
      Animated.parallel([
        Animated.spring(headerScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(headerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Content animation (delayed slide + fade in)
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(contentTranslateY, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, 200);
    }
  }, [visible, headerScale, headerOpacity, contentTranslateY, contentOpacity]);

  // Format stake/payout amounts
  const formatAmount = (amount: number | null | undefined): string => {
    if (amount == null) return '0';
    return amount.toLocaleString();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <BlurView intensity={90} tint="dark" style={styles.backdrop}>
        <View style={styles.container}>
          {/* Result Header */}
          <Animated.View
            style={[
              styles.headerContainer,
              { backgroundColor: config.backgroundColor },
              {
                transform: [{ scale: headerScale }],
                opacity: headerOpacity,
              },
            ]}
          >
            <View style={styles.iconWrapper}>
              <AppIcon name={config.iconName as any} size={48} color={config.accentColor} />
            </View>
            <Text style={[styles.title, { color: config.accentColor }]}>
              {config.title}
            </Text>
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          </Animated.View>

          {/* Scores Section */}
          <Animated.View
            style={[
              styles.scoresContainer,
              {
                transform: [{ translateY: contentTranslateY }],
                opacity: contentOpacity,
              },
            ]}
          >
            {/* Your Score */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>You</Text>
              <View style={styles.scoreValueContainer}>
                <AnimatedNumber
                  value={userPoints}
                  fontSize={32}
                  fontWeight="800"
                  color={resultType === 'win' ? '#22c55e' : '#ffffff'}
                  duration={1000}
                />
              </View>
              <Text style={styles.scoreUnit}>points</Text>
              {userSlip && (
                <Text style={styles.pickSummary}>
                  {userSlip.correctPicks}/{userSlip.totalPicks} picks hit
                </Text>
              )}
            </View>

            {/* VS Divider */}
            <View style={styles.vsDivider}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            {/* Opponent Score */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>
                {opponentUser?.displayName || opponentUser?.username || 'Opponent'}
              </Text>
              <View style={styles.scoreValueContainer}>
                <AnimatedNumber
                  value={opponentPoints}
                  fontSize={32}
                  fontWeight="800"
                  color={resultType === 'loss' ? '#22c55e' : '#ffffff'}
                  duration={1000}
                />
              </View>
              <Text style={styles.scoreUnit}>points</Text>
              {oppSlip && (
                <Text style={styles.pickSummary}>
                  {oppSlip.correctPicks}/{oppSlip.totalPicks} picks hit
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Payout Section */}
          <Animated.View
            style={[
              styles.payoutContainer,
              {
                transform: [{ translateY: contentTranslateY }],
                opacity: contentOpacity,
              },
            ]}
          >
            {resultType === 'win' && (
              <>
                <Text style={styles.payoutLabel}>You Won</Text>
                <Text style={[styles.payoutAmount, { color: '#22c55e' }]}>
                  +{formatAmount(match.winnerPayout)} RC
                </Text>
                {match.rakeAmount && match.rakeAmount > 0 && (
                  <Text style={styles.rakeNote}>
                    (after {formatAmount(match.rakeAmount)} RC rake)
                  </Text>
                )}
              </>
            )}
            {resultType === 'loss' && (
              <>
                <Text style={styles.payoutLabel}>You Lost</Text>
                <Text style={[styles.payoutAmount, { color: '#ef4444' }]}>
                  -{formatAmount(match.stakeAmount)} RC
                </Text>
              </>
            )}
            {resultType === 'draw' && (
              <>
                <Text style={styles.payoutLabel}>Stakes Returned</Text>
                <Text style={[styles.payoutAmount, { color: '#eab308' }]}>
                  {formatAmount(match.stakeAmount)} RC
                </Text>
              </>
            )}
          </Animated.View>

          {/* Tie-breaker / Settlement Reason Section */}
          {match.settlementReason && (
            <Animated.View
              style={[
                styles.settlementReasonContainer,
                {
                  transform: [{ translateY: contentTranslateY }],
                  opacity: contentOpacity,
                },
              ]}
            >
              <Text style={styles.settlementReasonLabel}>Settlement Details</Text>
              <Text style={styles.settlementReasonText}>{match.settlementReason}</Text>
            </Animated.View>
          )}

          {/* Action Buttons */}
          <Animated.View
            style={[
              styles.buttonContainer,
              {
                transform: [{ translateY: contentTranslateY }],
                opacity: contentOpacity,
              },
            ]}
          >
            {onBackToHome && (
              <Pressable
                style={styles.tertiaryButton}
                onPress={onBackToHome}
              >
                <Text style={styles.tertiaryButtonText}>Home</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.secondaryButton}
              onPress={onViewDetails || onDismiss}
            >
              <Text style={styles.secondaryButtonText}>Details</Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: config.accentColor },
              ]}
              onPress={onPlayAgain || onDismiss}
            >
              <Text style={styles.primaryButtonText}>
                {onPlayAgain ? 'Play Again' : 'Continue'}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </BlurView>
    </Modal>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },

  // Header
  headerContainer: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    width: '100%',
    marginBottom: 24,
  },
  iconWrapper: {
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
  },

  // Scores
  scoresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  scoreCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0f0f23',
    borderRadius: 12,
  },
  scoreLabel: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 8,
  },
  scoreValueContainer: {
    marginBottom: 4,
  },
  scoreUnit: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: -4,
  },
  pickSummary: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  vsDivider: {
    paddingHorizontal: 12,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4b5563',
  },

  // Payout
  payoutContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    width: '100%',
  },
  payoutLabel: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 4,
  },
  payoutAmount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  rakeNote: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },

  // Settlement Reason
  settlementReasonContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    borderRadius: 10,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(107, 114, 128, 0.2)',
  },
  settlementReasonLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  settlementReasonText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Buttons
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  tertiaryButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3a3a4e',
  },
  tertiaryButtonText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default MatchCompletionModal;
