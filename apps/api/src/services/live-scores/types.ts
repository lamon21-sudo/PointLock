// =====================================================
// Live Scores Types
// =====================================================
// Type definitions for live score ingestion and processing

import { SportType, EventStatus } from '@prisma/client';

// Re-export for convenience
export { EventStatus, SportType };

// =====================================================
// RAW DATA FROM PROVIDERS
// =====================================================

/**
 * Raw score update from any provider (webhook or polling)
 * This is the unprocessed data as received from external sources
 */
export interface RawScoreUpdate {
  /** External event identifier from the provider */
  externalEventId: string;
  /** Current home team score */
  homeScore: number;
  /** Current away team score */
  awayScore: number;
  /** Provider-specific status string (needs normalization) */
  status: string;
  /** Game time info (quarter, period, inning) - provider format */
  gameTime?: string;
  /** ISO timestamp from provider */
  timestamp: string;
  /** Additional provider-specific metadata */
  providerMetadata?: Record<string, unknown>;
}

// =====================================================
// NORMALIZED INTERNAL TYPES
// =====================================================

/**
 * Game time representation (sport-agnostic)
 */
export interface GameTime {
  /** Current period number (1-4 for quarters, 1-9+ for innings, etc.) */
  period: number;
  /** Type of period for display purposes */
  periodType: 'quarter' | 'half' | 'inning' | 'period' | 'overtime' | 'extra_time';
  /** Remaining time if applicable (e.g., "12:34") */
  clock?: string;
  /** Whether game is currently at halftime/intermission */
  isHalftime?: boolean;
  /** Whether game is in overtime/extra innings */
  isOvertime?: boolean;
}

/**
 * Normalized score update for internal processing
 * This is the canonical format used throughout the system
 */
export interface NormalizedScoreUpdate {
  /** External event identifier from the provider */
  externalEventId: string;
  /** Internal UUID - resolved during processing */
  eventId?: string;
  /** Sport type for validation rules */
  sport: SportType;
  /** Current home team score */
  homeScore: number;
  /** Current away team score */
  awayScore: number;
  /** Previous home score (for delta validation) */
  previousHomeScore?: number | null;
  /** Previous away score (for delta validation) */
  previousAwayScore?: number | null;
  /** Normalized event status */
  status: EventStatus;
  /** Parsed game time information */
  gameTime?: GameTime;
  /** When the update was recorded by the provider */
  timestamp: Date;
  /** Unique key for idempotency (prevents double-processing) */
  idempotencyKey: string;
  /** Source provider identifier */
  provider: string;
}

// =====================================================
// VALIDATION
// =====================================================

/**
 * Score validation result
 */
export interface ScoreValidationResult {
  /** Whether the score change is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warning for non-fatal issues (logged but processed) */
  warning?: string;
}

/**
 * Sport-specific scoring rules for validation
 */
export interface SportScoringRules {
  /** Sport this rule applies to */
  sport: SportType;
  /** Legal score increments for this sport (e.g., [1,2,3,6,7,8] for NFL) */
  validIncrements: number[];
  /** Maximum points possible from a single play */
  maxScorePerPlay: number;
  /** Whether scores can decrease (typically false) */
  canScoreDecrease: boolean;
  /** Sanity check upper bound for total score */
  maxTotalScore: number;
}

/**
 * Sport scoring rules lookup table
 */
