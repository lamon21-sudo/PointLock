// =====================================================
// FriendCard Component
// =====================================================
// Displays a single friend card with avatar, name, and online status

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
} from 'react-native';
import type { Friendship } from '../../types/friends.types';
import { getFriendFromFriendship, isUserOnline } from '../../types/friends.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Constants
// =====================================================

export const FRIEND_CARD_HEIGHT = 72;

// =====================================================
// Props
// =====================================================

interface FriendCardProps {
  friendship: Friendship;
  currentUserId: string;
  onPress?: (friendship: Friendship) => void;
  onRemove?: (friendshipId: string) => void;
}

// =====================================================
// Component
// =====================================================

function FriendCardComponent({
  friendship,
  currentUserId,
  onPress,
  onRemove,
}: FriendCardProps): React.ReactElement {
  const friend = getFriendFromFriendship(friendship, currentUserId);
  const online = isUserOnline(friend.lastActiveAt);

  const handlePress = useCallback(() => {
    onPress?.(friendship);
  }, [friendship, onPress]);

  const handleRemove = useCallback(() => {
    onRemove?.(friendship.id);
  }, [friendship.id, onRemove]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        {/* Avatar with Online Indicator */}
        <View style={styles.avatarContainer}>
          {friend.avatarUrl ? (
            <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {(friend.displayName || friend.username)[0].toUpperCase()}
              </Text>
            </View>
          )}
          {online && <View style={styles.onlineIndicator} />}
        </View>

        {/* User Info */}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>
            {friend.displayName || friend.username}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{friend.username}
          </Text>
        </View>

        {/* Actions */}
        {onRemove && (
          <Pressable
            style={({ pressed }) => [
              styles.moreButton,
              pressed && styles.moreButtonPressed,
            ]}
            onPress={handleRemove}
            hitSlop={8}
          >
            <Text style={styles.moreIcon}>...</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// =====================================================
// Memoization
// =====================================================

export const FriendCard = memo(FriendCardComponent);

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
    height: FRIEND_CARD_HEIGHT,
  },
  containerPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: '100%',
  },
  // Avatar
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LUXURY_THEME.surface.elevated,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LUXURY_THEME.gold.depth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: LUXURY_THEME.status.success,
    borderWidth: 2,
    borderColor: LUXURY_THEME.surface.card,
  },
  // Info
  info: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 12,
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
  // Actions
  moreButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  moreButtonPressed: {
    backgroundColor: LUXURY_THEME.surface.elevated,
  },
  moreIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.muted,
    letterSpacing: 2,
  },
});
