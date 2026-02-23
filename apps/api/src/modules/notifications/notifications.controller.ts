// =====================================================
// Notifications Controller
// =====================================================
// HTTP layer - handles request/response formatting.
// All business logic is delegated to notifications.service.ts
// CRITICAL: All endpoints require authentication.

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES, PaginationMeta } from '@pick-rivals/shared-types';
import {
  registerDeviceTokenSchema,
  removeDeviceTokenSchema,
  updatePreferencesSchema,
  inboxQuerySchema,
  inboxItemIdParamSchema,
  validateInput,
} from './notifications.schemas';
import * as notificationsService from './notifications.service';
import type {
  NotificationPreferenceRecord,
  NotificationInboxItemRecord,
  PaginatedInbox,
} from './notifications.service';
import { requireAuth, getAuthenticatedUser, creationRateLimiter } from '../../middleware';
import { NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router: Router = Router();

// =====================================================
// Helper Functions
// =====================================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatValidationErrors(
  errors: { path: (string | number)[]; message: string }[],
): string {
  return errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
}

// =====================================================
// POST /notifications/device-token
// =====================================================
// Register a device push token for the authenticated user.
// Rate limited to prevent token flood abuse.
// Idempotent: re-registering an existing token reactivates it.

router.post(
  '/device-token',
  requireAuth,
  creationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const validation = validateInput(registerDeviceTokenSchema, req.body);
      if (!validation.success || !validation.data) {
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: formatValidationErrors(validation.errors ?? []),
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { token, platform, deviceId, appVersion } = validation.data;

      await notificationsService.registerDeviceToken(
        user.id,
        token,
        platform,
        deviceId,
        appVersion,
      );

      logger.info('[Notifications] Device token registered', { userId: user.id, platform });

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Device token registered successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// DELETE /notifications/device-token
// =====================================================
// Deactivate a device token (soft delete).
// Called on logout or when the OS revokes a push token.
// Idempotent: deactivating an already-inactive token is a no-op.

router.delete(
  '/device-token',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const validation = validateInput(removeDeviceTokenSchema, req.body);
      if (!validation.success || !validation.data) {
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: formatValidationErrors(validation.errors ?? []),
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      await notificationsService.removeDeviceToken(user.id, validation.data.token);

      logger.info('[Notifications] Device token removed', { userId: user.id });

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Device token removed successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// GET /notifications/preferences
// =====================================================
// Retrieve the authenticated user's notification preferences.
// Auto-creates a default preference record if one does not yet exist.

router.get(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const prefs: NotificationPreferenceRecord =
        await notificationsService.getPreferences(user.id);

      const response: ApiResponse<{ preferences: NotificationPreferenceRecord }> = {
        success: true,
        data: { preferences: prefs },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// PUT /notifications/preferences
// =====================================================
// Update notification preferences for the authenticated user.
// Partial updates are supported — only supplied fields are written.

router.put(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const validation = validateInput(updatePreferencesSchema, req.body);
      if (!validation.success || !validation.data) {
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: formatValidationErrors(validation.errors ?? []),
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      logger.info('[Notifications] Updating preferences', { userId: user.id });

      const prefs: NotificationPreferenceRecord =
        await notificationsService.updatePreferences(user.id, validation.data);

      const response: ApiResponse<{ preferences: NotificationPreferenceRecord }> = {
        success: true,
        data: { preferences: prefs },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// GET /notifications/inbox
// =====================================================
// Paginated list of inbox items for the authenticated user.
// Supports unreadOnly filter for badge-count-driven reads.

router.get(
  '/inbox',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const parsed = inboxQuerySchema.safeParse(req.query);
      const { page, limit, unreadOnly } = parsed.success
        ? parsed.data
        : { page: 1, limit: 20, unreadOnly: false };

      if (!parsed.success) {
        logger.warn('[Notifications] Invalid inbox query parameters', {
          userId: user.id,
          errors: parsed.error.errors,
          query: req.query,
        });
      }

      const result: PaginatedInbox = await notificationsService.getInbox(
        user.id,
        page,
        limit,
        unreadOnly,
      );

      const paginationMeta: PaginationMeta = {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev,
      };

      const response: ApiResponse<{ items: NotificationInboxItemRecord[] }> = {
        success: true,
        data: { items: result.items },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
          pagination: paginationMeta,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// GET /notifications/inbox/unread-count
// =====================================================
// Return the number of unread inbox items.
// MUST be defined before /inbox/:id to avoid Express matching
// "unread-count" as a value for the :id param.

router.get(
  '/inbox/unread-count',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const count: number = await notificationsService.getUnreadCount(user.id);

      const response: ApiResponse<{ unreadCount: number }> = {
        success: true,
        data: { unreadCount: count },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// POST /notifications/inbox/read-all
// =====================================================
// Mark every unread inbox item as read in a single operation.
// MUST be defined before /inbox/:id/read to avoid route conflicts.

router.post(
  '/inbox/read-all',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const updatedCount: number = await notificationsService.markAllInboxRead(user.id);

      logger.info('[Notifications] All inbox items marked read', {
        userId: user.id,
        count: updatedCount,
      });

      const response: ApiResponse<{ updatedCount: number }> = {
        success: true,
        data: { updatedCount },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// POST /notifications/inbox/:id/read
// =====================================================
// Mark a single inbox item as read.
// Returns 404 if the item does not exist or belongs to another user.

router.post(
  '/inbox/:id/read',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = inboxItemIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('[Notifications] Invalid inbox item ID param', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid inbox item ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { id: itemId } = paramsParsed.data;

      const found: boolean = await notificationsService.markInboxItemRead(user.id, itemId);
      if (!found) {
        throw new NotFoundError(
          'Inbox item not found',
          ERROR_CODES.USER_NOT_FOUND,
        );
      }

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Inbox item marked as read' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

// =====================================================
// DELETE /notifications/inbox/:id
// =====================================================
// Hard-delete a single inbox item.
// Returns 404 if the item does not exist or belongs to another user.

router.delete(
  '/inbox/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);

      const paramsParsed = inboxItemIdParamSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        logger.warn('[Notifications] Invalid inbox item ID param', {
          userId: user.id,
          errors: paramsParsed.error.errors,
          params: req.params,
        });
        res.status(400).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid inbox item ID format',
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: generateRequestId(),
          },
        });
        return;
      }

      const { id: itemId } = paramsParsed.data;

      const found: boolean = await notificationsService.deleteInboxItem(user.id, itemId);
      if (!found) {
        throw new NotFoundError(
          'Inbox item not found',
          ERROR_CODES.USER_NOT_FOUND,
        );
      }

      logger.info('[Notifications] Inbox item deleted', { userId: user.id, itemId });

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Inbox item deleted successfully' },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

export { router as notificationsRoutes };
