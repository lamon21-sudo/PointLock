// =====================================================
// Notification Inbox Screen
// =====================================================
// Full notification inbox with:
//   - FlatList + pull-to-refresh
//   - Infinite scroll pagination (page-based)
//   - Per-item read marking on tap + deep link navigation
//   - "Mark All Read" button in header via useLayoutEffect
//   - Empty state component when no notifications exist
//   - Loading skeleton on first load
//   - Error state with retry

import React, { useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import {
  useNotificationInbox,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../../src/hooks/useNotificationInbox';
import { InboxItem, EmptyInbox } from '../../src/components/notifications';
import { LUXURY_THEME } from '../../src/constants/theme';
import type { NotificationInboxItemDTO } from '@pick-rivals/shared-types';

// ---- Deep link resolution --------------------------------

/**
 * Maps deepLinkType + entityId to an Expo Router path.
 * Falls back to the inbox root if the type is unknown.
 */
function resolveDeepLink(deepLinkType: string, entityId: string | null): string {
  switch (deepLinkType) {
    case 'match':
      return entityId ? `/match/${entityId}` : '/notifications';
    case 'slip':
      return entityId ? `/slip/${entityId}` : '/notifications';
    case 'challenge':
      return entityId ? `/challenge/join?code=${entityId}` : '/notifications';
    case 'event':
      return entityId ? `/event/${entityId}` : '/notifications';
    case 'leaderboard':
      return '/(tabs)/leaderboard';
    default:
      return '/notifications';
  }
}

// ---- Loading Skeleton rows --------------------------------

function SkeletonRow(): React.ReactElement {
  return (
    <View style={skeletonStyles.row}>
      <View style={skeletonStyles.icon} />
      <View style={skeletonStyles.textBlock}>
        <View style={skeletonStyles.titleLine} />
        <View style={skeletonStyles.bodyLine} />
      </View>
      <View style={skeletonStyles.timestamp} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
    minHeight: 72,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: LUXURY_THEME.surface.raised,
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    height: 13,
    borderRadius: 6,
    backgroundColor: LUXURY_THEME.surface.raised,
    width: '60%',
  },
  bodyLine: {
    height: 11,
    borderRadius: 6,
    backgroundColor: LUXURY_THEME.surface.raised,
    width: '85%',
  },
  timestamp: {
    width: 28,
    height: 11,
    borderRadius: 6,
    backgroundColor: LUXURY_THEME.surface.raised,
    marginLeft: 10,
  },
});

// ---- Footer: load more spinner --------------------------

function LoadMoreFooter({ loading }: { loading: boolean }): React.ReactElement | null {
  if (!loading) return null;
  return (
    <View style={styles.loadMoreWrap}>
      <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
    </View>
  );
}

// ---- Error state ----------------------------------------

function ErrorState({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <View style={styles.errorWrap}>
      <Text style={styles.errorText}>Couldn't load notifications.</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
      >
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

// ---- Main Screen ----------------------------------------

export default function NotificationInboxScreen(): React.ReactElement {
  const router = useRouter();
  const navigation = useNavigation();

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useNotificationInbox();

  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: isMarkingAllRead } = useMarkAllNotificationsRead();

  // Flatten all pages into a single item list
  const items: NotificationInboxItemDTO[] = data?.pages.flatMap((p) => p.items) ?? [];
  const hasAnyUnread = items.some((i) => !i.isRead);

  // ---- Header: Mark All Read button ----------------------
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasAnyUnread ? (
          <Pressable
            onPress={() => markAllRead()}
            disabled={isMarkingAllRead}
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && styles.headerBtnPressed,
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isMarkingAllRead ? (
              <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
            ) : (
              <Text style={styles.headerBtnText}>Mark All Read</Text>
            )}
          </Pressable>
        ) : null,
    });
  }, [navigation, hasAnyUnread, isMarkingAllRead, markAllRead]);

  // ---- Handlers ------------------------------------------

  const handleItemPress = useCallback(
    (item: NotificationInboxItemDTO) => {
      // Mark as read (optimistic) when user taps
      if (!item.isRead) {
        markRead(item.id);
      }

      // Navigate via deep link
      const path = resolveDeepLink(item.deepLinkType, item.entityId);
      router.push(path as any);
    },
    [markRead, router]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---- Render item ----------------------------------------

  const renderItem = useCallback(
    ({ item }: { item: NotificationInboxItemDTO }) => (
      <InboxItem
        id={item.id}
        title={item.title}
        body={item.body}
        iconType={item.iconType}
        isRead={item.isRead}
        createdAt={item.createdAt}
        deepLinkType={item.deepLinkType}
        entityId={item.entityId}
        onPress={() => handleItemPress(item)}
        onMarkRead={() => markRead(item.id)}
      />
    ),
    [handleItemPress, markRead]
  );

  const keyExtractor = useCallback(
    (item: NotificationInboxItemDTO) => item.id,
    []
  );

  // ---- Loading skeleton (first load) ----------------------

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </SafeAreaView>
    );
  }

  // ---- Error state ----------------------------------------

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ErrorState onRetry={() => refetch()} />
      </SafeAreaView>
    );
  }

  // ---- Main list or empty state ---------------------------

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        // ---- Pull to refresh --------------------------------
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isFetchingNextPage}
            onRefresh={() => refetch()}
            tintColor={LUXURY_THEME.gold.main}
            colors={[LUXURY_THEME.gold.main]}
          />
        }
        // ---- Infinite scroll --------------------------------
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<LoadMoreFooter loading={isFetchingNextPage} />}
        // ---- Empty state ------------------------------------
        ListEmptyComponent={<EmptyInbox />}
        // ---- Performance ------------------------------------
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={15}
        windowSize={10}
        initialNumToRender={20}
        getItemLayout={(_data, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
        // ---- Accessibility ----------------------------------
        accessibilityLabel="Notification inbox"
        contentContainerStyle={
          items.length === 0 ? styles.emptyContentContainer : undefined
        }
      />
    </SafeAreaView>
  );
}

// ---- Styles ---------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },

  // ---- Header button -------------------------------------
  headerBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  headerBtnPressed: {
    opacity: 0.6,
  },
  headerBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: LUXURY_THEME.gold.main,
    letterSpacing: 0.1,
  },

  // ---- Load more footer ----------------------------------
  loadMoreWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // ---- Error state ----------------------------------------
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  errorText: {
    fontSize: 16,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  retryBtnPressed: {
    opacity: 0.8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
  },

  // ---- Empty state container (flex for vertical centering)
  emptyContentContainer: {
    flex: 1,
  },
});
