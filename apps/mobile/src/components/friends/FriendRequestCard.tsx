// =====================================================
// FriendRequestCard Component
// =====================================================
// Displays an incoming friend request with accept/decline actions

import React, { memo, useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import type { Friendship } from '../../types/friends.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Constants
// =====================================================

export const FRIEND_REQUEST_CARD_HEIGHT = 96;

// =====================================================
// Props
// =====================================================

interface FriendRequestCardProps {
  friendship: Friendship;
  onAccept: (friendshipId: string) => Promise<void>;
  onDecline: (friendshipId: string) => Promise<void>;
  onUserPress?: (friendship: Friendship) => void;
}

// =====================================================
// Component
// =====================================================

function FriendRequestCardComponent({
  friendship,
  onAccept,
  onDecline,
  onUserPress,
}: FriendRequestCardProps): React.ReactElement {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const requester = friendship.requester;

  const handleUserPress = useCallback(() => {
    onUserPress?.(friendship);
  }, [friendship, onUserPress]);

  const handleAccept = useCallback(async () => {
    if (isAccepting || isDeclining) return;

    setIsAccepting(true);
    try {
      await onAccept(friendship.id);
    } catch (error) {
      console.error('[FriendRequestCard] Accept error:', error);
    } finally {
      setIsAccepting(false);
    }
  }, [friendship.id, onAccept, isAccepting, isDeclining]);

  const handleDecline = useCallback(async () => {
    if (isAccepting || isDeclining) return;

    setIsDeclining(true);
    try {
      await onDecline(friendship.id);
    } catch (error) {
      console.error('[FriendRequestCard] Decline error:', error);
    } finally {
      setIsDeclining(false);
    }
  }, [friendship.id, onDecline, isAccepting, isDeclining]);

  const isLoading = isAccepting || isDeclining;

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.userInfo,
          pressed && styles.userInfoPressed,
        ]}
        onPress={handleUserPress}
        disabled={isLoading}
      >
        {/* Avatar */}
        {requester.avatarUrl ? (
          <Image source={{ uri: requester.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>
              {(requester.displayName || requester.username)[0].toUpperCase()}
            </Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>
            {requester.displayName || requester.username}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{requester.username}
          </Text>
        </View>
      </Pressable>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.acceptButton,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.acceptButtonPressed,
          ]}
          onPress={handleAccept}
          disabled={isLoading}
        >
          {isAccepting ? (
            <ActivityIndicator color={LUXURY_THEME.bg.primary} size="small" />
          ) : (
            <Text style={styles.acceptButtonText}>Accept</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.declineButton,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.declineButtonPressed,
          ]}
          onPress={handleDecline}
          disabled={isLoading}
        >
          {isDeclining ? (
            <ActivityIndicator color={LUXURY_THEME.text.muted} size="small" />
          ) : (
            <Text style={styles.declineButtonText}>Decline</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// =====================================================
// Memoization
// =====================================================

export const FriendRequestCard = memo(FriendRequestCardComponent);

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  // User Info Section
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  userInfoPressed: {
    opacity: 0.7,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LUXURY_THEME.surface.elevated,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LUXURY_THEME.gold.depth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: LUXURY_THEME.text.muted,
  },
  // Actions Section
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: LUXURY_THEME.gold.brushed,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  acceptButtonPressed: {
    backgroundColor: LUXURY_THEME.gold.depth,
    transform: [{ scale: 0.98 }],
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
  },
  declineButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.muted,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  declineButtonPressed: {
    backgroundColor: LUXURY_THEME.surface.elevated,
    transform: [{ scale: 0.98 }],
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
