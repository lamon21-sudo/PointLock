// =====================================================
// Events Routes - Sports Events API
// =====================================================

import { Router, Request, Response } from "express";
import { ApiResponse, SportsEvent, SportType } from "@pick-rivals/shared-types";
import { MOCK_EVENTS, getEventsBySport, getEventById } from "../data/MOCK_DATA";

const router: Router = Router();

// GET /api/v1/events
// List all upcoming events with optional sport filter
router.get("/", (req: Request, res: Response) => {
  const { sport, page = "1", limit = "20" } = req.query;

  let events = [...MOCK_EVENTS];

  // Filter by sport if provided
  if (sport && typeof sport === "string") {
    const sportUpper = sport.toUpperCase() as SportType;
    events = getEventsBySport(sportUpper);
  }

  // Sort by scheduled time
  events.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  // Pagination
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = startIndex + limitNum;

  const paginatedEvents = events.slice(startIndex, endIndex);

  const response: ApiResponse<SportsEvent[]> = {
    success: true,
    data: paginatedEvents,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req_${Date.now()}`,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: events.length,
        totalPages: Math.ceil(events.length / limitNum),
        hasNext: endIndex < events.length,
        hasPrev: pageNum > 1,
      },
    },
  };

  res.json(response);
});

// GET /api/v1/events/:id
// Get single event by ID
router.get("/:id", (req: Request, res: Response) => {
  const { id } = req.params;

  const event = getEventById(id);

  if (!event) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: "EVENT_NOT_FOUND",
        message: `Event with ID ${id} not found`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: `req_${Date.now()}`,
      },
    };

    return res.status(404).json(response);
  }

  const response: ApiResponse<SportsEvent> = {
    success: true,
    data: event,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: `req_${Date.now()}`,
    },
  };

  return res.json(response);
});

export default router;
