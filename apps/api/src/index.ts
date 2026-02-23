import "dotenv/config";
import "./instrument";
import app from "./app";
import { config } from "./config";
import { logger } from "./utils/logger";
import * as Sentry from "@sentry/node";
import { disconnectPrisma } from "./lib/prisma";
import {
  closeRedisConnections,
  startEventsSyncWorker,
  stopEventsSyncWorker,
  scheduleEventsSyncJobs,
  queueImmediateSync,
  startMatchExpiryWorker,
  stopMatchExpiryWorker,
  scheduleMatchExpiryChecks,
  startGameSettlementWorker,
  stopGameSettlementWorker,
  startLeaderboardResetWorker,
  stopLeaderboardResetWorker,
  scheduleWeeklyLeaderboardReset,
  startLeaderboardUpdateWorker,
  stopLeaderboardUpdateWorker,
  queueFullCacheRebuild,
  startPlayerTierSyncWorker,
  stopPlayerTierSyncWorker,
  scheduleDailyPlayerTierSync,
  startMatchmakingWorker,
  stopMatchmakingWorker,
  scheduleMatchmakingProcessor,
  startSeasonWorker,
  stopSeasonWorker,
  scheduleSeasonJobs,
  startNotificationSchedulerWorker,
  stopNotificationSchedulerWorker,
  scheduleNotificationJobs,
} from "./queues";
import { bootstrapLeaderboards } from "./lib/leaderboard-bootstrap";
import {
  startLiveScoresWorker,
  stopLiveScoresWorker,
  scheduleLiveScoresPolling,
} from "./queues/live-scores.queue";
import { initializeSocket, shutdownSocketServer } from "./socket";

const PORT = config.port;

// ===========================================
// Initialize Background Workers
// ===========================================

async function initializeWorkers(): Promise<void> {
  try {
    // Start the events sync worker
    startEventsSyncWorker();

    // Schedule recurring sync jobs (every 15 minutes)
    await scheduleEventsSyncJobs();

    // Queue an immediate sync on startup
    await queueImmediateSync("startup");

    // Start the match expiry worker
    startMatchExpiryWorker();

    // Schedule recurring expiry checks (every 5 minutes)
    await scheduleMatchExpiryChecks();

    // Start the live scores worker
    startLiveScoresWorker();

    // Schedule live scores polling if enabled
    if (config.liveScores?.enablePolling) {
      await scheduleLiveScoresPolling();
      logger.info("Live scores polling scheduled (every 30 seconds)");
    } else {
      logger.info("Live scores polling disabled (set LIVE_SCORES_ENABLE_POLLING=true to enable)");
    }

    // Start the game settlement worker
    startGameSettlementWorker();
    logger.info("Game settlement worker started");

    // Bootstrap leaderboards (ensure GLOBAL and WEEKLY exist)
    await bootstrapLeaderboards();

    // Start the leaderboard reset worker
    startLeaderboardResetWorker();

    // Schedule weekly leaderboard reset (Mondays 00:00 UTC)
    await scheduleWeeklyLeaderboardReset();
    logger.info("Leaderboard reset worker started and weekly reset scheduled");

    // Start leaderboard cache update worker
    startLeaderboardUpdateWorker();
    logger.info("Leaderboard cache update worker started");

    // Queue initial cache rebuild on startup
    await queueFullCacheRebuild('startup');
    logger.info("Leaderboard cache rebuild queued");

    // Start the player tier sync worker
    startPlayerTierSyncWorker();
    await scheduleDailyPlayerTierSync();
    logger.info("Player tier sync worker started and daily sync scheduled (4 AM UTC)");

    // Start the matchmaking worker
    startMatchmakingWorker();
    await scheduleMatchmakingProcessor();
    logger.info("Matchmaking worker started and processor scheduled (every 5 seconds)");

    // Start the season worker (rank decay, season end, rewards)
    startSeasonWorker();
    await scheduleSeasonJobs();
    logger.info("Season worker started (decay 2 AM UTC, season check hourly)");

    // Start the notification scheduler worker
    startNotificationSchedulerWorker();
    await scheduleNotificationJobs();
    logger.info("Notification scheduler worker started");

    logger.info("Background workers initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize background workers:", error);
    // Don't crash the server if Redis is unavailable
    // The API can still function without background sync
  }
}

// ===========================================
// Start Server
// ===========================================

const server = app.listen(PORT, "0.0.0.0", async () => {
  logger.info(`PickRivals API Server running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Server listening on 0.0.0.0:${PORT} (accessible externally)`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  // Initialize Socket.io
  try {
    await initializeSocket(server);
    logger.info(`WebSocket server ready on ws://localhost:${PORT}`);
  } catch (error) {
    logger.error("Failed to initialize WebSocket server:", error);
    // Don't crash - API can still work without WebSockets
  }

  // Initialize workers after server is listening
  await initializeWorkers();
});

// ===========================================
// Graceful Shutdown
// ===========================================

const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    try {
      // Shutdown Socket.io first (disconnects all clients)
      await shutdownSocketServer();
      logger.info("WebSocket server closed");

      // Stop background workers
      await stopEventsSyncWorker();
      await stopMatchExpiryWorker();
      await stopLiveScoresWorker();
      await stopGameSettlementWorker();
      await stopLeaderboardResetWorker();
      await stopLeaderboardUpdateWorker();
      await stopPlayerTierSyncWorker();
      await stopMatchmakingWorker();
      await stopSeasonWorker();
      await stopNotificationSchedulerWorker();
      logger.info("Background workers stopped");

      // Close Redis connections
      await closeRedisConnections();
      logger.info("Redis connections closed");

      // Disconnect Prisma
      await disconnectPrisma();
      logger.info("Database connections closed");

      logger.info("HTTP server closed.");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error(
      "Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ===========================================
// Unhandled Error Handlers
// ===========================================

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  Sentry.close(2000).then(() => process.exit(1)).catch(() => process.exit(1));
});
