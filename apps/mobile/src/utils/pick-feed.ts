// =====================================================
// Pick Feed Utilities
// =====================================================
// Merge, sort, and track changes in pick feeds for the
// combined pick progress display in live matches.

import type { ApiPickResponse } from '../services/slip.service';

// =====================================================
// Types
// =====================================================

export interface CombinedPick extends ApiPickResponse {
  /** Owner identifier: 'user' | 'opponent' */
  owner: 'user' | 'opponent';
  /** Owner display name for UI */
  ownerName: string;
}

export interface MergePicksOptions {
  currentUserId: string;
  userName: string;
  opponentName: string;
}

// =====================================================
// Constants
// =====================================================

const RESOLVED_STATUSES = new Set(['HIT', 'MISS', 'PUSH', 'VOID']);

// =====================================================
// Functions
// =====================================================

/**
 * Merge picks from both slips, deduplicate by ID, and sort.
 *
 * Sort order:
 * 1. Resolved picks first (HIT, MISS, PUSH, VOID), sorted by settledAt DESC
 * 2. Pending picks second, sorted by createdAt DESC
 *
 * @param existingPicks - Current feed state (for upsert)
 * @param userPicks - User's picks from API
 * @param opponentPicks - Opponent's picks from API
 * @param options - User identification options
 */
export function mergeAndSortPicks(
  existingPicks: CombinedPick[],
  userPicks: ApiPickResponse[],
  opponentPicks: ApiPickResponse[],
  options: MergePicksOptions
): CombinedPick[] {
  const { userName, opponentName } = options;

  // Create map for upsert (existing picks by ID)
  const pickMap = new Map<string, CombinedPick>();

  // Add existing picks to map (preserves any local state)
  for (const pick of existingPicks) {
    pickMap.set(pick.id, pick);
  }

  // Upsert user picks
  for (const pick of userPicks) {
    pickMap.set(pick.id, {
      ...pick,
      owner: 'user',
      ownerName: userName,
    });
  }

  // Upsert opponent picks
  for (const pick of opponentPicks) {
    pickMap.set(pick.id, {
      ...pick,
      owner: 'opponent',
      ownerName: opponentName,
    });
  }

  // Convert to array and sort
  const allPicks = Array.from(pickMap.values());

  return sortPicksFeed(allPicks);
}

/**
 * Sort picks: resolved first by settledAt DESC, then pending by createdAt DESC
 */
export function sortPicksFeed(picks: CombinedPick[]): CombinedPick[] {
  return [...picks].sort((a, b) => {
    const aResolved = RESOLVED_STATUSES.has(a.status);
    const bResolved = RESOLVED_STATUSES.has(b.status);

    // Resolved picks come first
    if (aResolved && !bResolved) return -1;
    if (!aResolved && bResolved) return 1;

    if (aResolved && bResolved) {
      // Both resolved: sort by settledAt DESC (most recent first)
      const aTime = a.settledAt ? new Date(a.settledAt).getTime() : 0;
      const bTime = b.settledAt ? new Date(b.settledAt).getTime() : 0;
      return bTime - aTime;
    }

    // Both pending: sort by createdAt DESC (most recent first)
    const aCreated = new Date(a.createdAt).getTime();
    const bCreated = new Date(b.createdAt).getTime();
    return bCreated - aCreated;
  });
}

/**
 * Detect picks that changed status (for flash animation trigger)
 *
 * @param prevPicks - Previous feed state
 * @param nextPicks - New feed state
 * @returns Set of pick IDs that changed status
 */
export function detectStatusChanges(
  prevPicks: CombinedPick[],
  nextPicks: CombinedPick[]
): Set<string> {
  const changedIds = new Set<string>();
  const prevStatusMap = new Map(prevPicks.map((p) => [p.id, p.status]));

  for (const pick of nextPicks) {
    const prevStatus = prevStatusMap.get(pick.id);
    if (prevStatus && prevStatus !== pick.status) {
      changedIds.add(pick.id);
    }
  }

  return changedIds;
}

/**
 * Get summary stats from a combined pick feed
 */
export function getPickFeedSummary(picks: CombinedPick[]) {
  let userHits = 0;
  let opponentHits = 0;
  let totalResolved = 0;
  let totalPending = 0;

  for (const pick of picks) {
    const isResolved = RESOLVED_STATUSES.has(pick.status);

    if (isResolved) {
      totalResolved++;
      if (pick.status === 'HIT') {
        if (pick.owner === 'user') {
          userHits++;
        } else {
          opponentHits++;
        }
      }
    } else {
      totalPending++;
    }
  }

  return { userHits, opponentHits, totalResolved, totalPending };
}
