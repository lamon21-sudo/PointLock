// =====================================================
// Odds Service - Public API
// =====================================================

// Types
export type {
  Sport,
  MarketType,
  Outcome,
  Market,
  Bookmaker,
  SportingEvent,
  EventsResponse,
  EventOddsResponse,
  FetchOddsOptions,
  SportsDataProvider,
} from './types';

// Errors
export {
  SportsDataException,
  SportsDataUnavailableError,
  SportsDataRateLimitedError,
  SportsDataInvalidResponseError,
} from './errors';

// Client
export { OddsApiClient } from './odds-api.client';

// Service
export { OddsService, getOddsService } from './odds.service';
