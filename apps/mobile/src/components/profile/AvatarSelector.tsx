// =====================================================
// AvatarSelector Component
// =====================================================
// Grid of avatar options for selection in edit modal

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AVATAR_OPTIONS } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

export interface AvatarSelectorProps {
  /** Currently selected avatar ID (null = default) */
  selectedAvatarId: string | null;
  /** Handler when avatar is selected */
  onSelect: (avatarId: string | null) => void;
}

// =====================================================
// Component
// =====================================================

export function AvatarSelector({
  selectedAvatarId,
  onSelect,
}: AvatarSelectorProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Avatar</Text>
      <View style={styles.grid}>
        {AVATAR_OPTIONS.map((avatar) => {
          const isSelected = selectedAvatarId === avatar.id;

          return (
            <Pressable
              key={avatar.id}
              onPress={() => onSelect(avatar.id)}
              style={({ pressed }) => [
                styles.avatarButton,
                isSelected && styles.avatarButtonSelected,
                pressed && styles.avatarButtonPressed,
              ]}
              // Generous hit area for thumb-feel
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              {/* Avatar Circle */}
              <View
                style={[
                  styles.avatarCircle,
                  isSelected && styles.avatarCircleSelected,
                ]}
              >
                <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
              </View>

              {/* Selection Indicator */}
              {isSelected && <View style={styles.selectionRing} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarButton: {
    // 4 columns: (100% - 3 gaps) / 4
    width: '22.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Minimum touch target 44x44px is handled by the circle size + hitSlop
  },
  avatarButtonPressed: {
    opacity: 0.7,
  },
  avatarButtonSelected: {
    // Selected state handled by circle and ring
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: LUXURY_THEME.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    // Ensure 44x44 minimum (64px exceeds this)
  },
  avatarCircleSelected: {
    backgroundColor: '#1a2540',
    // Scale handled by ring, not transform (avoid layout shift)
  },
  avatarEmoji: {
    fontSize: 32,
    lineHeight: 38,
  },
  selectionRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: LUXURY_THEME.gold.main, // Gold ring
    // Gold glow effect
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
});
