// =====================================================
// PickProgressFeed Component
// =====================================================
// Combined feed showing all picks from both players in a
// live match, sorted by settlement/creation time.
//
// Features:
// - Merges picks from both slips
// - Deduplicates by pick ID (upsert pattern)
// - Sorts: resolved first (by settledAt), then pending (by createdAt)
// - Flash animation on status changes
// - Summary header with resolved/pending counts

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { PickFeedItem } from './PickFeedItem';
import {
  mergeAndSortPicks,
  detectStatusChanges,
  getPickFeedSummary,
  CombinedPick,
} from '../../utils/pick-feed';
import type { ApiPickResponse } from '../../services/slip.service';
import type { EventScore } from '../../hooks/useMatchSocket';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface PickProgressFeedProps {
  /** User's picks from their slip */
  userPicks: ApiPickResponse[];
  /** Opponent's picks from their slip */
  opponentPicks: ApiPickResponse[];
  /** Current user's ID */
  currentUserId: string;
  /** Display name for user (usually "You") */
  userName: string;
  /** Display name for opponent */
  opponentName: string;
  /** Map of live scores by event ID */
  liveScores: Map<string, EventScore>;
}

// =====================================================
// Constants
// =====================================================

const FLASH_DURATION_MS = 700;

// =====================================================
// Component
// =====================================================

export function PickProgressFeed({
  userPicks,
  opponentPicks,
  currentUserId,
  userName,
  opponentName,
  liveScores,
}: PickProgressFeedProps): React.ReactElement {
  const [feed, setFeed] = useState<CombinedPick[]>([]);
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set());
  const prevFeedRef = useRef<CombinedPick[]>([]);

  // =====================================================
  // Merge and Sort on Data Change
  // =====================================================

  useEffect(() => {
    const merged = mergeAndSortPicks(prevFeedRef.current, userPicks, opponentPicks, {
      currentUserId,
      userName,
      opponentName,
    });

    // Detect status changes for flash animation
    const changed = detectStatusChanges(prevFeedRef.current, merged);
    setChangedIds(changed);

    // Update feed
    setFeed(merged);
    prevFeedRef.current = merged;

    // Clear changed IDs after animation duration
    if (changed.size > 0) {
      const timer = setTimeout(() => setChangedIds(new Set()), FLASH_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [userPicks, opponentPicks, currentUserId, userName, opponentName]);

  // =====================================================
  // Render Item
  // =====================================================

  const renderItem = useCallback(
    ({ item }: { item: CombinedPick }) => (
      <PickFeedItem
        pick={item}
        liveScore={liveScores.get(item.sportsEventId)}
        shouldFlash={changedIds.has(item.id)}
      />
    ),
    [liveScores, changedIds]
  );

  const keyExtractor = useCallback((item: CombinedPick) => item.id, []);

  // =====================================================
  // Summary Stats
  // =====================================================

  const summary = useMemo(() => getPickFeedSummary(feed), [feed]);

  // =====================================================
  // Empty State
  // =====================================================

  if (feed.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No picks yet</Text>
      </View>
    );
  }

  // =====================================================
  // Render
  // =====================================================

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Pick Activity</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            <Text style={styles.resolvedCount}>{summary.totalResolved}</Text> resolved
          </Text>
          {summary.totalPending > 0 && (
            <Text style={styles.summaryText}>
              <Text style={styles.pendingCount}>{summary.totalPending}</Text> pending
            </Text>
          )}
        </View>
      </View>

      {/* Feed List */}
      <FlatList
        data={feed}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={ItemSeparator}
      />
    </View>
  );
}

// =====================================================
// Sub-components
// =====================================================

function ItemSeparator() {
  return <View style={styles.separator} />;
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },

  header: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(107, 114, 128, 0.2)',
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  summaryText: {
    color: '#6b7280',
    fontSize: 12,
  },
  resolvedCount: {
    color: '#22c55e',
    fontWeight: '600',
  },
  pendingCount: {
    color: '#9ca3af',
    fontWeight: '600',
  },

  listContent: {
    padding: 10,
  },
  separator: {
    height: 8,
  },

  emptyContainer: {
    backgroundColor: LUXURY_THEME.surface.card,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.subtle,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
});

export default PickProgressFeed;
