// =====================================================
// Matchmaking Service
// =====================================================
// API client for matchmaking and queue operations.
// Handles quick match, random match, friend challenges, and queue status.

import { api } from './api';

// =====================================================
// API Response Types
// =====================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// =====================================================
// Queue Entry Types
// =====================================================

export type QueueEntryStatus = 'WAITING' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';

export interface QueueEntryInfo {
  id: string;
  userId: string;
  gameMode: string;
  tier: string;
  stakeAmount: number;
  skillRating: number;
  slipSize: number | null;
  status: QueueEntryStatus;
  enqueuedAt: string;
  expiresAt: string;
  matchId: string | null;
}

// =====================================================
// Request Payload Types
// =====================================================

export interface JoinQueueParams {
  slipId: string;
  stakeAmount: number;
  region?: string;
  idempotencyKey?: string;
}

export interface RandomMatchParams {
  slipId: string;
  stakeAmount: number;
  lobbyExpiresIn?: number;
}

export interface FriendChallengeParams {
  slipId: string;
  stakeAmount: number;
  message?: string;
}

// =====================================================
// Response Types
// =====================================================

export interface QueueStatusResponse {
  inQueue: boolean;
  entry: QueueEntryInfo | null;
  position?: number;
  estimatedWaitMs?: number;
}

export interface QuickMatchResponse {
  status: 'QUEUED' | 'MATCHED';
  queueEntry?: QueueEntryInfo;
  match?: MatchDetails;
}

export interface RandomMatchResponse {
  status: 'LOBBY_CREATED';
  match: MatchDetails;
  lobbyCode: string;
}

export interface FriendChallengeResponse {
  status: 'CHALLENGE_SENT';
  match: MatchDetails;
  targetUserId: string;
}

export interface QueueLeaveResponse {
  success: boolean;
  refunded: boolean;
  message: string;
}

// Minimal match details for queue responses
export interface MatchDetails {
  id: string;
  type: string;
  stakeAmount: number;
  status: string;
  inviteCode: string | null;
  createdAt: string;
}

// =====================================================
// Matchmaking Service
// =====================================================

export const MatchmakingService = {
  /**
   * Join the matchmaking queue directly.
   * POST /matchmaking/queue
   * @param params - Queue join parameters including slipId and stakeAmount.
   * @returns Queue entry info on success.
   * @throws Error if join fails (insufficient balance, invalid slip, etc).
   */
  async joinQueue(params: JoinQueueParams): Promise<QueueEntryInfo> {
    const response = await api.post<ApiResponse<QueueEntryInfo>>(
      '/matchmaking/queue',
      params
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to join matchmaking queue'
      );
    }

    return response.data.data;
  },

  /**
   * Leave the matchmaking queue.
   * DELETE /matchmaking/queue/:gameMode
   * @param gameMode - Game mode to leave (defaults to QUICK_MATCH).
   * @returns Leave result with refund status.
   * @throws Error if leave fails.
   */
  async leaveQueue(gameMode: string = 'QUICK_MATCH'): Promise<QueueLeaveResponse> {
    const response = await api.delete<ApiResponse<QueueLeaveResponse>>(
      `/matchmaking/queue/${gameMode}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to leave matchmaking queue'
      );
    }

    return response.data.data;
  },

  /**
   * Get current queue status.
   * GET /matches/queue/status
   * @returns Queue status including position and estimated wait time.
   * @throws Error if status fetch fails.
   */
  async getQueueStatus(): Promise<QueueStatusResponse> {
    const response = await api.get<ApiResponse<QueueStatusResponse>>(
      '/matches/queue/status'
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to get queue status'
      );
    }

    return response.data.data;
  },

  /**
   * Start a quick match (auto-matchmaking).
   * POST /matches/quick
   * @param params - Match parameters including slipId and stakeAmount.
   * @returns Queue entry or immediate match if found instantly.
   * @throws Error if quick match fails.
   */
  async quickMatch(params: JoinQueueParams): Promise<QuickMatchResponse> {
    const response = await api.post<ApiResponse<QuickMatchResponse>>(
      '/matches/quick',
      params
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to start quick match'
      );
    }

    return response.data.data;
  },

  /**
   * Create a random match lobby.
   * POST /matches/random
   * @param params - Lobby parameters including slipId, stakeAmount, and optional expiry.
   * @returns Created match with lobby code.
   * @throws Error if lobby creation fails.
   */
  async randomMatch(params: RandomMatchParams): Promise<RandomMatchResponse> {
    const response = await api.post<ApiResponse<RandomMatchResponse>>(
      '/matches/random',
      params
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to create random match lobby'
      );
    }

    return response.data.data;
  },

  /**
   * Challenge a friend to a match.
   * POST /matches/friend/:userId
   * @param targetUserId - Friend's user ID to challenge.
   * @param params - Challenge parameters including slipId, stakeAmount, and optional message.
   * @returns Challenge result with match details.
   * @throws Error if challenge fails.
   */
  async challengeFriend(
    targetUserId: string,
    params: FriendChallengeParams
  ): Promise<FriendChallengeResponse> {
    const response = await api.post<ApiResponse<FriendChallengeResponse>>(
      `/matches/friend/${targetUserId}`,
      params
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to send friend challenge'
      );
    }

    return response.data.data;
  },
};

export default MatchmakingService;
