// =====================================================
// Wallet Service
// =====================================================
// API client for wallet operations.
// All methods are typed and handle errors gracefully.

import { api } from './api';
import {
  Wallet,
  Transaction,
  TransactionHistoryResponse,
  AllowanceCheckResponse,
  AllowanceClaimResponse,
  PaginationMeta,
  TransactionType,
} from '../types/wallet.types';

/**
 * Standard API response wrapper.
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    pagination?: PaginationMeta;
  };
}

/**
 * Query parameters for transaction history.
 */
interface TransactionHistoryParams {
  page?: number;
  limit?: number;
  type?: TransactionType;
}

/**
 * Wallet API Service
 *
 * Provides type-safe methods for:
 * - Fetching wallet balance
 * - Retrieving transaction history with pagination
 * - Checking and claiming weekly allowance
 */
export const WalletService = {
  /**
   * Get the current user's wallet balance and stats.
   * @returns Wallet data including paid/bonus balances and cumulative stats.
   * @throws Error if request fails or wallet not found.
   */
  async getWallet(): Promise<Wallet> {
    const response = await api.get<ApiResponse<Wallet>>('/wallet');

    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error?.message || 'Failed to fetch wallet');
    }

    return response.data.data;
  },

  /**
   * Get transaction history with optional filtering and pagination.
   * @param params - Query parameters for filtering and pagination.
   * @returns List of transactions with pagination metadata.
   */
  async getTransactionHistory(
    params: TransactionHistoryParams = {}
  ): Promise<TransactionHistoryResponse> {
    const { page = 1, limit = 20, type } = params;

    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...(type && { type }),
    });

    const response = await api.get<ApiResponse<TransactionHistoryResponse>>(
      `/wallet/transactions?${queryParams.toString()}`
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to fetch transactions'
      );
    }

    return response.data.data;
  },

  /**
   * Check if the user is eligible for weekly allowance.
   * @returns Eligibility status and next claim time.
   */
  async checkAllowance(): Promise<AllowanceCheckResponse> {
    const response = await api.get<ApiResponse<AllowanceCheckResponse>>(
      '/wallet/allowance'
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to check allowance eligibility'
      );
    }

    return response.data.data;
  },

  /**
   * Claim the weekly allowance if eligible.
   * @returns Claim result with new balance and next claim time.
   * @throws Error if not eligible or claim fails.
   */
  async claimAllowance(): Promise<AllowanceClaimResponse> {
    const response = await api.post<ApiResponse<AllowanceClaimResponse>>(
      '/wallet/claim-allowance'
    );

    if (!response.data.success || !response.data.data) {
      throw new Error(
        response.data.error?.message || 'Failed to claim allowance'
      );
    }

    return response.data.data;
  },
};

export default WalletService;
