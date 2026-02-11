// =====================================================
// Live Scores Routes
// =====================================================
// Route definitions for live score endpoints.

import { Router, Request, Response, NextFunction } from 'express';
import {
  handleWebhook,
  triggerPoll,
  getQueueStatus,
  getLiveEventsHandler,
  manualScoreUpdate,
} from './live-scores.controller';
import { requireAuth, getAuthenticatedUser } from '../../middleware';
import { validateAdminPermission } from '../../services/settlement/settlement-edge-cases.service';

const router = Router();

// ===========================================
// Admin RBAC Middleware
// ===========================================

async function requireLiveScoresAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'SETTLEMENT_ADMIN');
    next();
  } catch (error) {
    next(error);
  }
}

// ===========================================
// Webhook Endpoint (No Auth - Uses Signature)
// ===========================================

/**
 * Webhook endpoint for sports data providers.
 * Security is via HMAC signature verification, not JWT.
 */
router.post('/webhooks/live-scores', handleWebhook);

// ===========================================
// Admin Endpoints (Require Auth)
// ===========================================

/**
 * Trigger a manual poll for live games.
 * Body: { sport: 'NFL' | 'NBA' | ... }
 */
router.post('/admin/live-scores/poll', requireAuth, requireLiveScoresAdmin, triggerPoll);

/**
 * Get queue status for monitoring.
 */
router.get('/admin/live-scores/queue-status', requireAuth, requireLiveScoresAdmin, getQueueStatus);

/**
 * Get current live events.
 * Query: ?sport=NFL (optional)
 */
router.get('/admin/live-scores/live-events', requireAuth, requireLiveScoresAdmin, getLiveEventsHandler);

/**
 * Manual score update (admin only).
 * Body: { eventId, homeScore, awayScore, status?, reason }
 */
router.post('/admin/live-scores/manual-update', requireAuth, requireLiveScoresAdmin, manualScoreUpdate);

export default router;