export const SPORT_SCORING_RULES: Record<SportType, SportScoringRules> = {
  [SportType.NFL]: {
    sport: SportType.NFL,
    validIncrements: [1, 2, 3, 6, 7, 8], // Safety, 2pt, FG, TD, TD+XP, TD+2pt
    maxScorePerPlay: 8,
    canScoreDecrease: false,
    maxTotalScore: 100,
  },
  [SportType.NBA]: {
    sport: SportType.NBA,
    validIncrements: [1, 2, 3], // FT, 2pt, 3pt
    maxScorePerPlay: 4, // And-1 situations
    canScoreDecrease: false,
    maxTotalScore: 200,
  },
  [SportType.MLB]: {
    sport: SportType.MLB,
    validIncrements: [1, 2, 3, 4], // Runs (including grand slam)
    maxScorePerPlay: 4,
    canScoreDecrease: false,
    maxTotalScore: 50,
  },
  [SportType.NHL]: {
    sport: SportType.NHL,
    validIncrements: [1], // Goals only
    maxScorePerPlay: 1,
    canScoreDecrease: false,
    maxTotalScore: 20,
  },
  [SportType.SOCCER]: {
    sport: SportType.SOCCER,
    validIncrements: [1], // Goals only
    maxScorePerPlay: 1,
    canScoreDecrease: false,
    maxTotalScore: 15,
  },
  [SportType.NCAAF]: {
    sport: SportType.NCAAF,
    validIncrements: [1, 2, 3, 6, 7, 8], // Same as NFL
    maxScorePerPlay: 8,
    canScoreDecrease: false,
    maxTotalScore: 100,
  },
  [SportType.NCAAB]: {
    sport: SportType.NCAAB,
    validIncrements: [1, 2, 3], // Same as NBA
    maxScorePerPlay: 4,
    canScoreDecrease: false,
    maxTotalScore: 200,
  },
};

// =====================================================
// PROVIDER INTERFACE
// =====================================================

/**
 * Interface for live score data providers.
 * Implement this to add support for new data providers.
 */
export interface LiveScoreProvider {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /** Human-readable name for logging */
  readonly providerName: string;

  /**
   * Fetch current live scores for a sport
   * @param sport - The sport type to fetch scores for
   * @returns Array of raw score updates
   */
  fetchLiveScores(sport: SportType): Promise<RawScoreUpdate[]>;

  /**
   * Normalize provider-specific data to internal format
   * @param raw - Raw score update from provider
   * @param sport - Sport type for context
   * @returns Normalized score update
   */
  normalizeUpdate(raw: RawScoreUpdate, sport: SportType): NormalizedScoreUpdate;

  /**
   * Check if the provider is configured and ready
   * @returns True if provider can be used
   */
  isConfigured(): boolean;
}

// =====================================================
// WEBHOOK TYPES
// =====================================================

/**
 * Webhook payload interface (provider-specific implementations parse to this)
 */
export interface WebhookPayload {
  /** HMAC signature for verification */
  signature?: string;
  /** ISO timestamp when webhook was sent */
  timestamp: string;
  /** Provider identifier */
  provider: string;
  /** Array of score updates in this webhook */
  events: RawScoreUpdate[];
}

// =====================================================
// PROCESSING RESULTS
// =====================================================

/**
 * Result of processing a single score update
 */
export interface ScoreProcessingResult {
  /** Whether processing completed successfully */
  success: boolean;
  /** Internal event UUID */
  eventId: string;
  /** External event identifier */
  externalEventId: string;
  /** False if idempotent (already processed) */
  updated: boolean;
  /** Whether the score values changed */
  scoreChanged: boolean;
  /** Whether the event status changed */
  statusChanged: boolean;
  /** Match IDs that need broadcasting (via picks -> slips -> matches) */
  affectedMatchIds: string[];
  /** Error message if processing failed */
  error?: string;
}

/**
 * Result of a batch processing operation
 */
export interface BatchProcessingResult {
  /** Whether all updates processed successfully */
  success: boolean;
  /** Total updates received */
  totalReceived: number;
  /** Updates that modified data */
  updatedCount: number;
  /** Updates skipped (idempotent) */
  skippedCount: number;
  /** Updates that failed */
  failedCount: number;
  /** Number of broadcasts sent */
  broadcastCount: number;
  /** Individual results for each update */
  results: ScoreProcessingResult[];
  /** Processing duration in milliseconds */
  durationMs: number;
}

// =====================================================
// SOCKET EVENT PAYLOADS
// =====================================================

/**
 * Payload for event:score broadcast
 * Sent when game scores change
 */
export interface EventScorePayload {
  /** Internal event UUID */
  eventId: string;
  /** External event identifier */
  externalId: string;
  /** Current home team score */
  homeScore: number;
  /** Current away team score */
  awayScore: number;
  /** Previous home score (null if first update) */
  previousHomeScore: number | null;
  /** Previous away score (null if first update) */
  previousAwayScore: number | null;
  /** Current game time information */
  gameTime?: GameTime;
  /** ISO timestamp of the update */
  timestamp: string;
}

