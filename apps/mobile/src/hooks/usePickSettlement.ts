// =====================================================
// usePickSettlement Hook
// =====================================================
// Detects pick settlement from live score updates and
// triggers callbacks for toast notifications.
//
// Features:
// - Watches scores map for COMPLETED events
// - Computes pick outcomes via settlement helpers
// - Deduplication via AsyncStorage
// - Prevents duplicate toasts on reconnect

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventScore } from './useMatchSocket';
import {
  derivePickStatus,
  getPickTeamName,
  getPickTypeLabel,
  type PickForSettlement,
  type SettlementResult,
  type PickStatus,
} from '../utils/settlement-helpers';

// =====================================================
// Types
// =====================================================

export interface UsePickSettlementOptions {
  /** The match ID (for deduplication key) */
  matchId: string;
  /** Array of picks to monitor */
  picks: PickForSettlement[];
  /** Map of event scores from socket */
  scores: Map<string, EventScore>;
  /** Callback when a pick settles */
  onPickSettled?: (result: SettlementResult) => void;
  /** Whether settlement detection is enabled */
  enabled?: boolean;
}

export interface UsePickSettlementReturn {
  /** Map of pick ID to settlement result */
  settledPicks: Map<string, SettlementResult>;
  /** Whether any picks are still pending */
  hasPendingPicks: boolean;
  /** Whether all picks have been settled */
  allPicksSettled: boolean;
  /** Count of picks by status */
  pickCounts: { pending: number; hit: number; miss: number; push: number };
}

// =====================================================
// Constants
// =====================================================

const STORAGE_KEY = '@pick_rivals:notified_settlements';
const SETTLEMENT_TTL_DAYS = 7;

// =====================================================
// Hook Implementation
// =====================================================

export function usePickSettlement({
  matchId,
  picks,
  scores,
  onPickSettled,
  enabled = true,
}: UsePickSettlementOptions): UsePickSettlementReturn {
  // Track settled picks
  const [settledPicks, setSettledPicks] = useState<Map<string, SettlementResult>>(
    new Map()
  );

  // Track which settlements we've already notified about
  const notifiedRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);

  // Load persisted notification state on mount
  useEffect(() => {
    async function loadNotifiedSettlements() {
      try {
        const data = await AsyncStorage.getItem(STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data) as { key: string; timestamp: number }[];

          // Prune old entries (older than TTL)
          const cutoff = Date.now() - SETTLEMENT_TTL_DAYS * 24 * 60 * 60 * 1000;
          const valid = parsed.filter((entry) => entry.timestamp > cutoff);

          notifiedRef.current = new Set(valid.map((entry) => entry.key));

          // Save pruned list back
          if (valid.length !== parsed.length) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          }
        }
      } catch (error) {
        console.warn('[usePickSettlement] Failed to load notified settlements:', error);
      }
      isInitializedRef.current = true;
    }

    loadNotifiedSettlements();
  }, []);

  // Persist notification to AsyncStorage
  const persistNotification = useCallback(async (key: string) => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const existing = data ? JSON.parse(data) : [];
      existing.push({ key, timestamp: Date.now() });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
      console.warn('[usePickSettlement] Failed to persist notification:', error);
    }
  }, []);

  // Process picks and detect settlements
  useEffect(() => {
    if (!enabled || !isInitializedRef.current || picks.length === 0) {
      return;
    }

    const newSettlements = new Map<string, SettlementResult>();

    for (const pick of picks) {
      // Find the score for this pick's event
      const eventScore = scores.get(pick.sportsEventId);

      // Derive status
      const derivedStatus = derivePickStatus(pick, eventScore);

      // Skip if still pending
      if (derivedStatus === 'PENDING') {
        continue;
      }

      // Create settlement result
      const result: SettlementResult = {
        pickId: pick.id,
        eventId: pick.sportsEventId,
        status: derivedStatus,
        previousStatus: pick.status,
        pointValue: pick.pointValue,
        pickDetails: {
          teamName: getPickTeamName(pick),
          pickType: getPickTypeLabel(pick.pickType),
          selection: pick.selection,
        },
        timestamp: new Date().toISOString(),
      };

      newSettlements.set(pick.id, result);

      // Check if we should notify
      const notificationKey = `${matchId}-${pick.id}`;
      const shouldNotify =
        !notifiedRef.current.has(notificationKey) &&
        pick.status === 'PENDING' && // Only notify if pick was previously pending
        derivedStatus !== 'PENDING';

      if (shouldNotify) {
        // Mark as notified
        notifiedRef.current.add(notificationKey);
        persistNotification(notificationKey);

        // Trigger callback
        if (onPickSettled) {
          onPickSettled(result);
        }
      }
    }

    // Update settled picks state
    setSettledPicks((prev) => {
      // Merge new settlements with existing
      const merged = new Map(prev);
      newSettlements.forEach((value, key) => {
        merged.set(key, value);
      });
      return merged;
    });
  }, [enabled, matchId, picks, scores, onPickSettled, persistNotification]);

  // Calculate pick counts
  const pickCounts = { pending: 0, hit: 0, miss: 0, push: 0 };
  for (const pick of picks) {
    const result = settledPicks.get(pick.id);
    const status: PickStatus = result?.status ?? 'PENDING';

    switch (status) {
      case 'HIT':
        pickCounts.hit++;
        break;
      case 'MISS':
        pickCounts.miss++;
        break;
      case 'PUSH':
        pickCounts.push++;
        break;
      default:
        pickCounts.pending++;
    }
  }

  const hasPendingPicks = pickCounts.pending > 0;
  const allPicksSettled = picks.length > 0 && pickCounts.pending === 0;

  return {
    settledPicks,
    hasPendingPicks,
    allPicksSettled,
    pickCounts,
  };
}

export default usePickSettlement;
