// =====================================================
// Live Scores Routes
// =====================================================
// Route definitions for live score endpoints.

import { Router } from 'express';
import {
  handleWebhook,
  triggerPoll,
  getQueueStatus,
  getLiveEventsHandler,
  manualScoreUpdate,
} from './live-scores.controller';
import { requireAuth } from '../../middleware';

const router = Router();

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
router.post('/admin/live-scores/poll', requireAuth, triggerPoll);

/**
 * Get queue status for monitoring.
 */
router.get('/admin/live-scores/queue-status', requireAuth, getQueueStatus);

/**
 * Get current live events.
 * Query: ?sport=NFL (optional)
 */
router.get('/admin/live-scores/live-events', requireAuth, getLiveEventsHandler);

/**
 * Manual score update (admin only).
 * Body: { eventId, homeScore, awayScore, status?, reason }
 */
router.post('/admin/live-scores/manual-update', requireAuth, manualScoreUpdate);

export default router;
