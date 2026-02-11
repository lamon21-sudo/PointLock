// =====================================================
// Admin User Management Controller
// =====================================================
// HTTP layer for admin user management operations.
// Endpoints require varying permission levels (RBAC).

import { Router, Request, Response, NextFunction } from 'express';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { requireAuth, getAuthenticatedUser } from '../../middleware';
import { validateRequest, validateMultiple } from '../../middleware/validation.middleware';
import { validateAdminPermission } from '../../services/settlement/settlement-edge-cases.service';
import * as schemas from './admin-users.schemas';
import * as adminUsersService from './admin-users.service';

const router = Router();

// ===========================================
// Helper Functions
// ===========================================

function generateRequestId(): string {
  return `admin_users_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Middleware to require VIEWER role (read-only access).
 */
async function requireViewer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'VIEWER');
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require SETTLEMENT_ADMIN role.
 */
async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'SETTLEMENT_ADMIN');
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to require SUPER_ADMIN role.
 */
async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = getAuthenticatedUser(req);
    await validateAdminPermission(user.id, 'SUPER_ADMIN');
    next();
  } catch (error) {
    next(error);
  }
}

// ===========================================
// User List & Detail Endpoints
// ===========================================

/**
 * GET /api/v1/admin/users
 * List users with search and filtering.
 *
 * Auth: Required (VIEWER)
 * Query: ?search=john&status=active&page=1&limit=20
 * Response: 200 with paginated user list
 */
router.get(
  '/users',
  requireAuth,
  requireViewer,
  validateRequest(schemas.listUsersQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as schemas.ListUsersQuery;
      const result = await adminUsersService.listUsers(query);

      const response: ApiResponse<typeof result.users> = {
        success: true,
        data: result.users,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
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

/**
 * GET /api/v1/admin/users/:id
 * Get detailed admin view of a user.
 *
 * Auth: Required (VIEWER)
 * Response: 200 with user detail
 */
router.get(
  '/users/:id',
  requireAuth,
  requireViewer,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.id;
      const result = await adminUsersService.getUserDetail(userId);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// User Status Management Endpoints
// ===========================================

/**
 * PATCH /api/v1/admin/users/:id/status
 * Update user status (suspend or activate).
 *
 * Auth: Required (SUPER_ADMIN)
 * Body: { status: 'suspended', reason: 'Violation of ToS' }
 * Response: 200 with updated user
 */
router.patch(
  '/users/:id/status',
  requireAuth,
  requireSuperAdmin,
  validateRequest(schemas.updateUserStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const targetUserId = req.params.id;
      const { status, reason } = req.body as schemas.UpdateUserStatusInput;

      const result = await adminUsersService.updateUserStatus({
        adminId: user.id,
        targetUserId,
        status,
        reason,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Token Management Endpoints
// ===========================================

/**
 * POST /api/v1/admin/users/:id/revoke-tokens
 * Revoke all active refresh tokens for a user.
 *
 * Auth: Required (SETTLEMENT_ADMIN)
 * Body: { reason: 'Security concern' }
 * Response: 200 with revoked count
 */
router.post(
  '/users/:id/revoke-tokens',
  requireAuth,
  requireAdmin,
  validateRequest(schemas.revokeTokensSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const targetUserId = req.params.id;
      const { reason } = req.body as schemas.RevokeTokensInput;

      const result = await adminUsersService.revokeUserTokens({
        adminId: user.id,
        targetUserId,
        reason,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Wallet Management Endpoints
// ===========================================

/**
 * POST /api/v1/admin/users/:id/wallet/adjust
 * Adjust user wallet balance.
 *
 * Auth: Required (SETTLEMENT_ADMIN)
 * Body: { amount: 1000, type: 'BONUS', reason: 'Compensation for outage' }
 * Response: 200 with new balance
 */
router.post(
  '/users/:id/wallet/adjust',
  requireAuth,
  requireAdmin,
  validateRequest(schemas.adminWalletAdjustSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const targetUserId = req.params.id;
      const { amount, type, reason } = req.body as schemas.AdminWalletAdjustInput;

      const result = await adminUsersService.adjustUserWallet({
        adminId: user.id,
        targetUserId,
        amount,
        type,
        reason,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.get('user-agent'),
      });

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// ===========================================
// Audit Log Endpoints
// ===========================================

/**
 * GET /api/v1/admin/audit-log
 * List admin audit log with filtering.
 *
 * Auth: Required (VIEWER)
 * Query: ?action=user_suspended&performedBy=uuid&page=1&limit=20
 * Response: 200 with paginated audit log
 */
router.get(
  '/audit-log',
  requireAuth,
  requireViewer,
  validateRequest(schemas.listAuditLogQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = req.query as schemas.ListAuditLogQuery;
      const result = await adminUsersService.listAuditLog(query);

      const response: ApiResponse<typeof result.logs> = {
        success: true,
        data: result.logs,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: generateRequestId(),
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

export default router;
