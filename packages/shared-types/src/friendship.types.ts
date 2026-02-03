/**
 * Task 0.3: Friendship System Types
 * Defines types for the social/friendship features
 */

export enum FriendshipStatus {
  PENDING = 'PENDING',   // Request sent, awaiting response
  ACCEPTED = 'ACCEPTED', // Both users are friends
  DECLINED = 'DECLINED', // Request was declined
  BLOCKED = 'BLOCKED',   // User blocked the other
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt?: Date | null;
  blockedAt?: Date | null;
  declinedAt?: Date | null;
}

export interface FriendshipWithUser extends Friendship {
  requester?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    lastActiveAt?: Date | null;
  };
  addressee?: {
    id: string;
    username: string;
    avatarUrl?: string | null;
    lastActiveAt?: Date | null;
  };
}

export interface SendFriendRequestPayload {
  friendId: string;
}

export interface FriendRequestResponse {
  friendshipId: string;
  accept: boolean;
}
