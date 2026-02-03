// =====================================================
// Live Scores Controller
// =====================================================
// HTTP endpoints for live score updates.

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { SportType } from '@prisma/client';
import {
  webhookPayloadSchema,
  manualScoreUpdateSchema,
  pollTriggerSchema,
} from './live-scores.schemas';
import {
  queueScoreUpdate,
  queueImmediatePoll,
  getLiveScoresQueueStatus,
} from '../../queues/live-scores.queue';
import { normalizeWebhookPayload } from '../../services/live-scores/providers';
import { getLiveEvents } from '../../services/live-scores';

// ===========================================
// Webhook Handler
// ===========================================

/**
 * Handle incoming webhook from sports data provider.
 * POST /api/v1/webhooks/live-scores
 */
export async function handleWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Verify webhook signature (if configured)
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    if (!verifyWebhookSignature(req.body, signature)) {
      logger.warn('[LiveScores] Webhook signature verification failed');
      res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
      });
      return;
    }

    // 2. Parse and validate payload
    const parseResult = webhookPayloadSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('[LiveScores] Invalid webhook payload:', parseResult.error.errors);
      res.status(400).json({
        success: false,
        error: 'Invalid payload',
        details: parseResult.error.errors,
      });
      return;
    }

    const payload = parseResult.data;

    // 3. Determine sport from first event (all events in a webhook should be same sport)
    // In production, the webhook payload would include sport information
    const sport = determineSportFromProvider(payload.provider);

    // 4. Normalize webhook events
    const normalizedUpdates = normalizeWebhookPayload(
      payload.provider as 'odds-api',
      payload.events,
      sport
    );

    // 5. Queue each update for processing
    const jobPromises = normalizedUpdates.map((update) =>
      queueScoreUpdate(update, 'webhook')
    );

    const jobs = await Promise.all(jobPromises);

    logger.info(`[LiveScores] Webhook processed: ${jobs.length} updates queued`, {
      provider: payload.provider,
      eventCount: payload.events.length,
    });

    // 6. Respond immediately (async processing)
    res.status(202).json({
      success: true,
      accepted: true,
      jobIds: jobs.map((j) => j.id),
      message: `Queued ${payload.events.length} score updates`,
    });
  } catch (error) {
    next(error);
  }
}

// ===========================================
// Admin Endpoints
// ===========================================

/**
 * Manually trigger a poll for live games.
 * POST /api/v1/admin/live-scores/poll
 */
export async function triggerPoll(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = pollTriggerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parseResult.error.errors,
      });
      return;
    }

    const { sport } = parseResult.data;

    const job = await queueImmediatePoll(sport, 'api');

    logger.info(`[LiveScores] Manual poll triggered for ${sport}`, { jobId: job.id });

    res.status(202).json({
      success: true,
      message: `Polling job queued for ${sport}`,
      jobId: job.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get queue status for monitoring.
 * GET /api/v1/admin/live-scores/queue-status
 */
export async function getQueueStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const status = await getLiveScoresQueueStatus();

    res.json({
      success: true,
      queue: 'live-scores',
      status,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current live events.
 * GET /api/v1/admin/live-scores/live-events
 */
export async function getLiveEventsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sport = req.query.sport as string | undefined;
    const events = await getLiveEvents(sport);

    res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Manual score update (admin only).
 * POST /api/v1/admin/live-scores/manual-update
 */
export async function manualScoreUpdate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parseResult = manualScoreUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parseResult.error.errors,
      });
      return;
    }

    const { eventId, homeScore, awayScore, status, reason } = parseResult.data;

    // Get the event to determine sport
    const { prisma } = await import('../../lib/prisma');
    const event = await prisma.sportsEvent.findUnique({
      where: { id: eventId },
      select: { externalId: true, sport: true, status: true },
    });

    if (!event) {
      res.status(404).json({
        success: false,
        error: 'Event not found',
      });
      return;
    }

    // Create a normalized update
    const { processScoreUpdate } = await import('../../services/live-scores');
    const update = {
      externalEventId: event.externalId,
      eventId,
      sport: event.sport,
      homeScore,
      awayScore,
      status: status || event.status,
      timestamp: new Date(),
      idempotencyKey: `manual-${eventId}-${Date.now()}`,
      provider: 'admin-manual',
    };

    // Process immediately (bypass queue for manual updates)
    const result = await processScoreUpdate(update);

    // Log for audit trail
    logger.info('[LiveScores] Manual score update processed', {
      eventId,
      homeScore,
      awayScore,
      status,
      reason,
      result: {
        success: result.success,
        scoreChanged: result.scoreChanged,
        statusChanged: result.statusChanged,
      },
    });

    res.json({
      success: result.success,
      result,
    });
  } catch (error) {
    next(error);
  }
}

// ===========================================
// Helper Functions
// ===========================================

/**
 * Verify webhook signature using HMAC-SHA256.
 */
function verifyWebhookSignature(
  body: unknown,
  signature: string | undefined
): boolean {
  const secret = config.liveScores?.webhookSecret;

  // If no secret configured, allow in development
  if (!secret) {
    if (config.nodeEnv === 'development') {
      logger.warn('[LiveScores] No webhook secret configured, skipping verification (dev mode)');
      return true;
    }
    logger.error('[LiveScores] Webhook secret not configured');
    return false;
  }

  if (!signature) {
    return false;
  }

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Determine sport type from provider ID.
 * In production, this would come from the webhook payload.
 */
function determineSportFromProvider(_provider: string): SportType {
  // Default to NFL - in production, the provider would include sport info
  // or the webhook URL would include sport parameter
  return SportType.NFL;
}
