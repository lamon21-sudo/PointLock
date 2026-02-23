// =====================================================
// EmptyInbox Component
// =====================================================
// Full-height empty state for the notification inbox.
//
// Shown when a user has no notifications at all.
// Uses a large bell icon, a headline, and a supportive
// sub-caption.  No CTAs are needed here — the inbox
// populates automatically as the user engages.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { LUXURY_THEME } from '../../constants/theme';

export function EmptyInbox(): React.ReactElement {
  return (
    <View style={styles.container}>
      {/* Icon container with subtle glow ring */}
      <View style={styles.iconWrap}>
        <AppIcon
          name="Bell"
          size={40}
          color={LUXURY_THEME.text.muted}
          weight="duotone"
        />
      </View>

      <Text style={styles.headline}>No notifications yet</Text>
      <Text style={styles.subtext}>
        We'll let you know when something important happens — wins, challenges, and more.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80, // Visual center offset for floating tab bar
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LUXURY_THEME.surface.raised,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headline: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: LUXURY_THEME.text.muted,
    textAlign: 'center',
    lineHeight: 21,
  },
});

export default EmptyInbox;
