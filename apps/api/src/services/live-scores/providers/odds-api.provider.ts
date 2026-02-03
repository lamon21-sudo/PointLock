// =====================================================
// The Odds API Live Score Provider
// =====================================================
// Fetches live scores from The Odds API.
// Note: The Odds API primarily provides odds, but also includes
// score data for live events.

import { SportType } from '@prisma/client';
import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import type { RawScoreUpdate, NormalizedScoreUpdate } from '../types';
import { normalizeStatus } from '../types';
import { BaseLiveScoreProvider } from './base.provider';
import { parseGameTime } from '../../../modules/live-scores/live-scores.schemas';

// ===========================================
// Odds API Response Types (Score-specific)
// ===========================================

interface OddsApiScoreEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: OddsApiScore[] | null;
  last_update?: string | null;
}

interface OddsApiScore {
  name: string;
  score: string;
}

// ===========================================
// Sport Key Mapping
// ===========================================

const SPORT_KEY_MAP: Record<SportType, string> = {
  [SportType.NFL]: 'americanfootball_nfl',
  [SportType.NBA]: 'basketball_nba',
  [SportType.MLB]: 'baseball_mlb',
  [SportType.NHL]: 'icehockey_nhl',
  [SportType.SOCCER]: 'soccer_usa_mls', // Default to MLS, could be extended
  [SportType.NCAAF]: 'americanfootball_ncaaf',
  [SportType.NCAAB]: 'basketball_ncaab',
};

// ===========================================
// Provider Implementation
// ===========================================

export class OddsApiLiveScoreProvider extends BaseLiveScoreProvider {
  readonly providerId = 'the-odds-api';
  readonly providerName = 'The Odds API';

  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor() {
    super();
    this.apiKey = config.oddsApi?.apiKey;
    this.baseUrl = config.oddsApi?.baseUrl || 'https://api.the-odds-api.com/v4';
  }

  /**
   * Check if the provider is configured.
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch live scores for a sport from The Odds API.
   */
  async fetchLiveScores(sport: SportType): Promise<RawScoreUpdate[]> {
    if (!this.isConfigured()) {
      logger.warn(`[${this.providerName}] API key not configured, skipping live score fetch`);
      return [];
    }

    const sportKey = SPORT_KEY_MAP[sport];
    if (!sportKey) {
      logger.warn(`[${this.providerName}] Unknown sport: ${sport}`);
      return [];
    }

    try {
      // Fetch scores endpoint
      const url = `${this.baseUrl}/sports/${sportKey}/scores`;
      const params = new URLSearchParams({
        apiKey: this.apiKey!,
        daysFrom: '1', // Only fetch recent/live games
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          logger.error(`[${this.providerName}] API key invalid or quota exhausted`);
          return [];
        }
        if (response.status === 429) {
          logger.warn(`[${this.providerName}] Rate limited, will retry later`);
          return [];
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as OddsApiScoreEvent[];

      // Log remaining API calls
      const remaining = response.headers.get('x-requests-remaining');
      if (remaining) {
        logger.info(`[${this.providerName}] Remaining API calls: ${remaining}`);
      }

      // Transform to raw score updates
      const updates = this.transformScoreEvents(data, sport);

      logger.info(`[${this.providerName}] Fetched ${updates.length} score updates for ${sport}`);

      return updates;
    } catch (error) {
      logger.error(`[${this.providerName}] Failed to fetch live scores:`, error);
      return [];
    }
  }

  /**
   * Transform Odds API score events to raw score updates.
   */
  private transformScoreEvents(
    events: OddsApiScoreEvent[],
    _sport: SportType
  ): RawScoreUpdate[] {
    const updates: RawScoreUpdate[] = [];

    for (const event of events) {
      // Skip events without scores
      if (!event.scores || event.scores.length < 2) {
        continue;
      }

      // Find home and away scores
      const homeScoreData = event.scores.find((s) => s.name === event.home_team);
      const awayScoreData = event.scores.find((s) => s.name === event.away_team);

      if (!homeScoreData || !awayScoreData) {
        continue;
      }

      const homeScore = parseInt(homeScoreData.score, 10);
      const awayScore = parseInt(awayScoreData.score, 10);

      // Skip if scores are invalid
      if (isNaN(homeScore) || isNaN(awayScore)) {
        continue;
      }

      // Determine status
      let status: string;
      if (event.completed) {
        status = 'completed';
      } else if (homeScore > 0 || awayScore > 0) {
        status = 'live';
      } else {
        status = 'scheduled';
      }

      updates.push({
        externalEventId: event.id,
        homeScore,
        awayScore,
        status,
        timestamp: event.last_update || new Date().toISOString(),
        providerMetadata: {
          sportKey: event.sport_key,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
        },
      });
    }

    return updates;
  }

  /**
   * Override normalizeUpdate for Odds API specific handling.
   */
  normalizeUpdate(raw: RawScoreUpdate, sport: SportType): NormalizedScoreUpdate {
    return {
      externalEventId: raw.externalEventId,
      sport,
      homeScore: raw.homeScore,
      awayScore: raw.awayScore,
      status: normalizeStatus(raw.status),
      gameTime: raw.gameTime ? parseGameTime(raw.gameTime) : undefined,
      timestamp: new Date(raw.timestamp),
      idempotencyKey: this.generateIdempotencyKey(raw),
      provider: this.providerId,
    };
  }
}

// ===========================================
// Singleton Instance
// ===========================================

let instance: OddsApiLiveScoreProvider | null = null;

/**
 * Get the Odds API live score provider instance.
 */
export function getOddsApiProvider(): OddsApiLiveScoreProvider {
  if (!instance) {
    instance = new OddsApiLiveScoreProvider();
  }
  return instance;
}
