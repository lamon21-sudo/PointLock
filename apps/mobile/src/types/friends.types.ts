// =====================================================
// Friends Type Definitions
// =====================================================
// Type definitions for the friends system including
// friendship status, user data, and pagination

/**
 * Status of a friendship relationship
 */
export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  BLOCKED = 'BLOCKED',
}

/**
 * Tab selection for friends screen
 */
export type FriendsTab = 'friends' | 'requests';

/**
 * Filter type for friends list API
 */
export type FriendshipFilter = 'accepted' | 'incoming' | 'outgoing' | 'blocked';

/**
 * Friend user data extracted from friendship
 */
export interface FriendUser {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  lastActiveAt?: string;
}

/**
 * Friendship relationship data
 */
export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  // Related user data
  requester: FriendUser;
  addressee: FriendUser;
}

/**
 * Pagination metadata for friends list
 */
export interface FriendsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * API response for friends list
 */
export interface FriendsListResponse {
  friendships: Friendship[];
  pagination: FriendsPagination;
}

/**
 * API response for friendship status check
 */
export interface FriendshipStatusResponse {
  status: FriendshipStatus | null;
  friendshipId: string | null;
  isRequester: boolean;
}

/**
 * Helper to extract the friend user from a friendship
 * @param friendship - The friendship relationship
 * @param currentUserId - Current user's ID
 * @returns The friend user object
 */
export function getFriendFromFriendship(
  friendship: Friendship,
  currentUserId: string
): FriendUser {
  // If current user is the requester, friend is the addressee
  if (friendship.requester.id === currentUserId) {
    return friendship.addressee;
  }
  // Otherwise friend is the requester
  return friendship.requester;
}

/**
 * Helper to check if user is online (active within 5 minutes)
 * @param lastActiveAt - ISO timestamp of last activity
 * @returns True if user is considered online
 */
export function isUserOnline(lastActiveAt?: string): boolean {
  if (!lastActiveAt) return false;

  const now = Date.now();
  const lastActive = new Date(lastActiveAt).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  return now - lastActive < fiveMinutes;
}
