// =====================================================
// The Odds API Client
// =====================================================
// HTTP client for The Odds API with authentication,
// retry logic, and exponential backoff.

import axios, {
  AxiosInstance,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import {
  SportsDataException,
  SportsDataUnavailableError,
  SportsDataRateLimitedError,
  SportsDataInvalidResponseError,
} from './errors';
import {
  Sport,
  MarketType,
  SportingEvent,
  SportsDataProvider,
  EventsResponse,
  EventOddsResponse,
  FetchOddsOptions,
  PlayerPropMarket,
  NormalizedPlayerProp,
  EventPlayerPropsResponse,
  PLAYER_PROP_MARKETS,
} from './types';

// ===========================================
// The Odds API Response Types (Raw)
// ===========================================

interface OddsApiOutcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsApiMarket {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
}

interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
}

// ===========================================
// Retry Configuration
// ===========================================

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: config.oddsApi.maxRetries,
  initialDelayMs: config.oddsApi.initialRetryDelayMs,
  maxDelayMs: 30000, // Cap at 30 seconds
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

// ===========================================
// Helper Functions
// ===========================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Transform raw API response to our domain types
 */
function transformEvent(raw: OddsApiEvent): SportingEvent {
  return {
    id: raw.id,
    sportKey: raw.sport_key as Sport,
    sportTitle: raw.sport_title,
    commenceTime: raw.commence_time,
    homeTeam: raw.home_team,
    awayTeam: raw.away_team,
    bookmakers: (raw.bookmakers || []).map((bm) => ({
      key: bm.key,
      title: bm.title,
      lastUpdate: bm.last_update,
      markets: bm.markets.map((m) => ({
        key: m.key as MarketType,
        lastUpdate: m.last_update,
        outcomes: m.outcomes.map((o) => ({
          name: o.name,
          price: o.price,
          point: o.point,
        })),
      })),
    })),
  };
}

/**
 * Extract API usage from response headers
 */
function extractApiUsage(response: AxiosResponse): {
  remaining: number | null;
  used: number | null;
} {
  const remaining = response.headers['x-requests-remaining'];
  const used = response.headers['x-requests-used'];

  return {
    remaining: remaining ? parseInt(remaining, 10) : null,
    used: used ? parseInt(used, 10) : null,
  };
}

// ===========================================
// Odds API Client
// ===========================================

export class OddsApiClient implements SportsDataProvider {
  readonly providerId = 'the-odds-api';
  readonly providerName = 'The Odds API';

  private readonly client: AxiosInstance;
  private readonly retryConfig: RetryConfig;

  constructor(apiKey?: string, retryConfig?: Partial<RetryConfig>) {
    const key = apiKey || config.oddsApi.apiKey;

    if (!key) {
      throw new Error(
        'ODDS_API_KEY is required. Get your key at https://the-odds-api.com/#get-access'
      );
    }

    // Log masked API key on startup for debugging
    if (config.nodeEnv === 'development') {
      const maskedKey = key.length > 6
        ? `${key.substring(0, 3)}...${key.substring(key.length - 3)}`
        : '[INVALID]';
      logger.debug(`[OddsAPI] Initializing with API key: ${maskedKey}`);
    }

    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

    this.client = axios.create({
      baseURL: config.oddsApi.baseUrl,
      timeout: 30000,
      headers: {
        Accept: 'application/json',
      },
    });

    // Request interceptor: Add API key to all requests
    this.client.interceptors.request.use(
      (requestConfig: InternalAxiosRequestConfig) => {
        requestConfig.params = {
          ...requestConfig.params,
          apiKey: key,
        };

        logger.debug(`[OddsAPI] ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`, {
          params: { ...requestConfig.params, apiKey: '[REDACTED]' },
        });

        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Log API usage
    this.client.interceptors.response.use(
      (response) => {
        const usage = extractApiUsage(response);
        if (usage.remaining !== null) {
          logger.info(`[OddsAPI] Request successful. Remaining API calls: ${usage.remaining}`);
        }
        return response;
      },
      (error) => Promise.reject(error)
    );
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Execute request with exponential backoff retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<AxiosResponse<T>>
  ): Promise<AxiosResponse<T>> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (!axios.isAxiosError(error)) {
          throw this.wrapError(error as Error);
        }

        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;

        // Check if this error is retryable
        if (statusCode && this.retryConfig.retryableStatusCodes.includes(statusCode)) {
          if (attempt < this.retryConfig.maxRetries) {
            const delay = this.calculateRetryDelay(statusCode, axiosError, attempt);
            logger.warn(
              `[OddsAPI] Request failed with status ${statusCode}. ` +
                `Retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`
            );
            await sleep(delay);
            continue;
          }
        }

        // Not retryable or exhausted retries
        throw this.wrapError(axiosError);
      }
    }

