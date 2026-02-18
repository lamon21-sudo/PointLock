// =====================================================
// ProfileHeader Component
// =====================================================
// Displays user avatar, display name, username, and skill rating badge

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { PencilSimpleIcon } from 'phosphor-react-native';
import {
  getAvatarEmoji,
  formatSkillRating,
  getSkillRatingColor,
} from '../../types/profile.types';
import { LUXURY_THEME, SHADOWS } from '../../constants/theme';
import { GlassCard } from '../ui/GlassCard';

// =====================================================
// Types
// =====================================================

export interface ProfileHeaderProps {
  /** User's display name (null falls back to username) */
  displayName: string | null;
  /** Username (unique identifier) */
  username: string;
  /** Avatar ID like 'flame', 'star', etc. (null = default) */
  avatarUrl: string | null;
  /** User's skill rating (determines badge) */
  skillRating: number;
  /** Whether this is the current user's own profile */
  isOwnProfile: boolean;
  /** Handler for edit button press (only shown when isOwnProfile) */
  onEditPress?: () => void;
}

// =====================================================
// Component
// =====================================================

export function ProfileHeader({
  displayName,
  username,
  avatarUrl,
  skillRating,
  isOwnProfile,
  onEditPress,
}: ProfileHeaderProps): React.ReactElement {
  const emoji = getAvatarEmoji(avatarUrl);
  const ratingLabel = formatSkillRating(skillRating);
  const ratingColor = getSkillRatingColor(skillRating);

  // Display name with fallback to username
  const displayedName = displayName || username;

  return (
    <GlassCard padded contentStyle={styles.container}>
      {/* Avatar Circle */}
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarEmoji}>{emoji}</Text>
      </View>

      {/* User Info */}
      <View style={styles.infoContainer}>
        {/* Display Name */}
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayedName}
          </Text>
          {isOwnProfile && onEditPress && (
            <Pressable
              onPress={onEditPress}
              style={({ pressed }) => [
                styles.editButton,
                pressed && styles.editButtonPressed,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <PencilSimpleIcon size={14} color={LUXURY_THEME.gold.main} weight="duotone" />
            </Pressable>
          )}
        </View>

        {/* Username */}
        <Text style={styles.username} numberOfLines={1}>
          @{username}
        </Text>

        {/* Skill Rating Badge */}
        <View style={[styles.badge, { backgroundColor: `${ratingColor}33` }]}>
          <View style={[styles.badgeDot, { backgroundColor: ratingColor }]} />
          <Text style={[styles.badgeText, { color: ratingColor }]}>
            {ratingLabel} • {skillRating}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  avatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: LUXURY_THEME.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...SHADOWS.goldGlowSubtle,
  },
  avatarEmoji: {
    fontSize: 48,
    lineHeight: 56,
  },
  infoContainer: {
    alignItems: 'center',
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    letterSpacing: 0.3,
  },
  editButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(214, 179, 106, 0.15)', // Gold tint
  },
  editButtonPressed: {
    backgroundColor: 'rgba(214, 179, 106, 0.25)',
  },
  username: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