/**
 * Payload for event:status broadcast
 * Sent when game status changes (SCHEDULED -> LIVE -> COMPLETED)
 */
export interface EventStatusPayload {
  /** Internal event UUID */
  eventId: string;
  /** External event identifier */
  externalId: string;
  /** New status */
  status: EventStatus;
  /** Previous status */
  previousStatus: EventStatus;
  /** ISO timestamp when game started (if transitioning to LIVE) */
  startedAt?: string;
  /** ISO timestamp when game ended (if transitioning to COMPLETED) */
  endedAt?: string;
  /** Final score (if transitioning to COMPLETED) */
  finalScore?: {
    homeScore: number;
    awayScore: number;
  };
  /** ISO timestamp of the update */
  timestamp: string;
}

// =====================================================
// QUEUE JOB TYPES
// =====================================================

/**
 * Job types for live scores processing queue
 */
export type LiveScoresJobType =
  | 'process-update'    // Single score update from webhook
  | 'batch-process'     // Batch of updates from polling
  | 'poll-live-games'   // Scheduled polling job
  | 'check-stale-games'; // Detect games that stopped updating

/**
 * Job data for live scores queue
 */
export interface LiveScoresJobData {
  /** Type of job */
  type: LiveScoresJobType;
  /** Single update (for process-update jobs) */
  update?: NormalizedScoreUpdate;
  /** Batch of updates (for batch-process jobs) */
  updates?: NormalizedScoreUpdate[];
  /** Sport to poll (for poll-live-games jobs) */
  sport?: SportType;
  /** What triggered this job */
  triggeredBy: 'webhook' | 'polling' | 'scheduler' | 'manual' | 'api';
  /** ISO timestamp when job was received/created */
  receivedAt: string;
  /** Job priority (1 = high for webhooks, 2 = normal for polling) */
  priority?: number;
}

/**
 * Result of a queue job
 */
export interface LiveScoresJobResult {
  /** Whether job completed successfully */
  success: boolean;
  /** Job type that was processed */
  type: LiveScoresJobType;
  /** Number of updates processed */
  processedCount: number;
  /** Number of database updates made */
  updatedCount: number;
  /** Number of broadcasts sent */
  broadcastCount: number;
  /** Error messages (if any) */
  errors: string[];
  /** Processing duration in milliseconds */
  durationMs: number;
}

// =====================================================
// STATUS MAPPING
// =====================================================

/**
 * Map provider status strings to internal EventStatus
 * Different providers use different status terminology
 */
export const STATUS_NORMALIZATION_MAP: Record<string, EventStatus> = {
  // Common variations for scheduled/not started
  scheduled: EventStatus.SCHEDULED,
  not_started: EventStatus.SCHEDULED,
  upcoming: EventStatus.SCHEDULED,
  pre: EventStatus.SCHEDULED,
  pregame: EventStatus.SCHEDULED,

  // Common variations for live/in progress
  live: EventStatus.LIVE,
  in_progress: EventStatus.LIVE,
  inprogress: EventStatus.LIVE,
  playing: EventStatus.LIVE,
  active: EventStatus.LIVE,
  started: EventStatus.LIVE,

  // Common variations for completed/final
  completed: EventStatus.COMPLETED,
  final: EventStatus.COMPLETED,
  finished: EventStatus.COMPLETED,
  ended: EventStatus.COMPLETED,
  closed: EventStatus.COMPLETED,
  full_time: EventStatus.COMPLETED,

  // Common variations for canceled
  canceled: EventStatus.CANCELED,
  cancelled: EventStatus.CANCELED,
  void: EventStatus.CANCELED,
  abandoned: EventStatus.CANCELED,

  // Common variations for postponed
  postponed: EventStatus.POSTPONED,
  delayed: EventStatus.POSTPONED,
  suspended: EventStatus.POSTPONED,
};

/**
 * Normalize a provider status string to internal EventStatus
 * @param providerStatus - Status string from provider
 * @returns Normalized EventStatus or SCHEDULED as fallback
 */
export function normalizeStatus(providerStatus: string): EventStatus {
  const normalized = providerStatus.toLowerCase().trim().replace(/[^a-z_]/g, '_');
  return STATUS_NORMALIZATION_MAP[normalized] ?? EventStatus.SCHEDULED;
}
