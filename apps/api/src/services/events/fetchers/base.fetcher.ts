// =====================================================
// Base Sports Fetcher
// =====================================================
// Abstract base class for sport-specific event fetchers.
// Provides common functionality for transforming API data.

import { config } from '../../../config';
import { logger } from '../../../utils/logger';
import { OddsApiClient } from '../../odds/odds-api.client';
import { SportingEvent, Bookmaker, Market, Sport, PlayerPropMarket, NormalizedPlayerProp } from '../../odds/types';
import {
  SportsFetcher,
  NormalizedEvent,
  SportType,
  EventStatus,
  OddsData,
  PlayerPropData,
  SPORT_TYPE_TO_KEY,
} from '../types';

/**
 * Abstract base fetcher that handles common transformation logic.
 * Subclasses only need to implement sport-specific details.
 */
export abstract class BaseSportsFetcher implements SportsFetcher {
  abstract readonly sportType: SportType;
  abstract readonly name: string;

  protected readonly client: OddsApiClient | null;
  protected readonly apiConfigured: boolean;

  constructor() {
    // Only create client if API key is configured
    this.apiConfigured = Boolean(config.oddsApi.apiKey);

    if (this.apiConfigured) {
      try {
        this.client = new OddsApiClient();
      } catch (error) {
        logger.warn(`[SportsFetcher] Failed to initialize OddsApiClient:`, error);
        this.client = null;
      }
    } else {
      this.client = null;
      // Log warning on first fetch, not in constructor
    }
  }

  /**
   * Check if the fetcher is properly configured
   */
  isConfigured(): boolean {
    return this.apiConfigured && this.client !== null;
  }

  /**
   * Get the API sport key for this fetcher
   */
  protected getSportKey(): Sport {
    return SPORT_TYPE_TO_KEY[this.sportType] as Sport;
  }

  /**
   * Get the league name for this sport
   */
  protected abstract getLeagueName(): string;

  /**
   * Generate mock events when API is not configured
   */
  protected abstract generateMockEvents(): NormalizedEvent[];

  /**
   * Get the player prop markets for this sport
   */
  protected abstract getPropMarkets(): PlayerPropMarket[];

  /**
   * Generate mock player props for development when API is not configured
   */
  protected abstract generateMockProps(eventId: string): PlayerPropData[];

