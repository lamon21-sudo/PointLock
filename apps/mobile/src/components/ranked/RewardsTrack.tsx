// =====================================================
// RewardsTrack Component
// =====================================================
// Horizontal scrollable list of season rewards.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RANK_DISPLAY } from '@pick-rivals/shared-types';
import type { RewardItem, RewardStatus } from '../../services/ranked.service';
import { LUXURY_THEME, GRADIENTS, SHADOWS } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface RewardsTrackProps {
  rewards: RewardItem[];
  onClaim?: (rewardId: string) => void;
  isClaiming?: boolean;
  claimingId?: string | null;
}

// =====================================================
// Constants
// =====================================================

const CARD_WIDTH = 140;
const CARD_MARGIN = 12;

// =====================================================
// Reward Card Component
// =====================================================

interface RewardCardProps {
  reward: RewardItem;
  onClaim?: () => void;
  isClaiming?: boolean;
}

function RewardCard({ reward, onClaim, isClaiming }: RewardCardProps) {
  const minInfo = RANK_DISPLAY[reward.minRank];
  const maxInfo = RANK_DISPLAY[reward.maxRank];
  const isLocked = reward.status === 'locked';
  const isUnlocked = reward.status === 'unlocked';
  const isClaimed = reward.status === 'claimed';

  // Rank range display
  const rankRange =
    minInfo.tier === maxInfo.tier
      ? minInfo.tier
      : `${minInfo.tier} - ${maxInfo.tier}`;

  return (
    <View
      style={[
        styles.cardContainer,
        isLocked && styles.cardLocked,
        isUnlocked && styles.cardUnlocked,
        isClaimed && styles.cardClaimed,
      ]}
    >
      <LinearGradient
        colors={
          isLocked
            ? ['#1A1A1A', '#141414']
            : isUnlocked
              ? ['#2A2510', '#1A1A0A']
              : GRADIENTS.glassCard
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.card}
      >
        {/* Status indicator */}
        {isLocked && (
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={16} color={LUXURY_THEME.text.muted} />
          </View>
        )}
        {isClaimed && (
          <View style={styles.claimedBadge}>
            <Ionicons name="checkmark-circle" size={20} color={LUXURY_THEME.status.success} />
          </View>
        )}

        {/* Tier badge */}
        <View
          style={[
            styles.tierBadge,
            { backgroundColor: isLocked ? LUXURY_THEME.surface.elevated : minInfo.color },
          ]}
        >
          <Text style={[styles.tierText, isLocked && { color: LUXURY_THEME.text.muted }]}>
            {rankRange}
          </Text>
        </View>

        {/* Coin reward */}
        <Text style={[styles.coinAmount, isLocked && styles.textLocked]}>
          {reward.coinReward.toLocaleString()}
        </Text>
        <Text style={[styles.coinLabel, isLocked && styles.textLocked]}>RC</Text>

        {/* Claim button or status */}
        {isUnlocked && onClaim && (
          <Pressable
            onPress={onClaim}
            disabled={isClaiming}
            style={({ pressed }) => [
              styles.claimButton,
              pressed && styles.claimButtonPressed,
            ]}
          >
            {isClaiming ? (
              <ActivityIndicator size="small" color={LUXURY_THEME.bg.primary} />
            ) : (
              <Text style={styles.claimButtonText}>CLAIM</Text>
            )}
          </Pressable>
        )}

        {isClaimed && <Text style={styles.claimedText}>CLAIMED</Text>}

        {isLocked && (
          <Text style={styles.lockedText}>
            Reach {minInfo.name}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export function RewardsTrack({
  rewards,
  onClaim,
  isClaiming = false,
  claimingId = null,
}: RewardsTrackProps) {
  if (rewards.length === 0) {
    return null;
  }

  const renderItem = ({ item }: { item: RewardItem }) => (
    <RewardCard
      reward={item}
      onClaim={onClaim ? () => onClaim(item.id) : undefined}
      isClaiming={isClaiming && claimingId === item.id}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>SEASON REWARDS</Text>
      <FlatList
        data={rewards}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={CARD_WIDTH + CARD_MARGIN}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: CARD_WIDTH + CARD_MARGIN,
          offset: (CARD_WIDTH + CARD_MARGIN) * index,
          index,
        })}
      />
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: LUXURY_THEME.text.secondary,
    letterSpacing: 1.5,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardLocked: {
    opacity: 0.6,
  },
  cardUnlocked: {
    ...SHADOWS.goldGlowSubtle,
  },
  cardClaimed: {
    // Normal styling
  },
  card: {
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
    borderRadius: 16,
    minHeight: 160,
  },
  lockIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  claimedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.5,
  },
  coinAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: LUXURY_THEME.gold.brushed,
    marginTop: 8,
  },
  coinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
    letterSpacing: 1,
  },
  textLocked: {
    color: LUXURY_THEME.text.muted,
  },
  claimButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: LUXURY_THEME.gold.vibrant,
    borderRadius: 8,
  },
  claimButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  claimButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
    letterSpacing: 1,
  },
  claimedText: {
    marginTop: 16,
    fontSize: 11,
    fontWeight: '600',
    color: LUXURY_THEME.status.success,
    letterSpacing: 1,
  },
  lockedText: {
    marginTop: 16,
    fontSize: 10,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
  },
});

export default RewardsTrack;
