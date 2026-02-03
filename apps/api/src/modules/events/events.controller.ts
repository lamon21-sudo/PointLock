// =====================================================
// Events Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to events.service.ts

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import {
  validateListEventsQuery,
  validateEventId,
  EventListItem,
  EventDetails,
} from './events.schemas';
import * as eventsService from './events.service';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { OddsData, PlayerPropData } from '../../services/events/types';

const router: Router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatValidationErrors(
  errors: { path: (string | number)[]; message: string }[]
): string {
  return errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

/**
 * Convert decimal odds to American odds format
 */
function decimalToAmericanOdds(decimal: number): number {
  if (decimal >= 2.0) {
    // Positive American odds: (decimal - 1) * 100
    return Math.round((decimal - 1) * 100);
  } else {
    // Negative American odds: -100 / (decimal - 1)
    return Math.round(-100 / (decimal - 1));
  }
}

// ===========================================
// GET /events
// List all events with filtering and pagination
// ===========================================

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();

      // Validate query parameters
      const validation = validateListEventsQuery(req.query);

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const query = validation.data;

      logger.debug(`[EventsController] List events request`, {
        requestId,
        sport: query.sport,
        status: query.status,
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page,
        limit: query.limit,
        sort: query.sort,
      });

      // Fetch events from service
      const result = await eventsService.listEvents(query);

      // Build response
      const response: ApiResponse<EventListItem[]> = {
        success: true,
        data: result.events,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
            hasNext: result.page < result.totalPages,
            hasPrev: result.page > 1,
          },
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /events/:id
// Get single event by ID with full details
// ===========================================

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();

      // Validate ID parameter
      const validation = validateEventId({ id: req.params.id });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = validation.data;

      logger.debug(`[EventsController] Get event request`, {
        requestId,
        eventId: id,
      });

      // Fetch event from service
      const event = await eventsService.getEventById(id);

      if (!event) {
        throw new NotFoundError(
          `Event with ID ${id} not found`,
          ERROR_CODES.EVENT_NOT_FOUND
        );
      }

      // Build response
      const response: ApiResponse<EventDetails> = {
        success: true,
        data: event,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// GET /events/:id/props
// Get player props for a specific event
// ===========================================

interface PropResponse {
  playerId: string;
  playerName: string;
  propType: string;
  line: number;
  over: number; // American odds
  under: number; // American odds
}

router.get(
  '/:id/props',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = generateRequestId();

      // Validate ID parameter
      const validation = validateEventId({ id: req.params.id });

      if (!validation.success || !validation.data) {
        throw new BadRequestError(
          formatValidationErrors(validation.errors || []),
          ERROR_CODES.VALIDATION_ERROR
        );
      }

      const { id } = validation.data;

      logger.debug(`[EventsController] Get event props request`, {
        requestId,
        eventId: id,
      });

      // Fetch event from service
      const event = await eventsService.getEventById(id);

      if (!event) {
        throw new NotFoundError(
          `Event with ID ${id} not found`,
          ERROR_CODES.EVENT_NOT_FOUND
        );
      }

      // Extract props from oddsData
      const oddsData = event.oddsData as OddsData | null;
      const rawProps: PlayerPropData[] = oddsData?.markets?.props?.players || [];

      // Transform to API response format with American odds
      const props: PropResponse[] = rawProps.map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        propType: p.propType,
        line: p.line,
        over: decimalToAmericanOdds(p.overOdds),
        under: decimalToAmericanOdds(p.underOdds),
      }));

      // Build response
      const response: ApiResponse<{
        eventId: string;
        sport: string;
        lastUpdated: string | null;
        props: PropResponse[];
      }> = {
        success: true,
        data: {
          eventId: event.id,
          sport: event.sport,
          lastUpdated: oddsData?.markets?.props?.lastUpdated || null,
          props,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
