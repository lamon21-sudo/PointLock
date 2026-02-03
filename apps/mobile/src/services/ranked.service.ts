// =====================================================
// Ranked Service
// =====================================================
// API service for ranked/season endpoints.
// Uses mock data for season and rewards until backend endpoints are ready.

import { api } from './api';
import {
  Rank,
  PlacementStatus,
  RankedProgress,
  Season,
  SeasonStatus,
  SeasonReward,
  RANK_THRESHOLDS,
  RANK_ORDER,
} from '@pick-rivals/shared-types';

// =====================================================
// Types
// =====================================================

export type RewardStatus = 'locked' | 'unlocked' | 'claimed';

export interface RewardItem {
  id: string;
  minRank: Rank;
  maxRank: Rank;
  coinReward: number;
  description?: string;
  status: RewardStatus;
}

export interface RankedData {
  season: Season | null;
  placement: PlacementStatus | null;
  progress: RankedProgress | null;
  rewards: RewardItem[];
}

// =====================================================
// Mock Data
// =====================================================

// TODO: Replace with GET /api/v1/seasons/active when backend ready
const MOCK_SEASON: Season = {
  id: 'season-1',
  name: 'Season 1',
  slug: 'season-1',
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-03-01'),
  status: SeasonStatus.ACTIVE,
  isCurrent: true,
  createdAt: new Date('2025-12-01'),
  updatedAt: new Date('2025-12-01'),
};

// TODO: Replace with GET /api/v1/seasons/:seasonId/rewards when backend ready
const MOCK_REWARDS: SeasonReward[] = [
  {
    id: 'reward-bronze',
    seasonId: 'season-1',
    minRank: Rank.BRONZE_1,
    maxRank: Rank.BRONZE_3,
    coinReward: 100,
    description: 'Bronze tier completion reward',
    createdAt: new Date(),
  },
  {
    id: 'reward-silver',
    seasonId: 'season-1',
    minRank: Rank.SILVER_1,
    maxRank: Rank.SILVER_3,
    coinReward: 250,
    description: 'Silver tier completion reward',
    createdAt: new Date(),
  },
  {
    id: 'reward-gold',
    seasonId: 'season-1',
    minRank: Rank.GOLD_1,
    maxRank: Rank.GOLD_3,
    coinReward: 500,
    description: 'Gold tier completion reward',
    createdAt: new Date(),
  },
  {
    id: 'reward-platinum',
    seasonId: 'season-1',
    minRank: Rank.PLATINUM_1,
    maxRank: Rank.PLATINUM_3,
    coinReward: 1000,
    description: 'Platinum tier completion reward',
    createdAt: new Date(),
  },
  {
    id: 'reward-diamond',
    seasonId: 'season-1',
    minRank: Rank.DIAMOND_1,
    maxRank: Rank.DIAMOND_3,
    coinReward: 2500,
    description: 'Diamond tier completion reward',
    createdAt: new Date(),
  },
];

// Mock claimed rewards (would come from backend)
const MOCK_CLAIMED_REWARD_IDS: string[] = [];

// =====================================================
// Helper Functions
// =====================================================

/**
 * Check if a rank is within a reward's range
 */
function isRankInRange(rank: Rank, minRank: Rank, maxRank: Rank): boolean {
  const rankIndex = RANK_ORDER.indexOf(rank);
  const minIndex = RANK_ORDER.indexOf(minRank);
  const maxIndex = RANK_ORDER.indexOf(maxRank);
  return rankIndex >= minIndex && rankIndex <= maxIndex;
}

/**
 * Check if a rank qualifies for a reward (at or above min rank)
 */
function qualifiesForReward(rank: Rank | null, minRank: Rank): boolean {
  if (!rank) return false;
  const rankIndex = RANK_ORDER.indexOf(rank);
  const minIndex = RANK_ORDER.indexOf(minRank);
  return rankIndex >= minIndex;
}

/**
 * Convert SeasonReward to RewardItem with status
 */
