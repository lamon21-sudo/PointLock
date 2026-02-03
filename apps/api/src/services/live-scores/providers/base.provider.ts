// =====================================================
// Base Live Score Provider
// =====================================================
// Abstract base class for live score data providers.
// Extend this to add support for new data sources.

import { SportType } from '@prisma/client';
import type {
  LiveScoreProvider,
  RawScoreUpdate,
  NormalizedScoreUpdate,
} from '../types';
import { normalizeStatus } from '../types';
import { parseGameTime } from '../../../modules/live-scores/live-scores.schemas';
import crypto from 'crypto';

/**
 * Abstract base class for live score providers.
 * Provides common functionality and enforces the provider interface.
 */
export abstract class BaseLiveScoreProvider implements LiveScoreProvider {
  abstract readonly providerId: string;
  abstract readonly providerName: string;

  /**
   * Fetch current live scores for a sport.
   * Must be implemented by subclasses.
   */
  abstract fetchLiveScores(sport: SportType): Promise<RawScoreUpdate[]>;

  /**
   * Check if the provider is configured and ready.
   * Must be implemented by subclasses.
   */
  abstract isConfigured(): boolean;

  /**
   * Normalize a raw score update to internal format.
   * Can be overridden by subclasses for provider-specific normalization.
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

  /**
   * Generate an idempotency key for a score update.
   * Uses event ID + score + status + timestamp (truncated to minute).
   */
  protected generateIdempotencyKey(raw: RawScoreUpdate): string {
    // Truncate timestamp to minute to handle slight timing variations
    const timestampMinute = new Date(raw.timestamp);
    timestampMinute.setSeconds(0, 0);

    const data = [
      raw.externalEventId,
      raw.homeScore,
      raw.awayScore,
      raw.status,
      timestampMinute.toISOString(),
    ].join(':');

    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Log provider activity.
   */
  protected log(message: string, data?: Record<string, unknown>): void {
    const logData = { provider: this.providerId, ...data };
    console.log(`[${this.providerName}] ${message}`, JSON.stringify(logData));
  }
}
