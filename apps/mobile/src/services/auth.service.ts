import { api } from './api';
import { useAuthStore } from '../stores/auth.store';
import { useWalletStore } from '../stores/wallet.store';
import type { LoginFormData, RegisterFormData } from '../schemas/auth.schemas';

// Response types matching backend AuthResponse
interface WalletData {
  totalBalance: number;
  paidBalance: number;
  bonusBalance: number;
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
  };
  wallet: WalletData;
}

// Backend returns ApiResponse envelope: { success, data, meta }
interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

interface CheckUsernameData {
  available: boolean;
}

export class AuthService {
  /**
   * Login with email and password
   */
  static async login(credentials: LoginFormData): Promise<AuthResponse> {
    try {
      const response = await api.post<ApiResponseEnvelope<AuthResponse>>('/auth/login', credentials);

      // Backend returns: { success: true, data: { user, tokens, wallet }, meta }
      const authData = response.data.data;

      // Store tokens and user in auth store - ATOMIC operation
      // Both must complete for consistent state
      const { user, tokens, wallet } = authData;
      await useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
      await useAuthStore.getState().setUser(user); // AWAIT to prevent state desync

      // Initialize wallet store with auth response data
      // This provides instant balance display without extra API call
      useWalletStore.getState().initializeFromAuth(wallet);

      return authData;
    } catch (error: any) {
      // Extract meaningful error message from API envelope
      const apiError = error.response?.data?.error;
      const message = apiError?.message || error.response?.data?.message || 'Login failed. Please try again.';
      throw new Error(message);
    }
  }

  /**
   * Register a new user
   */
  static async register(data: Omit<RegisterFormData, 'acceptTerms'>): Promise<AuthResponse> {
    try {
      const { confirmPassword, ...registrationData } = data;

      // Debug: Log what we're sending
      console.log('📤 Sending registration data:', JSON.stringify(registrationData, null, 2));

      const response = await api.post<ApiResponseEnvelope<AuthResponse>>('/auth/register', registrationData);

      // Debug: Log the response
      console.log('📥 Registration response:', JSON.stringify(response.data, null, 2));

      // Backend returns: { success: true, data: { user, tokens, wallet }, meta }
      const authData = response.data.data;

      // Store tokens and user in auth store - ATOMIC operation
      // Both must complete for consistent state
      const { user, tokens, wallet } = authData;
      await useAuthStore.getState().setTokens(tokens.accessToken, tokens.refreshToken);
      await useAuthStore.getState().setUser(user); // AWAIT to prevent state desync

      // Initialize wallet store with auth response data
      // New users start with zero balance
      useWalletStore.getState().initializeFromAuth(wallet);

      return authData;
    } catch (error: any) {
      // Debug: Log the full error
      console.error('❌ Registration error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      // Extract error details from API envelope
      // Backend returns: { success: false, error: { code, message }, meta }
      const apiError = error.response?.data?.error;
      const status = error.response?.status;
      const code = apiError?.code;
      const message = apiError?.message || error.response?.data?.message || 'Registration failed. Please try again.';

      // Create an error with additional properties for specific handling
      const registrationError = new Error(message) as Error & { status?: number; code?: string };
      registrationError.status = status;
      registrationError.code = code;
      throw registrationError;
    }
  }

  /**
   * Check if username is available
   * Returns: { available: boolean, error?: string }
   * - If API call succeeds: returns { available: true/false }
   * - If API call fails (network error): returns { available: null, error: message }
   */
  static async checkUsername(username: string): Promise<{ available: boolean | null; error?: string }> {
    try {
      const response = await api.get<ApiResponseEnvelope<CheckUsernameData>>(
        `/auth/check-username`,
        { params: { username } }
      );

      // Debug: Log the full response to see the structure
      console.log('📡 Username check response:', JSON.stringify(response.data, null, 2));

      // Backend returns: { success: true, data: { available: boolean }, meta: {...} }
      // So we need response.data.data.available (axios.data -> api.data -> available)
      const available = response.data.data.available;

      console.log('✅ Parsed available:', available);

      return { available };
    } catch (error: any) {
      // Don't swallow the error - return it so the UI can display it
      const errorMessage = error.code === 'ERR_NETWORK'
        ? 'Cannot connect to server. Check your network connection.'
        : error.response?.data?.error?.message || error.message || 'Failed to check username';

      console.error('❌ Username check failed:', errorMessage);
      return { available: null, error: errorMessage };
    }
  }

  /**
   * Logout current user
   */
  static async logout(): Promise<void> {
    try {
      const refreshToken = useAuthStore.getState().refreshToken;

      if (refreshToken) {
        // Send logout request to invalidate refresh token
        await api.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with local logout even if API call fails
    } finally {
      // Always clear local auth state
      await useAuthStore.getState().logout();

      // Reset wallet store to clear balance data
      useWalletStore.getState().reset();
    }
  }

}
