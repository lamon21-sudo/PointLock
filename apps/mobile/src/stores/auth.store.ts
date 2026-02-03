import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  isLoggingOut: boolean; // Mutex to prevent concurrent logout operations

  // Actions
  setUser: (user: User | null) => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
  isCurrentlyAuthenticated: () => boolean;
}

// Secure storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'user_data';

// Module-level state to track initialization
let initializationPromise: Promise<void> | null = null;
let resolveInitialization: (() => void) | null = null;
let isInitializationComplete = false;

// Create the initialization promise immediately at module load
// This ensures any early API calls will wait for auth to be ready
initializationPromise = new Promise<void>((resolve) => {
  resolveInitialization = resolve;
});

/**
 * Wait for auth store to complete initialization.
 * This ensures tokens are loaded from SecureStore before proceeding.
 * Used by request interceptors to prevent 401 errors on app startup.
 *
 * CRITICAL: This function is called by the auth interceptor before EVERY
 * authenticated API request. It blocks until initialize() has completed
 * loading tokens from SecureStore.
 */
export async function waitForAuthInitialization(): Promise<void> {
  // Fast path: if already initialized, return immediately
  if (isInitializationComplete) {
    return;
  }

  // If promise exists, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  // Fallback: shouldn't reach here, but return resolved promise
  return Promise.resolve();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  isLoggingOut: false,

  setUser: async (user) => {
    set({
      user,
      isAuthenticated: !!user
    });

    // Persist user data - AWAIT to ensure atomic operation
    if (user) {
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } else {
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  },

  setTokens: async (accessToken, refreshToken) => {
    set({ isLoading: true });

    try {
      set({
        accessToken,
        refreshToken,
        isAuthenticated: true
      });

      // Persist tokens securely
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
        SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  clearTokens: async () => {
    set({ isLoading: true });

    try {
      set({
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false
      });

      // Clear secure storage
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },

  initialize: async () => {
    try {
      set({ isLoading: true });

      // Load tokens from secure storage
      const [accessToken, refreshToken, userJson] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (accessToken && refreshToken && userJson) {
        const user = JSON.parse(userJson);
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      // Clear potentially corrupted data
      await get().clearTokens();
    } finally {
      set({ isInitialized: true, isLoading: false });

      // Signal that initialization is complete
      // CRITICAL: Set the flag BEFORE resolving to prevent race conditions
      isInitializationComplete = true;

      if (resolveInitialization) {
        resolveInitialization();
        resolveInitialization = null;
        // Note: We keep initializationPromise around for any in-flight awaits
        // The isInitializationComplete flag provides the fast path
      }
    }
  },

  logout: async () => {
    // Mutex: Prevent concurrent logout operations
    if (get().isLoggingOut) {
      return;
    }

    set({ isLoading: true, isLoggingOut: true });

    try {
      await get().clearTokens();
      await get().setUser(null); // AWAIT to ensure atomic operation
    } finally {
      set({ isLoading: false, isLoggingOut: false });
    }
  },

  /**
   * Check if user is currently authenticated
   * Used by interceptors to guard against race conditions
   */
  isCurrentlyAuthenticated: () => {
    const state = get();
    return state.isAuthenticated && !state.isLoggingOut;
  },
}));
