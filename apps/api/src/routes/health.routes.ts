// =====================================================
// Health Check Routes
// =====================================================

import { Router, Request, Response } from "express";
import { ApiResponse } from "@pick-rivals/shared-types";

const router: Router = Router();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    api: "up" | "down";
    database: "up" | "down" | "not_checked";
  };
}

// GET /health
router.get("/", (_req: Request, res: Response) => {
  const healthStatus: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "0.1.0",
    services: {
      api: "up",
      database: "not_checked", // Will implement DB health check later
    },
  };

  const response: ApiResponse<HealthStatus> = {
    success: true,
    data: healthStatus,
  };

  res.json(response);
});

// GET /health/ready (Kubernetes readiness probe)
router.get("/ready", (_req: Request, res: Response) => {
  // Add actual readiness checks here (DB connection, etc.)
  res.status(200).json({ ready: true });
});

// GET /health/live (Kubernetes liveness probe)
router.get("/live", (_req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

export default router;