  /**
   * Fetch upcoming events from the configured provider
   */
  async fetchUpcomingEvents(): Promise<NormalizedEvent[]> {
    const startTime = Date.now();

    try {
      // If API not configured, return mock data
      if (!this.isConfigured() || !this.client) {
        logger.info(`[${this.name}] Returning mock events (API not configured)`);
        return this.generateMockEvents();
      }

      // Fetch events with odds
      const response = await this.client.getOdds({
        sport: this.getSportKey(),
        markets: ['h2h', 'spreads', 'totals'],
        regions: ['us'],
      });

      const events = response.events.map((event) => this.transformEvent(event));

      const duration = Date.now() - startTime;
      logger.info(
        `[${this.name}] Fetched ${events.length} events in ${duration}ms. ` +
          `API calls remaining: ${response.remainingRequests ?? 'unknown'}`
      );

      return events;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`[${this.name}] Failed to fetch events after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Fetch player props for a specific event
   */
  async fetchEventProps(eventId: string): Promise<PlayerPropData[]> {
    try {
      // If API not configured or using mock data, return mock props
      if (!this.isConfigured() || !this.client || config.playerProps.useMockData) {
        logger.debug(`[${this.name}] Returning mock props for event ${eventId}`);
        return this.generateMockProps(eventId);
      }

      const propMarkets = this.getPropMarkets();
      if (propMarkets.length === 0) {
        return [];
      }

      const response = await this.client.getEventPlayerProps(
        this.getSportKey(),
        eventId,
        propMarkets
      );

      // Transform NormalizedPlayerProp to PlayerPropData
      return response.playerProps.map((prop: NormalizedPlayerProp): PlayerPropData => ({
        playerId: prop.playerId,
        playerName: prop.playerName,
        propType: prop.propType,
        line: prop.line,
        overOdds: prop.overOdds,
        underOdds: prop.underOdds,
      }));
    } catch (error) {
      logger.warn(`[${this.name}] Failed to fetch props for event ${eventId}:`, error);
      // Fall back to mock props on error
      return this.generateMockProps(eventId);
    }
  }

  /**
   * Transform a raw API event to normalized format
   */
  protected transformEvent(event: SportingEvent): NormalizedEvent {
    const odds = this.extractBestOdds(event.bookmakers);

    return {
      externalId: event.id,
      sport: this.sportType,
      league: this.getLeagueName(),
      homeTeamId: this.generateTeamId(event.homeTeam),
      homeTeamName: event.homeTeam,
      homeTeamAbbr: this.abbreviateTeamName(event.homeTeam),
      awayTeamId: this.generateTeamId(event.awayTeam),
      awayTeamName: event.awayTeam,
      awayTeamAbbr: this.abbreviateTeamName(event.awayTeam),
      scheduledAt: new Date(event.commenceTime),
      status: this.determineEventStatus(new Date(event.commenceTime)),
      oddsData: odds,
    };
  }

  /**
   * Extract the best odds from available bookmakers.
   * Prefers FanDuel, then DraftKings, then first available.
   */
  protected extractBestOdds(bookmakers: Bookmaker[]): OddsData {
    const now = new Date().toISOString();

    if (bookmakers.length === 0) {
      return {
        provider: 'unknown',
        lastUpdated: now,
        markets: {},
      };
    }

    // Priority order for bookmakers
    const preferredBooks = ['fanduel', 'draftkings', 'betmgm', 'pointsbetus'];
    let selectedBook: Bookmaker | undefined;

    for (const bookKey of preferredBooks) {
      selectedBook = bookmakers.find((b) => b.key === bookKey);
      if (selectedBook) break;
    }

    // Fall back to first available
    if (!selectedBook) {
      selectedBook = bookmakers[0];
    }

    const odds: OddsData = {
      provider: selectedBook.title,
      lastUpdated: selectedBook.lastUpdate,
      markets: {},
    };

    // Extract each market type
    for (const market of selectedBook.markets) {
      switch (market.key) {
        case 'h2h':
          odds.markets.moneyline = this.extractMoneyline(market);
          break;
        case 'spreads':
          odds.markets.spread = this.extractSpread(market);
          break;
        case 'totals':
          odds.markets.totals = this.extractTotals(market);
          break;
      }
    }

    return odds;
  }

  /**
   * Extract moneyline odds from a market
   */
  protected extractMoneyline(market: Market): { home: number; away: number } | undefined {
    if (market.outcomes.length < 2) return undefined;

    const homeOutcome = market.outcomes.find((o) => o.name !== 'Draw');
    const awayOutcome = market.outcomes.find(
      (o) => o.name !== 'Draw' && o !== homeOutcome
    );

    if (!homeOutcome || !awayOutcome) return undefined;

    return {
      home: homeOutcome.price,
      away: awayOutcome.price,
    };
  }

  /**
   * Extract spread odds from a market
   */
  protected extractSpread(
    market: Market
  ): { home: number; away: number; homeOdds: number; awayOdds: number } | undefined {
    if (market.outcomes.length < 2) return undefined;

    const homeOutcome = market.outcomes[0];
    const awayOutcome = market.outcomes[1];

    if (homeOutcome?.point === undefined || awayOutcome?.point === undefined) {
      return undefined;
    }

    return {
      home: homeOutcome.point,
      away: awayOutcome.point,
      homeOdds: homeOutcome.price,
      awayOdds: awayOutcome.price,
    };
  }

  /**
   * Extract totals odds from a market
   */
  protected extractTotals(
    market: Market
  ): { value: number; overOdds: number; underOdds: number } | undefined {
    const overOutcome = market.outcomes.find((o) => o.name === 'Over');
    const underOutcome = market.outcomes.find((o) => o.name === 'Under');

    if (overOutcome?.point === undefined || !underOutcome) return undefined;

    return {
      value: overOutcome.point,
      overOdds: overOutcome.price,
      underOdds: underOutcome.price,
    };
  }

  /**
   * Determine event status based on scheduled time.
   * More sophisticated status tracking would require live score data.
   */
  protected determineEventStatus(scheduledAt: Date): EventStatus {
    const now = new Date();

    if (scheduledAt > now) {
      return EventStatus.SCHEDULED;
    }

    // If the event was scheduled in the past, it's likely live or completed.
    // Without live score data, we conservatively mark as SCHEDULED.
    // The settlement service will update status when scores are available.
    return EventStatus.SCHEDULED;
  }

  /**
   * Generate a deterministic team ID from team name.
   * In production, this would map to actual team IDs from the provider.
   */
  protected generateTeamId(teamName: string): string {
    return `${this.sportType.toLowerCase()}_${teamName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')}`;
  }

  /**
   * Generate an abbreviation for a team name.
   * Override in subclasses for sport-specific logic.
   */
  protected abbreviateTeamName(teamName: string): string {
    // Extract city/state name and take first 3 letters
    const parts = teamName.split(' ');
    if (parts.length >= 2) {
      return parts[0].substring(0, 3).toUpperCase();
    }
    return teamName.substring(0, 3).toUpperCase();
  }
}
