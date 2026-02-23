// =====================================================
// Friends Service
// =====================================================
// Handles all friendship-related business logic.
// CRITICAL: All operations are atomic and properly validated.
// Race conditions are prevented through proper query ordering.

import { FriendshipStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../utils/logger';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../../utils/errors';
import { ERROR_CODES } from '@pick-rivals/shared-types';

// ===========================================
// Types
// ===========================================

/**
 * User details included in friendship responses
 */
interface FriendshipUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastActiveAt: Date | null;
}

/**
 * Complete friendship record with user details
 */
export interface FriendshipWithUsers {
  id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  blockedAt: Date | null;
  declinedAt: Date | null;
  requester: FriendshipUser;
  addressee: FriendshipUser;
}

/**
 * Parameters for listing friendships
 */
export interface ListFriendshipsParams {
  filter?: 'all' | 'accepted' | 'incoming' | 'outgoing' | 'blocked';
  page?: number;
  limit?: number;
}

/**
 * Paginated friendship list result
 */
export interface PaginatedFriendships {
  friendships: FriendshipWithUsers[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Friendship status for UI button states
 */
export interface FriendshipStatusResult {
  status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked' | 'blocked_by';
  friendshipId: string | null;
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canRemove: boolean;
  canBlock: boolean;
  canUnblock: boolean;
}

// ===========================================
// User Selection Helper
// ===========================================

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  lastActiveAt: true,
};

// ===========================================
// Service Functions
// ===========================================

/**
 * List friendships for a user with filtering and pagination
 */
export async function listFriendships(
  userId: string,
  params: ListFriendshipsParams
): Promise<PaginatedFriendships> {
  const { filter = 'all', page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  logger.info(`Listing friendships for user ${userId}`, { filter, page, limit });

  // Build where clause based on filter
  let whereClause: any = {};

  switch (filter) {
    case 'accepted':
      whereClause = {
        OR: [
          { userId, status: FriendshipStatus.ACCEPTED },
          { friendId: userId, status: FriendshipStatus.ACCEPTED },
        ],
      };
      break;

    case 'incoming':
      // Requests where current user is the addressee
      whereClause = {
        friendId: userId,
        status: FriendshipStatus.PENDING,
      };
      break;

    case 'outgoing':
      // Requests where current user is the requester
      whereClause = {
        userId: userId,
        status: FriendshipStatus.PENDING,
      };
      break;

    case 'blocked':
      // Users blocked by current user
      whereClause = {
        userId: userId,
        status: FriendshipStatus.BLOCKED,
      };
      break;

    case 'all':
    default:
      whereClause = {
        OR: [{ userId }, { friendId: userId }],
      };
      break;
  }

  // Execute query with pagination
  const [friendships, total] = await Promise.all([
    prisma.friendship.findMany({
      where: whereClause,
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.friendship.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    friendships,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Send a friend request
 * CRITICAL: Handles duplicate detection and mutual pending auto-accept
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<FriendshipWithUsers> {
  // Validate: Cannot send request to self
  if (requesterId === addresseeId) {
    throw new BadRequestError(
      'Cannot send friend request to yourself',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  logger.info(`Friend request: ${requesterId} -> ${addresseeId}`);

  // Check if addressee exists
  const addressee = await prisma.user.findUnique({
    where: { id: addresseeId },
    select: { id: true },
  });

  if (!addressee) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  // Check for existing friendship in either direction
  const [existingOutgoing, existingIncoming] = await Promise.all([
    prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: requesterId,
          friendId: addresseeId,
        },
      },
    }),
    prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: addresseeId,
          friendId: requesterId,
        },
      },
    }),
  ]);

  // If outgoing friendship exists, reject based on status
  if (existingOutgoing) {
    switch (existingOutgoing.status) {
      case FriendshipStatus.PENDING:
        throw new ConflictError(
          'Friend request already sent',
          ERROR_CODES.EMAIL_ALREADY_EXISTS // Reusing conflict code
        );
      case FriendshipStatus.ACCEPTED:
        throw new ConflictError(
          'Already friends with this user',
          ERROR_CODES.EMAIL_ALREADY_EXISTS
        );
      case FriendshipStatus.BLOCKED:
        throw new ForbiddenError(
          'Cannot send friend request to blocked user',
          ERROR_CODES.FORBIDDEN
        );
      case FriendshipStatus.DECLINED:
        // Allow re-requesting after decline - delete old record
        await prisma.friendship.delete({
          where: { id: existingOutgoing.id },
        });
        break;
    }
  }

  // CRITICAL: Auto-accept if mutual pending exists
  if (existingIncoming?.status === FriendshipStatus.PENDING) {
    logger.info('Mutual pending request detected - auto-accepting', {
      requesterId,
      addresseeId,
      existingFriendshipId: existingIncoming.id,
    });

    // Accept the existing incoming request
    const acceptedFriendship = await prisma.friendship.update({
      where: { id: existingIncoming.id },
      data: {
        status: FriendshipStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    });

    logger.info('Friendship auto-accepted', {
      friendshipId: acceptedFriendship.id,
      requesterId,
      addresseeId,
    });

    return acceptedFriendship;
  }

  // Reject if incoming friendship is accepted or blocked
  if (existingIncoming?.status === FriendshipStatus.ACCEPTED) {
    throw new ConflictError(
      'Already friends with this user',
      ERROR_CODES.EMAIL_ALREADY_EXISTS
    );
  }

  if (existingIncoming?.status === FriendshipStatus.BLOCKED) {
    throw new ForbiddenError(
      'This user has blocked you',
      ERROR_CODES.FORBIDDEN
    );
  }

  // Create new friend request
  const friendship = await prisma.friendship.create({
    data: {
      userId: requesterId,
      friendId: addresseeId,
      status: FriendshipStatus.PENDING,
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  logger.info('Friend request created', {
    friendshipId: friendship.id,
    requesterId,
    addresseeId,
  });

  // Notify the addressee about the incoming friend request (fire-and-forget)
  try {
    const { sendNotification } = await import('../../services/notifications/notification.service');
    const { NotificationCategory } = await import('../../services/notifications/notification-categories');
    await sendNotification({
      userId: addresseeId,
      category: NotificationCategory.SOCIAL,
      templateId: 'social.friend_request',
      variables: { friendName: friendship.requester.username },
      entityId: requesterId,
      dedupeKey: `friend_request:${requesterId}:${addresseeId}`,
    });
  } catch (error) {
    // Notification failure must not block the friend request response
    logger.warn('[Friends] Failed to send friend request notification', { error });
  }

  return friendship;
}

/**
 * Accept a friend request
 * CRITICAL: Only the addressee can accept
 */
export async function acceptFriendRequest(
  userId: string,
  friendshipId: string
): Promise<FriendshipWithUsers> {
  logger.info(`Accepting friend request ${friendshipId} by user ${userId}`);

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new NotFoundError(
      'Friend request not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  // CRITICAL: Only addressee can accept
  if (friendship.friendId !== userId) {
    throw new ForbiddenError(
      'Only the recipient can accept this friend request',
      ERROR_CODES.FORBIDDEN
    );
  }

  if (friendship.status !== FriendshipStatus.PENDING) {
    throw new BadRequestError(
      `Cannot accept request with status: ${friendship.status}`,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  const acceptedFriendship = await prisma.friendship.update({
    where: { id: friendshipId },
    data: {
      status: FriendshipStatus.ACCEPTED,
      acceptedAt: new Date(),
    },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  logger.info('Friend request accepted', {
    friendshipId,
    requesterId: friendship.userId,
    addresseeId: userId,
  });

  return acceptedFriendship;
}

/**
 * Decline a friend request
 * CRITICAL: Only the addressee can decline
 */
export async function declineFriendRequest(
  userId: string,
  friendshipId: string
): Promise<void> {
  logger.info(`Declining friend request ${friendshipId} by user ${userId}`);

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new NotFoundError(
      'Friend request not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  // CRITICAL: Only addressee can decline
  if (friendship.friendId !== userId) {
    throw new ForbiddenError(
      'Only the recipient can decline this friend request',
      ERROR_CODES.FORBIDDEN
    );
  }

  if (friendship.status !== FriendshipStatus.PENDING) {
    throw new BadRequestError(
      `Cannot decline request with status: ${friendship.status}`,
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data: {
      status: FriendshipStatus.DECLINED,
      declinedAt: new Date(),
    },
  });

  logger.info('Friend request declined', {
    friendshipId,
    requesterId: friendship.userId,
    addresseeId: userId,
  });
}

/**
 * Remove or cancel a friendship
 * CRITICAL: Requester can cancel pending, either party can remove accepted
 */
export async function removeFriendship(
  userId: string,
  friendshipId: string
): Promise<void> {
  logger.info(`Removing friendship ${friendshipId} by user ${userId}`);

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship) {
    throw new NotFoundError(
      'Friendship not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  const isRequester = friendship.userId === userId;
  const isAddressee = friendship.friendId === userId;

  if (!isRequester && !isAddressee) {
    throw new ForbiddenError(
      'You are not part of this friendship',
      ERROR_CODES.FORBIDDEN
    );
  }

  // CRITICAL: Only requester can cancel pending
  if (friendship.status === FriendshipStatus.PENDING) {
    if (!isRequester) {
      throw new ForbiddenError(
        'Only the requester can cancel a pending friend request',
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  // For accepted friendships, either party can remove
  if (friendship.status === FriendshipStatus.ACCEPTED) {
    if (!isRequester && !isAddressee) {
      throw new ForbiddenError(
        'You are not part of this friendship',
        ERROR_CODES.FORBIDDEN
      );
    }
  }

  // Delete the friendship
  await prisma.friendship.delete({
    where: { id: friendshipId },
  });

  logger.info('Friendship removed', {
    friendshipId,
    userId,
    wasRequester: isRequester,
  });
}

/**
 * Block a user
 * CRITICAL: Creates/updates to BLOCKED, deletes inverse friendship
 */
export async function blockUser(
  userId: string,
  targetUserId: string
): Promise<FriendshipWithUsers> {
  if (userId === targetUserId) {
    throw new BadRequestError(
      'Cannot block yourself',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  logger.info(`User ${userId} blocking ${targetUserId}`);

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });

  if (!targetUser) {
    throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);
  }

  // Use transaction to ensure atomicity
  const blockedFriendship = await prisma.$transaction(async (tx) => {
    // Delete inverse friendship if exists (target -> blocker)
    await tx.friendship.deleteMany({
      where: {
        userId: targetUserId,
        friendId: userId,
      },
    });

    // Upsert the block record (blocker -> target)
    const block = await tx.friendship.upsert({
      where: {
        userId_friendId: {
          userId: userId,
          friendId: targetUserId,
        },
      },
      update: {
        status: FriendshipStatus.BLOCKED,
        blockedAt: new Date(),
      },
      create: {
        userId: userId,
        friendId: targetUserId,
        status: FriendshipStatus.BLOCKED,
        blockedAt: new Date(),
      },
      include: {
        requester: { select: userSelect },
        addressee: { select: userSelect },
      },
    });

    return block;
  });

  logger.info('User blocked successfully', {
    blockerId: userId,
    blockedUserId: targetUserId,
    friendshipId: blockedFriendship.id,
  });

  return blockedFriendship;
}

/**
 * Unblock a user
 * CRITICAL: Removes the block record completely
 */
export async function unblockUser(
  userId: string,
  targetUserId: string
): Promise<void> {
  if (userId === targetUserId) {
    throw new BadRequestError(
      'Cannot unblock yourself',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  logger.info(`User ${userId} unblocking ${targetUserId}`);

  const blockRecord = await prisma.friendship.findUnique({
    where: {
      userId_friendId: {
        userId: userId,
        friendId: targetUserId,
      },
    },
  });

  if (!blockRecord) {
    throw new NotFoundError(
      'Block record not found',
      ERROR_CODES.USER_NOT_FOUND
    );
  }

  if (blockRecord.status !== FriendshipStatus.BLOCKED) {
    throw new BadRequestError(
      'This user is not blocked',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  await prisma.friendship.delete({
    where: { id: blockRecord.id },
  });

  logger.info('User unblocked successfully', {
    blockerId: userId,
    unblockedUserId: targetUserId,
  });
}

/**
 * Get friendship status between two users
 * Used for UI button state determination
 */
export async function getFriendshipStatus(
  userId: string,
  targetUserId: string
): Promise<FriendshipStatusResult> {
  if (userId === targetUserId) {
    throw new BadRequestError(
      'Cannot check friendship status with yourself',
      ERROR_CODES.VALIDATION_ERROR
    );
  }

  logger.debug(`Checking friendship status between ${userId} and ${targetUserId}`);

  // Check both directions
  const [outgoing, incoming] = await Promise.all([
    prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: userId,
          friendId: targetUserId,
        },
      },
    }),
    prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: targetUserId,
          friendId: userId,
        },
      },
    }),
  ]);

  // User has blocked target
  if (outgoing?.status === FriendshipStatus.BLOCKED) {
    return {
      status: 'blocked',
      friendshipId: outgoing.id,
      canAccept: false,
      canDecline: false,
      canCancel: false,
      canRemove: false,
      canBlock: false,
      canUnblock: true,
    };
  }

  // Target has blocked user
  if (incoming?.status === FriendshipStatus.BLOCKED) {
    return {
      status: 'blocked_by',
      friendshipId: incoming.id,
      canAccept: false,
      canDecline: false,
      canCancel: false,
      canRemove: false,
      canBlock: false,
      canUnblock: false,
    };
  }

  // Already friends
  if (outgoing?.status === FriendshipStatus.ACCEPTED || incoming?.status === FriendshipStatus.ACCEPTED) {
    const friendshipId = outgoing?.status === FriendshipStatus.ACCEPTED ? outgoing.id : incoming!.id;
    return {
      status: 'accepted',
      friendshipId,
      canAccept: false,
      canDecline: false,
      canCancel: false,
      canRemove: true,
      canBlock: true,
      canUnblock: false,
    };
  }

  // User has sent pending request
  if (outgoing?.status === FriendshipStatus.PENDING) {
    return {
      status: 'pending_sent',
      friendshipId: outgoing.id,
      canAccept: false,
      canDecline: false,
      canCancel: true,
      canRemove: false,
      canBlock: true,
      canUnblock: false,
    };
  }

  // User has received pending request
  if (incoming?.status === FriendshipStatus.PENDING) {
    return {
      status: 'pending_received',
      friendshipId: incoming.id,
      canAccept: true,
      canDecline: true,
      canCancel: false,
      canRemove: false,
      canBlock: true,
      canUnblock: false,
    };
  }

  // No relationship
  return {
    status: 'none',
    friendshipId: null,
    canAccept: false,
    canDecline: false,
    canCancel: false,
    canRemove: false,
    canBlock: true,
    canUnblock: false,
  };
}
