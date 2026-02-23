// =====================================================
// InboxItem Component
// =====================================================
// A single row in the notification inbox.
//
// Layout:
//   [ icon container ] [ title + body ] [ timestamp ]
//
// Visual accents:
//   - Unread items: left gold border + slightly lighter background
//   - Read items: muted appearance
//   - Unread dot on the timestamp column (4px gold circle)
//
// Touch: 44pt minimum height guaranteed; ripple on Android.

import React, { memo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import type { IconName } from '../ui/AppIcon';
import { LUXURY_THEME } from '../../constants/theme';
import { formatRelativeTime } from '../../utils/date-helpers';

// ---- Icon mapping ----------------------------------------
// Maps notification iconType strings to registered Phosphor icon names.

function resolveIcon(iconType: string | null): IconName {
  switch (iconType) {
    case 'settlement':    return 'Trophy';
    case 'pvp_challenge': return 'Crosshair';
    case 'slip_expiring': return 'Hourglass';
    case 'game_reminder': return 'Calendar';
    case 'social':        return 'UsersThree';
    case 'leaderboard':   return 'ChartBar';
    case 'daily_digest':  return 'Bell';
    case 'weekly_recap':  return 'Receipt';
    case 'win_streak':    return 'Fire';
    case 'inactivity':    return 'SmileyMeh';
    default:              return 'Bell';
  }
}

// ---- Props -----------------------------------------------

export interface InboxItemProps {
  id: string;
  title: string;
  body: string;
  iconType: string | null;
  isRead: boolean;
  createdAt: string;
  deepLinkType: string;
  entityId: string | null;
  onPress: () => void;
  onMarkRead: () => void;
}

// ---- Component -------------------------------------------

export const InboxItem = memo(function InboxItem({
  title,
  body,
  iconType,
  isRead,
  createdAt,
  onPress,
}: InboxItemProps): React.ReactElement {
  const iconName = resolveIcon(iconType);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        !isRead && styles.containerUnread,
        pressed && styles.pressed,
      ]}
      android_ripple={{ color: LUXURY_THEME.border.muted, borderless: false }}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${body}`}
    >
      {/* Unread left accent bar */}
      {!isRead && <View style={styles.unreadAccent} />}

      {/* Icon */}
      <View style={[styles.iconWrap, !isRead && styles.iconWrapUnread]}>
        <AppIcon
          name={iconName}
          size={20}
          color={isRead ? LUXURY_THEME.text.muted : LUXURY_THEME.gold.main}
          weight={isRead ? 'regular' : 'duotone'}
        />
      </View>

      {/* Text block */}
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, isRead && styles.titleRead]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.body, isRead && styles.bodyRead]}
          numberOfLines={2}
        >
          {body}
        </Text>
      </View>

      {/* Right column: timestamp + unread dot */}
      <View style={styles.rightCol}>
        <Text style={styles.timestamp}>{formatRelativeTime(createdAt)}</Text>
        {!isRead && <View style={styles.unreadDot} />}
      </View>
    </Pressable>
  );
});

// ---- Styles ----------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: LUXURY_THEME.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
    // No overflow clip — the left accent bar sits outside
  },
  containerUnread: {
    backgroundColor: LUXURY_THEME.surface.raised,
  },
  pressed: {
    opacity: Platform.OS === 'ios' ? 0.75 : 1,
    backgroundColor:
      Platform.OS === 'ios' ? LUXURY_THEME.surface.elevated : undefined,
  },

  // ---- Unread left bar ------------------------------------
  unreadAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: LUXURY_THEME.gold.main,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },

  // ---- Icon -----------------------------------------------
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LUXURY_THEME.bg.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  iconWrapUnread: {
    backgroundColor: LUXURY_THEME.gold.glow,
    borderWidth: 1,
    borderColor: LUXURY_THEME.gold.border,
  },

  // ---- Text -----------------------------------------------
  textBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
    lineHeight: 19,
  },
  titleRead: {
    color: LUXURY_THEME.text.secondary,
    fontWeight: '500',
  },
  body: {
    fontSize: 13,
    color: LUXURY_THEME.text.secondary,
    lineHeight: 18,
  },
  bodyRead: {
    color: LUXURY_THEME.text.muted,
  },

  // ---- Right column ---------------------------------------
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 10,
    gap: 6,
    flexShrink: 0,
  },
  timestamp: {
    fontSize: 11,
    color: LUXURY_THEME.text.muted,
    letterSpacing: 0.2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: LUXURY_THEME.gold.main,
  },
});

export default InboxItem;
