// =====================================================
// Live Scores Service Index
// =====================================================
// Main exports for the live scores service.

// Types
export * from './types';

// Processor
export {
  processScoreUpdate,
  processBatchUpdates,
  validateScoreChange,
  getEventScore,
  getLiveEvents,
} from './live-scores.processor';

// Broadcaster
export {
  broadcastScoreUpdate,
  broadcastStatusChange,
  broadcastToEventRoom,
  broadcastToMatchRooms,
  getEventRoomSize,
} from './live-scores.broadcaster';

// Providers
export {
  getProvider,
  getAllProviders,
  hasConfiguredProviders,
  pollLiveGames,
  pollAllLiveGames,
  normalizeWebhookPayload,
} from './providers';