    // Should not reach here, but TypeScript needs this
    throw this.wrapError(lastError || new Error('Unknown error'));
  }

  /**
   * Calculate retry delay, respecting Retry-After header for rate limits
   */
  private calculateRetryDelay(
    statusCode: number,
    error: AxiosError,
    attempt: number
  ): number {
    // For rate limits, respect Retry-After header if present
    if (statusCode === 429) {
      const retryAfter = error.response?.headers['retry-after'];
      if (retryAfter) {
        const retryAfterSeconds = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSeconds)) {
          return retryAfterSeconds * 1000;
        }
      }
    }

    return calculateBackoffDelay(attempt, this.retryConfig);
  }

  /**
   * Wrap errors in appropriate SportsDataException subclasses
   */
  private wrapError(error: Error): SportsDataException {
    if (error instanceof SportsDataException) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;

      // Rate limited
      if (statusCode === 429) {
        const retryAfter = axiosError.response?.headers['retry-after'];
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;
        return new SportsDataRateLimitedError(
          this.providerId,
          isNaN(retryAfterSeconds!) ? null : retryAfterSeconds,
          error
        );
      }

      // Server errors
      if (statusCode && statusCode >= 500) {
        return new SportsDataUnavailableError(this.providerId, error);
      }

      // Connection errors (no response)
      if (!axiosError.response) {
        return new SportsDataUnavailableError(this.providerId, error);
      }

      // Authentication failed OR quota exceeded (The Odds API uses 401 for both)
      if (statusCode === 401) {
        const responseData = axiosError.response?.data as { error_code?: string; message?: string } | undefined;
        const errorCode = responseData?.error_code;
        const message = responseData?.message || 'Unknown 401 error';

        if (errorCode === 'OUT_OF_USAGE_CREDITS') {
          logger.error('[OddsAPI] API quota exhausted. Upgrade plan or wait for monthly reset. See: https://the-odds-api.com/#pricing');
          return new SportsDataRateLimitedError(
            this.providerId,
            null, // No retry-after for quota exhaustion
            error
          );
        }

        logger.error('[OddsAPI] 401 Unauthorized - API key is invalid or expired. Check ODDS_API_KEY environment variable.');
        return new SportsDataInvalidResponseError(
          this.providerId,
          `API key authentication failed: ${message}`,
          error
        );
      }

      // Bad response data
      if (statusCode === 400 || statusCode === 422) {
        const message = (axiosError.response.data as { message?: string })?.message;
        return new SportsDataInvalidResponseError(
          this.providerId,
          message || 'Invalid request',
          error
        );
      }
    }

    // Generic fallback
    return new SportsDataUnavailableError(this.providerId, error);
  }

  // ===========================================
  // Public API Methods
  // ===========================================

  /**
   * Fetch all upcoming events for a sport (without odds)
   */
  async getUpcomingEvents(sport: Sport): Promise<EventsResponse> {
    const response = await this.executeWithRetry(() =>
      this.client.get<OddsApiEvent[]>(`/sports/${sport}/events`)
    );

    const usage = extractApiUsage(response);

    return {
      events: response.data.map(transformEvent),
      remainingRequests: usage.remaining,
      usedRequests: usage.used,
    };
  }

  /**
   * Fetch odds for a specific event
   */
  async getEventOdds(
    sport: Sport,
    eventId: string,
    markets: MarketType[] = ['h2h']
  ): Promise<EventOddsResponse> {
    const response = await this.executeWithRetry(() =>
      this.client.get<OddsApiEvent>(`/sports/${sport}/events/${eventId}/odds`, {
        params: {
          markets: markets.join(','),
          regions: 'us',
          oddsFormat: 'decimal',
        },
      })
    );

    const usage = extractApiUsage(response);

    return {
      event: transformEvent(response.data),
      remainingRequests: usage.remaining,
      usedRequests: usage.used,
    };
  }

  /**
   * Fetch all events with odds for a sport
   */
  async getOdds(options: FetchOddsOptions): Promise<EventsResponse> {
    const { sport, markets = ['h2h'], regions = ['us'], bookmakers } = options;

    const params: Record<string, string> = {
      markets: markets.join(','),
      regions: regions.join(','),
      oddsFormat: 'decimal',
    };

    if (bookmakers?.length) {
      params.bookmakers = bookmakers.join(',');
    }

    const response = await this.executeWithRetry(() =>
      this.client.get<OddsApiEvent[]>(`/sports/${sport}/odds`, { params })
    );

    const usage = extractApiUsage(response);

    return {
      events: response.data.map(transformEvent),
      remainingRequests: usage.remaining,
      usedRequests: usage.used,
    };
  }

  /**
   * Check if the API is reachable and the key is valid
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use the sports list endpoint - it's a simple, low-cost call
      await this.executeWithRetry(() => this.client.get('/sports'));
      return true;
    } catch (error) {
      logger.error('[OddsAPI] Health check failed:', error);
      return false;
    }
  }

  /**
   * Fetch player props for a specific event
   * NOTE: Player props require The Odds API paid tier
   */
  async getEventPlayerProps(
    sport: Sport,
    eventId: string,
    propMarkets: PlayerPropMarket[]
  ): Promise<EventPlayerPropsResponse> {
    const response = await this.executeWithRetry(() =>
      this.client.get<OddsApiEvent>(`/sports/${sport}/events/${eventId}/odds`, {
        params: {
          markets: propMarkets.join(','),
          regions: 'us',
          oddsFormat: 'decimal',
        },
      })
    );

    const usage = extractApiUsage(response);
    const playerProps = this.extractPlayerProps(response.data.bookmakers || []);

    return {
      eventId,
      playerProps,
      remainingRequests: usage.remaining,
      usedRequests: usage.used,
    };
  }

  /**
   * Extract and normalize player props from bookmakers response
   */
  private extractPlayerProps(bookmakers: OddsApiBookmaker[]): NormalizedPlayerProp[] {
    if (bookmakers.length === 0) return [];

    // Prefer FanDuel > DraftKings > BetMGM > first available
    const preferredBooks = ['fanduel', 'draftkings', 'betmgm', 'pointsbetus'];
    let selectedBook: OddsApiBookmaker | undefined;

    for (const bookKey of preferredBooks) {
      selectedBook = bookmakers.find((b) => b.key === bookKey);
      if (selectedBook) break;
    }

    if (!selectedBook) {
      selectedBook = bookmakers[0];
    }

    const props: NormalizedPlayerProp[] = [];

    for (const market of selectedBook.markets) {
      // Only process player prop markets
      if (!PLAYER_PROP_MARKETS.includes(market.key as PlayerPropMarket)) {
        continue;
      }

      // Group outcomes by player name
      const playerOutcomes = new Map<string, OddsApiOutcome[]>();

      for (const outcome of market.outcomes) {
        const existing = playerOutcomes.get(outcome.name) || [];
        existing.push(outcome);
        playerOutcomes.set(outcome.name, existing);
      }

      // Create normalized props for each player
      for (const [playerName, outcomes] of playerOutcomes) {
        // Props have description field in the outcome for Over/Under
        const overOutcome = outcomes.find((o) =>
          (o as unknown as { description?: string }).description === 'Over'
        );
        const underOutcome = outcomes.find((o) =>
          (o as unknown as { description?: string }).description === 'Under'
        );

        if (overOutcome && underOutcome && overOutcome.point !== undefined) {
          props.push({
            playerId: this.generatePlayerId(playerName),
            playerName,
            propType: market.key as PlayerPropMarket,
            line: overOutcome.point,
            overOdds: overOutcome.price,
            underOdds: underOutcome.price,
            lastUpdated: market.last_update,
          });
        }
      }
    }

    return props;
  }

  /**
   * Generate a stable player ID from player name
   */
  private generatePlayerId(playerName: string): string {
    return playerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
