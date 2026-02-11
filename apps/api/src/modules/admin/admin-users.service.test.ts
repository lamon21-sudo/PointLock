// =====================================================
// Admin User Management Service Tests
// =====================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================
// Mock Setup (getter pattern for vi.mock hoisting)
// ===========================================

const mocks = {
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  userUpdate: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  refreshTokenCount: vi.fn(),
  walletFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  auditLogCreate: vi.fn(),
  auditLogFindMany: vi.fn(),
  auditLogCount: vi.fn(),
};

vi.mock('../../lib/prisma', () => {
  const txClient = {
    user: {
      get findMany() { return mocks.userFindMany; },
      get findUnique() { return mocks.userFindUnique; },
      get count() { return mocks.userCount; },
      get update() { return mocks.userUpdate; },
    },
    refreshToken: {
      get updateMany() { return mocks.refreshTokenUpdateMany; },
      get count() { return mocks.refreshTokenCount; },
    },
    wallet: {
      get findUnique() { return mocks.walletFindUnique; },
    },
    match: {
      get findMany() { return mocks.matchFindMany; },
    },
    adminAuditLog: {
      get create() { return mocks.auditLogCreate; },
      get findMany() { return mocks.auditLogFindMany; },
      get count() { return mocks.auditLogCount; },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(txClient),
  };
  return { prisma: txClient };
});

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../lib/wallet.service', () => ({
  creditWallet: vi.fn(),
  debitWallet: vi.fn(),
}));

import {
  listUsers,
  getUserDetail,
  updateUserStatus,
  revokeUserTokens,
  listAuditLog,
} from './admin-users.service';

// ===========================================
// Test Helpers
// ===========================================

function createMockUser(overrides = {}) {
  return {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    displayName: 'Test User',
    status: 'active',
    adminRole: null,
    emailVerified: true,
    kycVerified: false,
    createdAt: new Date('2026-01-01'),
    lastLoginAt: new Date('2026-02-01'),
    skillRating: 1000,
    matchesPlayed: 10,
    matchesWon: 5,
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('Admin Users Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- listUsers ----

  describe('listUsers', () => {
    it('should return paginated users', async () => {
      const users = [createMockUser(), createMockUser({ id: 'user-456' })];
      mocks.userFindMany.mockResolvedValue(users);
      mocks.userCount.mockResolvedValue(2);

      const result = await listUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should never include passwordHash in select', async () => {
      mocks.userFindMany.mockResolvedValue([createMockUser()]);
      mocks.userCount.mockResolvedValue(1);

      await listUsers({ page: 1, limit: 20 });

      const findManyCall = mocks.userFindMany.mock.calls[0][0];
      if (findManyCall?.select) {
        expect(findManyCall.select.passwordHash).toBeUndefined();
      }
    });

    it('should apply search filter', async () => {
      mocks.userFindMany.mockResolvedValue([]);
      mocks.userCount.mockResolvedValue(0);

      await listUsers({ search: 'test@', page: 1, limit: 20 });

      const findManyCall = mocks.userFindMany.mock.calls[0][0];
      expect(findManyCall.where?.OR).toBeDefined();
    });

    it('should filter by status', async () => {
      mocks.userFindMany.mockResolvedValue([]);
      mocks.userCount.mockResolvedValue(0);

      await listUsers({ status: 'suspended', page: 1, limit: 20 });

      const findManyCall = mocks.userFindMany.mock.calls[0][0];
      expect(findManyCall.where?.status).toBe('suspended');
    });
  });

  // ---- getUserDetail ----

  describe('getUserDetail', () => {
    it('should return user detail with wallet and matches', async () => {
      mocks.userFindUnique.mockResolvedValue(createMockUser());
      mocks.walletFindUnique.mockResolvedValue({
        paidBalance: BigInt(5000),
        bonusBalance: BigInt(2000),
      });
      mocks.refreshTokenCount.mockResolvedValue(2);
      mocks.matchFindMany.mockResolvedValue([]);

      const result = await getUserDetail('user-123');

      expect(result.user.id).toBe('user-123');
      expect(result.wallet.paidBalance).toBeDefined();
      expect(result.activeTokensCount).toBe(2);
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mocks.userFindUnique.mockResolvedValue(null);

      await expect(getUserDetail('nonexistent')).rejects.toThrow();
    });
  });

  // ---- updateUserStatus ----

  describe('updateUserStatus', () => {
    it('should prevent self-suspension', async () => {
      await expect(
        updateUserStatus({
          adminId: 'admin-1',
          targetUserId: 'admin-1',
          status: 'suspended' as const,
          reason: 'Self suspension attempt for testing',
        })
      ).rejects.toThrow();
    });

    it('should suspend user and create audit log', async () => {
      mocks.userFindUnique.mockResolvedValue(createMockUser({ status: 'active' }));
      mocks.userUpdate.mockResolvedValue(createMockUser({ status: 'suspended' }));
      mocks.refreshTokenUpdateMany.mockResolvedValue({ count: 3 });
      mocks.auditLogCreate.mockResolvedValue({});

      const result = await updateUserStatus({
        adminId: 'admin-1',
        targetUserId: 'user-123',
        status: 'suspended' as const,
        reason: 'Violation of terms of service detected',
      });

      expect(result.user.status).toBe('suspended');
      expect(mocks.auditLogCreate).toHaveBeenCalled();
    });
  });

  // ---- revokeUserTokens ----

  describe('revokeUserTokens', () => {
    it('should revoke tokens and create audit log', async () => {
      mocks.refreshTokenCount.mockResolvedValue(5);
      mocks.refreshTokenUpdateMany.mockResolvedValue({ count: 5 });
      mocks.auditLogCreate.mockResolvedValue({});

      const result = await revokeUserTokens({
        adminId: 'admin-1',
        targetUserId: 'user-123',
        reason: 'Security concern reported',
      });

      expect(result.revokedCount).toBe(5);
      expect(mocks.auditLogCreate).toHaveBeenCalled();
    });

    it('should handle user with no active tokens', async () => {
      mocks.refreshTokenCount.mockResolvedValue(0);
      mocks.refreshTokenUpdateMany.mockResolvedValue({ count: 0 });
      mocks.auditLogCreate.mockResolvedValue({});

      const result = await revokeUserTokens({
        adminId: 'admin-1',
        targetUserId: 'user-123',
        reason: 'Precautionary token revocation',
      });

      expect(result.revokedCount).toBe(0);
    });
  });

  // ---- listAuditLog ----

  describe('listAuditLog', () => {
    it('should return paginated audit logs', async () => {
      const logs = [{
        id: 'log-1',
        action: 'user_suspended',
        performedBy: 'admin-1',
        targetUserId: 'user-123',
        previousState: { status: 'active' },
        newState: { status: 'suspended' },
        reason: 'Violation of terms',
        metadata: {},
        createdAt: new Date(),
      }];
      mocks.auditLogFindMany.mockResolvedValue(logs);
      mocks.auditLogCount.mockResolvedValue(1);

      const result = await listAuditLog({ page: 1, limit: 20 });

      expect(result.logs).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by action type', async () => {
      mocks.auditLogFindMany.mockResolvedValue([]);
      mocks.auditLogCount.mockResolvedValue(0);

      await listAuditLog({ action: 'user_suspended', page: 1, limit: 20 });

      const findManyCall = mocks.auditLogFindMany.mock.calls[0][0];
      expect(findManyCall.where?.action).toBe('user_suspended');
    });
  });
});
