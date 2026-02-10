// =====================================================
// Health Check Routes
// =====================================================

import { Router, Request, Response } from "express";
import { ApiResponse } from "@pick-rivals/shared-types";
import { prisma } from "../lib/prisma";
import { getRedisConnection } from "../queues/connection";
import { logger } from "../utils/logger";

const router: Router = Router();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    api: "up" | "down";
    database: "up" | "down";
    redis: "up" | "down";
  };
}

// GET /health
router.get("/", async (_req: Request, res: Response) => {
  let dbStatus: "up" | "down" = "down";
  let redisStatus: "up" | "down" = "down";

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "up";
  } catch (err) {
    logger.warn("Health check: database unreachable", err);
  }

  // Check Redis
  try {
    const redis = getRedisConnection();
    const pong = await redis.ping();
    redisStatus = pong === "PONG" ? "up" : "down";
  } catch (err) {
    logger.warn("Health check: Redis unreachable", err);
  }

  const overallStatus: HealthStatus["status"] =
    dbStatus === "up" && redisStatus === "up"
      ? "healthy"
      : dbStatus === "up" || redisStatus === "up"
        ? "degraded"
        : "unhealthy";

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "0.1.0",
    services: {
      api: "up",
      database: dbStatus,
      redis: redisStatus,
    },
  };

  const statusCode = overallStatus === "unhealthy" ? 503 : 200;

  const response: ApiResponse<HealthStatus> = {
    success: overallStatus !== "unhealthy",
    data: healthStatus,
  };

  res.status(statusCode).json(response);
});

// GET /health/ready (Kubernetes readiness probe)
router.get("/ready", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = getRedisConnection();
    await redis.ping();
    res.status(200).json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// GET /health/live (Kubernetes liveness probe)
router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

// GET /health/debug-sentry (non-production only - test Sentry integration)
if (process.env.NODE_ENV !== "production") {
  router.get("/debug-sentry", (_req: Request, _res: Response) => {
    throw new Error("Sentry test error from /health/debug-sentry");
  });
}

export default router;