function toRewardItem(
  reward: SeasonReward,
  currentRank: Rank | null,
  claimedIds: string[]
): RewardItem {
  let status: RewardStatus = 'locked';

  if (claimedIds.includes(reward.id)) {
    status = 'claimed';
  } else if (qualifiesForReward(currentRank, reward.minRank)) {
    status = 'unlocked';
  }

  return {
    id: reward.id,
    minRank: reward.minRank,
    maxRank: reward.maxRank,
    coinReward: reward.coinReward,
    description: reward.description ?? undefined,
    status,
  };
}

// =====================================================
// Service Implementation
// =====================================================

export const RankedService = {
  /**
   * Get current active season
   * TODO: Wire to GET /api/v1/seasons/active when backend ready
   */
  async getCurrentSeason(): Promise<Season | null> {
    // TODO: Replace with actual API call
    // const response = await api.get<ApiResponse<{ season: Season }>>('/seasons/active');
    // return response.data.data?.season ?? null;

    // Return mock data for now
    return MOCK_SEASON;
  },

  /**
   * Get placement status for a user in a season
   */
  async getPlacementStatus(seasonId: string): Promise<PlacementStatus | null> {
    try {
      const response = await api.get<{
        success: boolean;
        data?: { placement: PlacementStatus };
        error?: { message: string };
      }>(`/ranked/season/${seasonId}/placement`);

      if (!response.data.success || !response.data.data) {
        return null;
      }

      return response.data.data.placement;
    } catch (error: any) {
      // 404 means user hasn't started placements yet
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get ranked progress for a user in a season
   */
  async getRankedProgress(seasonId: string): Promise<RankedProgress | null> {
    try {
      const response = await api.get<{
        success: boolean;
        data?: { progress: RankedProgress };
        error?: { message: string };
      }>(`/ranked/season/${seasonId}/progress`);

      if (!response.data.success || !response.data.data) {
        return null;
      }

      return response.data.data.progress;
    } catch (error: any) {
      // 404 means user hasn't started ranked yet
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * Get season rewards with claim status
   * TODO: Wire to GET /api/v1/seasons/:seasonId/rewards when backend ready
   */
  async getSeasonRewards(
    seasonId: string,
    currentRank: Rank | null
  ): Promise<RewardItem[]> {
    // TODO: Replace with actual API call that returns rewards with claim status
    // const response = await api.get<ApiResponse<{ rewards: RewardWithStatus[] }>>(
    //   `/seasons/${seasonId}/rewards`
    // );

    // Use mock data for now
    return MOCK_REWARDS.map((reward) =>
      toRewardItem(reward, currentRank, MOCK_CLAIMED_REWARD_IDS)
    );
  },

  /**
   * Claim a season reward
   * TODO: Wire to POST /api/v1/seasons/:seasonId/rewards/:rewardId/claim when backend ready
   */
  async claimReward(seasonId: string, rewardId: string): Promise<void> {
    // TODO: Replace with actual API call
    // await api.post(`/seasons/${seasonId}/rewards/${rewardId}/claim`);

    // Mock: Add to claimed list
    if (!MOCK_CLAIMED_REWARD_IDS.includes(rewardId)) {
      MOCK_CLAIMED_REWARD_IDS.push(rewardId);
    }
  },

  /**
   * Get all ranked data for the current season
   */
  async getRankedData(): Promise<RankedData> {
    // Get current season
    const season = await this.getCurrentSeason();

    if (!season) {
      return {
        season: null,
        placement: null,
        progress: null,
        rewards: [],
      };
    }

    // Try to get placement status first
    const placement = await this.getPlacementStatus(season.id);

    let progress: RankedProgress | null = null;
    let currentRank: Rank | null = null;

    // If user is placed, get full progress
    if (placement?.isPlaced) {
      progress = await this.getRankedProgress(season.id);
      currentRank = progress?.currentRank ?? placement.currentRank ?? null;
    }

    // Get rewards with status based on current rank
    const rewards = await this.getSeasonRewards(season.id, currentRank);

    return {
      season,
      placement,
      progress,
      rewards,
    };
  },
};

export default RankedService;
