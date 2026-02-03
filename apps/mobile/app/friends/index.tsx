// =====================================================
// Friends Screen
// =====================================================
// Main friends screen with tabs for friends list and incoming requests

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useFriends } from '../../src/hooks/useFriends';
import { useAuthStore } from '../../src/stores/auth.store';
import {
  FriendCard,
  FriendRequestCard,
  FRIEND_CARD_HEIGHT,
  FRIEND_REQUEST_CARD_HEIGHT,
} from '../../src/components/friends';
import type { Friendship, FriendsTab } from '../../src/types/friends.types';
import { LUXURY_THEME } from '../../src/constants/theme';

// =====================================================
// Sub-components
// =====================================================

interface FriendTabsProps {
  activeTab: FriendsTab;
  onTabChange: (tab: FriendsTab) => void;
  requestCount: number;
}

function FriendTabs({
  activeTab,
  onTabChange,
  requestCount,
}: FriendTabsProps): React.ReactElement {
  return (
    <View style={styles.tabsContainer}>
      <Pressable
        style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
        onPress={() => onTabChange('friends')}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === 'friends' && styles.tabTextActive,
          ]}
        >
          Friends
        </Text>
      </Pressable>

      <Pressable
        style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
        onPress={() => onTabChange('requests')}
      >
        <Text
          style={[
            styles.tabText,
            activeTab === 'requests' && styles.tabTextActive,
          ]}
        >
          Requests
        </Text>
        {requestCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {requestCount > 99 ? '99+' : requestCount}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function EmptyFriends(): React.ReactElement {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{'\u{1F465}'}</Text>
      <Text style={styles.emptyTitle}>No Friends Yet</Text>
      <Text style={styles.emptyMessage}>
        Challenge your friends to matches and climb the leaderboard together!
      </Text>
    </View>
  );
}

function EmptyRequests(): React.ReactElement {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>{'\u{1F4E8}'}</Text>
      <Text style={styles.emptyTitle}>No Friend Requests</Text>
      <Text style={styles.emptyMessage}>
        When someone sends you a friend request, it will appear here.
      </Text>
    </View>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorIcon}>{'\u26A0\uFE0F'}</Text>
      <Text style={styles.errorTitle}>Failed to Load</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

function ListFooter({
  isLoading,
}: {
  isLoading: boolean;
}): React.ReactElement | null {
  if (!isLoading) return null;
  return (
    <View style={styles.footerContainer}>
      <ActivityIndicator color={LUXURY_THEME.gold.main} size="small" />
      <Text style={styles.footerText}>Loading more...</Text>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function FriendsScreen(): React.ReactElement {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const {
    friends,
    requests,
    pagination,
    requestsPagination,
    activeTab,
    setActiveTab,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
    acceptRequest,
    declineRequest,
    removeFriend,
    requestCount,
  } = useFriends({ initialTab: 'friends' });

  // =====================================================
  // Handlers
  // =====================================================

  const handleFriendPress = useCallback(
    (friendship: Friendship) => {
      // Navigate to friend's profile
      const friendId =
        friendship.requester.id === user?.id
          ? friendship.addressee.id
          : friendship.requester.id;

      router.push({ pathname: '/users/[id]', params: { id: friendId } });
    },
    [user?.id, router]
  );

  const handleRequestUserPress = useCallback(
    (friendship: Friendship) => {
      router.push({
        pathname: '/users/[id]',
        params: { id: friendship.requester.id },
      });
    },
    [router]
  );

  const handleRemoveFriend = useCallback(
    async (friendshipId: string) => {
      try {
        await removeFriend(friendshipId);
      } catch (error) {
        console.error('[FriendsScreen] Remove friend error:', error);
      }
    },
    [removeFriend]
  );

  // =====================================================
  // Render Functions
  // =====================================================

  const renderFriendItem = useCallback(
    ({ item }: { item: Friendship }) => (
      <FriendCard
        friendship={item}
        currentUserId={user?.id || ''}
        onPress={handleFriendPress}
        onRemove={handleRemoveFriend}
      />
    ),
    [user?.id, handleFriendPress, handleRemoveFriend]
  );

  const renderRequestItem = useCallback(
    ({ item }: { item: Friendship }) => (
      <FriendRequestCard
        friendship={item}
        onAccept={acceptRequest}
        onDecline={declineRequest}
        onUserPress={handleRequestUserPress}
      />
    ),
    [acceptRequest, declineRequest, handleRequestUserPress]
  );

  const keyExtractor = useCallback((item: Friendship) => item.id, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      const height =
        activeTab === 'friends'
          ? FRIEND_CARD_HEIGHT + 8
          : FRIEND_REQUEST_CARD_HEIGHT + 8;
      return {
        length: height,
        offset: height * index,
        index,
      };
    },
    [activeTab]
  );

  // =====================================================
  // Data and Metadata
  // =====================================================

  const currentData = activeTab === 'friends' ? friends : requests;
  const currentPagination = activeTab === 'friends' ? pagination : requestsPagination;

  const ListHeaderComponent = useMemo(
    () => (
      <View>
        {/* Tabs */}
        <FriendTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          requestCount={requestCount}
        />

        {/* Section Header */}
        {currentPagination && currentPagination.total > 0 && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {activeTab === 'friends' ? 'Your Friends' : 'Incoming Requests'}
            </Text>
            <Text style={styles.sectionCount}>
              {currentPagination.total}{' '}
              {currentPagination.total === 1
                ? activeTab === 'friends'
                  ? 'friend'
                  : 'request'
                : activeTab === 'friends'
                ? 'friends'
                : 'requests'}
            </Text>
          </View>
        )}
      </View>
    ),
    [activeTab, setActiveTab, requestCount, currentPagination]
  );

  const ListEmptyComponent = useMemo(
    () => (activeTab === 'friends' ? <EmptyFriends /> : <EmptyRequests />),
    [activeTab]
  );

  const ListFooterComponent = useMemo(
    () => <ListFooter isLoading={isLoadingMore} />,
    [isLoadingMore]
  );

  // =====================================================
  // Render
  // =====================================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Main Content */}
      {isLoading ? (
        <View>
          <FriendTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            requestCount={requestCount}
          />
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={LUXURY_THEME.gold.main} size="large" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      ) : error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <FlatList
          data={currentData}
          renderItem={activeTab === 'friends' ? renderFriendItem : renderRequestItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          // Performance optimizations
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={15}
          // Pull-to-refresh
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={LUXURY_THEME.gold.main}
              colors={[LUXURY_THEME.gold.main]}
              progressBackgroundColor={LUXURY_THEME.bg.secondary}
            />
          }
          // Infinite scroll
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
        />
      )}
    </SafeAreaView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  listContent: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: LUXURY_THEME.surface.card,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    minHeight: 44,
  },
  tabActive: {
    backgroundColor: LUXURY_THEME.gold.brushed,
    borderColor: LUXURY_THEME.gold.brushed,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.secondary,
  },
  tabTextActive: {
    color: LUXURY_THEME.bg.primary,
    fontWeight: '700',
  },
  badge: {
    marginLeft: 8,
    backgroundColor: LUXURY_THEME.status.error,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  sectionCount: {
    fontSize: 13,
    color: LUXURY_THEME.text.muted,
  },
  // Loading State
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: LUXURY_THEME.text.muted,
  },
  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  retryButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  // Footer
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  footerText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 14,
  },
});
