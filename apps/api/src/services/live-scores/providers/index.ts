// =====================================================
// Live Score Providers Index
// =====================================================
// Provider registry and factory functions.

import { SportType } from '@prisma/client';
import { logger } from '../../../utils/logger';
import type { LiveScoreProvider, NormalizedScoreUpdate, RawScoreUpdate } from '../types';
import { getOddsApiProvider } from './odds-api.provider';

// ===========================================
// Provider Registry
// ===========================================

export type ProviderType = 'odds-api';

const providers: Map<ProviderType, LiveScoreProvider> = new Map();

/**
 * Initialize providers on first use.
 */
function initializeProviders(): void {
  if (providers.size > 0) return;

  // Register The Odds API provider
  const oddsApiProvider = getOddsApiProvider();
  if (oddsApiProvider.isConfigured()) {
    providers.set('odds-api', oddsApiProvider);
    logger.info('[LiveScoreProviders] Registered provider: The Odds API');
  } else {
    logger.warn('[LiveScoreProviders] The Odds API provider not configured (missing API key)');
  }
}

/**
 * Get a specific provider by ID.
 */
export function getProvider(providerId: ProviderType): LiveScoreProvider | undefined {
  initializeProviders();
  return providers.get(providerId);
}

/**
 * Get all configured providers.
 */
export function getAllProviders(): LiveScoreProvider[] {
  initializeProviders();
  return Array.from(providers.values());
}

/**
 * Check if any providers are configured.
 */
export function hasConfiguredProviders(): boolean {
  initializeProviders();
  return providers.size > 0;
}

// ===========================================
// Polling Functions
// ===========================================

/**
 * Poll live games for a sport from all configured providers.
 * Returns normalized score updates ready for processing.
 */
export async function pollLiveGames(sport: SportType): Promise<NormalizedScoreUpdate[]> {
  initializeProviders();

  if (providers.size === 0) {
    logger.warn('[LiveScoreProviders] No providers configured for live score polling');
    return [];
  }

  const allUpdates: NormalizedScoreUpdate[] = [];

  for (const [providerId, provider] of providers) {
    try {
      const rawUpdates = await provider.fetchLiveScores(sport);

      // Normalize each update
      const normalizedUpdates = rawUpdates.map((raw) =>
        provider.normalizeUpdate(raw, sport)
      );

      allUpdates.push(...normalizedUpdates);

      logger.debug(`[LiveScoreProviders] ${providerId} returned ${rawUpdates.length} updates for ${sport}`);
    } catch (error) {
      logger.error(`[LiveScoreProviders] Error polling ${providerId} for ${sport}:`, error);
      // Continue with other providers
    }
  }

  return allUpdates;
}

/**
 * Poll live games for all sports from all configured providers.
 */
export async function pollAllLiveGames(): Promise<NormalizedScoreUpdate[]> {
  const sports: SportType[] = [
    SportType.NFL,
    SportType.NBA,
    SportType.MLB,
    SportType.NHL,
    SportType.NCAAF,
    SportType.NCAAB,
  ];

  const allUpdates: NormalizedScoreUpdate[] = [];

  for (const sport of sports) {
    const updates = await pollLiveGames(sport);
    allUpdates.push(...updates);
  }

  return allUpdates;
}

// ===========================================
// Webhook Normalization
// ===========================================

/**
 * Normalize a webhook payload from a specific provider.
 */
export function normalizeWebhookPayload(
  providerId: ProviderType,
  rawEvents: RawScoreUpdate[],
  sport: SportType
): NormalizedScoreUpdate[] {
  initializeProviders();

  const provider = providers.get(providerId);
  if (!provider) {
    logger.warn(`[LiveScoreProviders] Unknown provider: ${providerId}, using default normalization`);
    // Use Odds API provider as default normalizer
    const defaultProvider = getOddsApiProvider();
    return rawEvents.map((raw) => defaultProvider.normalizeUpdate(raw, sport));
  }

  return rawEvents.map((raw) => provider.normalizeUpdate(raw, sport));
}

// ===========================================
// Re-exports
// ===========================================

export { BaseLiveScoreProvider } from './base.provider';
export { OddsApiLiveScoreProvider, getOddsApiProvider } from './odds-api.provider';
export type { LiveScoreProvider } from '../types';
