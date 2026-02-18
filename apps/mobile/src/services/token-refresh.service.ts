// =====================================================
// Centralized Token Refresh Service
// =====================================================
// Singleton service that manages token refresh for BOTH
// HTTP requests (via auth-interceptor) and WebSocket connections.
//
// Features:
// - Global mutex to prevent concurrent refresh attempts
// - Request queueing while refresh is in progress
// - Single source of truth for refresh logic
// - Automatic logout on refresh failure
// - Race condition protection during logout

import { api } from './api';
import { useAuthStore } from '../stores/auth.store';
import { isTokenExpired } from '../utils/jwt';

// =====================================================
// Type Definitions
// =====================================================

interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

interface AuthTokensData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}

// =====================================================
// Module-level Mutex State
// =====================================================
// Shared across HTTP interceptor and Socket service

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;
let queuedRequests: QueuedRequest[] = [];

// Logout mutex to prevent concurrent logout operations
let isForceLoggingOut = false;

// =====================================================
// Token Refresh Service
// =====================================================

export class TokenRefreshService {
  /**
   * Refresh access token with mutex protection.
   * If a refresh is already in progress, queues the caller
   * and returns when refresh completes.
   *
   * @returns Promise resolving to new access token
   * @throws Error if refresh fails or user is logged out
   */
  static async refresh(): Promise<string> {
    // Fast path: if refresh is in progress, join the queue
    if (isRefreshing && refreshPromise) {
      console.log('[TokenRefresh] Refresh already in progress, joining queue...');
      return this.joinQueue();
    }

    // Start new refresh
    isRefreshing = true;
    refreshPromise = this.performRefresh();

    try {
      const newAccessToken = await refreshPromise;

      // Success! Resolve all queued requests
      this.processQueue(null, newAccessToken);

      return newAccessToken;
    } catch (error: any) {
      // Failure! Reject all queued requests
      this.processQueue(error, null);

      // Force logout
      await this.forceLogout();

      throw error;
    } finally {
      // Always reset mutex
      isRefreshing = false;
      refreshPromise = null;
    }
  }

  /**
   * Ensure the current access token is valid (not expired or near-expiry).
   * If the token is stale, proactively refreshes before returning.
   *
   * Use this before socket connections and push registration to avoid
   * reactive TOKEN_EXPIRED / 401 error cascades.
   *
   * @param bufferSeconds - Seconds before actual expiry to trigger refresh (default 60)
   * @returns Promise resolving to a valid access token
   * @throws Error if no token exists and refresh fails
   */
  static async ensureValidToken(bufferSeconds = 60): Promise<string> {
    const authState = useAuthStore.getState();

    // Guard: Don't attempt refresh during logout or when not authenticated
    if (authState.isLoggingOut || !authState.isAuthenticated) {
      throw new Error('Not authenticated or logging out');
    }

    const { accessToken } = authState;

    if (accessToken && !isTokenExpired(accessToken, bufferSeconds)) {
      return accessToken;
    }

    // Token is missing, expired, or near-expiry — refresh proactively
    console.log('[TokenRefresh] Access token stale or missing, refreshing proactively...');
    return this.refresh();
  }

  /**
   * Check if a refresh is currently in progress.
   */
  static isRefreshing(): boolean {
    return isRefreshing;
  }

  // =====================================================
  // Private Methods
  // =====================================================

  /**
   * Perform the actual token refresh API call.
   */
  private static async performRefresh(): Promise<string> {
    const authStore = useAuthStore.getState();
    const refreshToken = authStore.refreshToken;

    // Guard: No refresh token available
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    // Guard: User is logging out - abort refresh
    if (authStore.isLoggingOut) {
      throw new Error('User is logging out - aborting token refresh');
    }

    try {
      console.log('[TokenRefresh] Calling /auth/refresh endpoint...');

      // Make refresh request using the API instance
      // The auth interceptor will NOT attach auth header for /auth/refresh
      const response = await api.post<ApiResponseEnvelope<AuthTokensData>>(
        '/auth/refresh',
        { refreshToken }
      );

      // Validate response structure
      if (!response.data?.success || !response.data?.data) {
        throw new Error('Invalid refresh response structure');
      }

      const { accessToken, refreshToken: newRefreshToken } = response.data.data;

      // Validate tokens
      if (!accessToken || !newRefreshToken) {
        throw new Error('Invalid tokens received from refresh endpoint');
      }

      // CRITICAL: Check again before saving - user may have logged out during request
      const currentState = useAuthStore.getState();
      if (currentState.isLoggingOut || !currentState.isAuthenticated) {
        console.log('[TokenRefresh] User logged out during refresh - discarding tokens');
        throw new Error('User logged out during token refresh');
      }

      // Update tokens in store (persists to SecureStore)
      console.log('[TokenRefresh] Saving new tokens to auth store...');
      await useAuthStore.getState().setTokens(accessToken, newRefreshToken);
      console.log('[TokenRefresh] Tokens saved successfully');

      return accessToken;
    } catch (error: any) {
      // Network errors
      if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
        throw new Error('Network error during token refresh');
      }

      // 401 from refresh endpoint means refresh token is invalid
      if (error.response?.status === 401) {
        throw new Error('Refresh token is invalid or expired');
      }

      throw error;
    }
  }

  /**
   * Add current caller to queue while refresh is in progress.
   */
  private static joinQueue(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      queuedRequests.push({ resolve, reject });
    });
  }

  /**
   * Process all queued requests after refresh completes.
   */
  private static processQueue(error: Error | null, token: string | null): void {
    queuedRequests.forEach((request) => {
      if (error) {
        request.reject(error);
      } else if (token) {
        request.resolve(token);
      }
    });

    // Clear the queue
    queuedRequests = [];
  }

  /**
   * Force logout when token refresh fails.
   * Clears all auth state and persisted tokens.
   */
  private static async forceLogout(): Promise<void> {
    // Mutex: Prevent concurrent forceLogout operations and
    // skip if user-initiated logout is already in progress
    if (isForceLoggingOut || useAuthStore.getState().isLoggingOut) {
      return;
    }

    isForceLoggingOut = true;

    try {
      console.log('[TokenRefresh] Token refresh failed - forcing logout');

      // Clear refresh state so no new callers join a dead queue
      isRefreshing = false;
      refreshPromise = null;

      // Clear auth state (Zustand store + SecureStore)
      await useAuthStore.getState().logout();

      console.log('[TokenRefresh] User logged out due to failed token refresh');
    } catch (error) {
      console.warn('[TokenRefresh] Error during force logout:', error);
    } finally {
      isForceLoggingOut = false;
    }
  }
}
