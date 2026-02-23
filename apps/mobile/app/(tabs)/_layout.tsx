import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LUXURY_THEME, SHADOWS } from '../../src/constants/theme';
import { TEST_IDS } from '../../src/constants/testIds';
import { useNotificationStore } from '../../src/stores/notification.store';

type IconName = 'home' | 'calendar' | 'people' | 'trophy' | 'wallet' | 'person';

// Thin outline icons for premium look
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const iconName = focused ? name : (`${name}-outline` as const);

  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      <Ionicons
        name={iconName}
        size={22}
        color={focused ? LUXURY_THEME.gold.main : LUXURY_THEME.text.muted}
      />
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainerActive: {
    // Gold glow effect via shadow
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: LUXURY_THEME.gold.main,
  },
});

export default function TabLayout() {
  // Drive the Profile tab badge from the global notification store.
  // The store is populated by useNotificationInbox whenever the inbox
  // is opened and refetched; it starts at 0 on fresh launch.
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: LUXURY_THEME.gold.main,
        tabBarInactiveTintColor: LUXURY_THEME.text.muted,
        tabBarStyle: {
          // Floating dock style
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 24 : 16,
          left: 16,
          right: 16,
          backgroundColor: LUXURY_THEME.surface.card,
          borderRadius: 24,
          borderTopWidth: 0, // Remove default border
          borderWidth: 1,
          borderColor: LUXURY_THEME.border.subtle,
          height: 68,
          paddingBottom: 0,
          paddingTop: 0,
          // Floating shadow
          ...SHADOWS.floating,
        },
        tabBarItemStyle: {
          paddingVertical: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTintColor: LUXURY_THEME.text.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          letterSpacing: 0.5,
        },
        // Add padding to content to account for floating dock
        sceneContainerStyle: {
          backgroundColor: LUXURY_THEME.bg.primary,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
          headerTitle: 'PickRivals',
          tabBarTestID: TEST_IDS.tabs.home,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ focused }) => <TabIcon name="calendar" focused={focused} />,
          headerTitle: 'Events',
          tabBarTestID: TEST_IDS.tabs.events,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} />,
          headerTitle: 'My Matches',
          tabBarTestID: TEST_IDS.tabs.matches,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Ranks',
          tabBarIcon: ({ focused }) => <TabIcon name="trophy" focused={focused} />,
          headerTitle: 'Leaderboard',
          tabBarTestID: TEST_IDS.tabs.leaderboard,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => <TabIcon name="wallet" focused={focused} />,
          headerTitle: 'Wallet',
          tabBarTestID: TEST_IDS.tabs.wallet,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
          headerTitle: 'Profile',
          tabBarTestID: TEST_IDS.tabs.profile,
          // Show unread notification count as a badge on the Profile tab.
          // React Navigation renders tabBarBadge as a small circle above the icon.
          // undefined hides the badge entirely (cleaner than showing "0").
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: LUXURY_THEME.gold.main,
            color: LUXURY_THEME.bg.primary,
            fontSize: 10,
            fontWeight: '700',
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            lineHeight: 16,
          },
        }}
      />
    </Tabs>
  );
}
