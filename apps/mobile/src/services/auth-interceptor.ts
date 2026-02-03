import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, waitForAuthInitialization } from '../stores/auth.store';
import { TokenRefreshService } from './token-refresh.service';

// =====================================================
// Type Definitions
// =====================================================

/**
 * Backend API Response Envelope
 * The backend wraps all responses in this structure
 */
interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

// =====================================================
// Auth Endpoint Detection
// =====================================================

/**
 * Check if URL is an auth endpoint that should NOT have auth header
 */
function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;

  const authEndpoints = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/check-username',
  ];

  return authEndpoints.some((endpoint) => url.includes(endpoint));
}

/**
 * Check if this is the refresh token endpoint specifically
 * CRITICAL: Used to prevent infinite refresh loops
 */
function isRefreshEndpoint(url: string | undefined): boolean {
  return url?.includes('/auth/refresh') ?? false;
}


// =====================================================
// Error Logging Throttle
// =====================================================
// Prevents console spam when multiple requests fail simultaneously

let lastAuthErrorLog = 0;
const AUTH_ERROR_THROTTLE_MS = 5000;

function shouldLogAuthError(): boolean {
  const now = Date.now();
  if (now - lastAuthErrorLog < AUTH_ERROR_THROTTLE_MS) {
    return false;
  }
  lastAuthErrorLog = now;
  return true;
}

// =====================================================
// Interceptor Setup
// =====================================================

/**
 * Setup authentication interceptors on the axios instance
 *
 * This configures:
 * 1. Request interceptor - Attaches access token from Zustand store
 * 2. Response interceptor - Handles 401 with mutex-protected token refresh
 *
 * @param axiosInstance - The axios instance to configure
 */
export function setupAuthInterceptors(axiosInstance: AxiosInstance): void {
  // ========================================
  // REQUEST INTERCEPTOR
  // ========================================
  // Attaches the access token to outgoing requests (except auth endpoints)

  axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      // Skip auth header for public auth endpoints
      if (isAuthEndpoint(config.url)) {
        return config;
      }

      // CRITICAL: Wait for auth initialization to complete
      // This prevents 401 errors when requests fire before tokens are loaded from SecureStore
      try {
        await waitForAuthInitialization();
      } catch (error) {
        if (__DEV__) {
          console.warn('⚠️ Auth initialization wait failed, proceeding without token:', error);
        }
      }

      // Read access token from Zustand store (now guaranteed to be hydrated)
      const accessToken = useAuthStore.getState().accessToken;

      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      } else if (__DEV__) {
        console.warn(
          `⚠️ API request to ${config.url} has no auth token. ` +
          `This will result in 401 if the endpoint requires authentication.`
        );
      }

      return config;
    },
    (error: AxiosError) => {
      return Promise.reject(error);
    }
  );

  // ========================================
  // RESPONSE ERROR INTERCEPTOR
  // ========================================
  // Handles 401 errors with centralized token refresh

  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      // Only handle 401 errors
      if (error.response?.status !== 401) {
        return Promise.reject(error);
      }

      // ========================================
      // CRITICAL: Prevent infinite refresh loop
      // ========================================
      // If the refresh endpoint itself returns 401, the refresh token is invalid
      // TokenRefreshService will handle logout automatically

      if (isRefreshEndpoint(originalRequest?.url)) {
        if (__DEV__ && shouldLogAuthError()) {
          console.warn('🚨 Refresh token is invalid or expired.');
        }
        return Promise.reject(new Error('Session expired. Please login again.'));
      }

      // ========================================
      // Prevent infinite retry loops
      // ========================================
      // Only retry each request once

      if (originalRequest?._retry) {
        if (__DEV__ && shouldLogAuthError()) {
          console.warn('🚨 Request already retried.');
        }
        return Promise.reject(new Error('Session expired. Please login again.'));
      }

      // Mark this request as being retried
      if (originalRequest) {
        originalRequest._retry = true;
      }

      // ========================================
      // Use Centralized Token Refresh
      // ========================================
      // TokenRefreshService handles mutex and queueing internally

      try {
        // Attempt to refresh the token using centralized service
        // This automatically queues if refresh is already in progress
        const newAccessToken = await TokenRefreshService.refresh();

        // Success! Retry the original request with new token
        if (originalRequest) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axiosInstance(originalRequest);
        }

        return Promise.reject(error);
      } catch (refreshError: any) {
        // Refresh failed - TokenRefreshService already handled logout
        if (__DEV__ && shouldLogAuthError()) {
          console.warn('🚨 Token refresh failed:', refreshError.message);
        }

        return Promise.reject(new Error('Session expired. Please login again.'));
      }
    }
  );

  if (__DEV__) {
    console.log('✅ Auth interceptors configured');
  }
}
