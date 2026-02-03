// =====================================================
// Socket Service
// =====================================================
// Singleton WebSocket service for real-time match updates.
// Lives OUTSIDE React render cycle to prevent multiple connections.
//
// Features:
// - Auth-aware connection with JWT
// - Exponential backoff reconnection
// - Room management for match subscriptions
// - Event listener registry with leak detection
// - Auto-disconnect on logout

import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore, waitForAuthInitialization } from '../stores/auth.store';
import { TokenRefreshService } from './token-refresh.service';
import type {
  ConnectionState,
  ServerToClientEvent,
  EventCallback,
  JoinMatchResponse,
  LeaveMatchResponse,
} from '../types/socket.types';


// =====================================================
// Configuration
// =====================================================

const RECONNECTION_CONFIG = {
  maxAttempts: 10,
  baseDelay: 1000,    // Start at 1 second
  maxDelay: 30000,    // Cap at 30 seconds
};

// Token refresh configuration
const TOKEN_REFRESH_CONFIG = {
  maxRetries: 1,      // Only retry once after refresh
};

const JOIN_TIMEOUT_MS = 5000;
const LEAVE_CLEANUP_TIMEOUT_MS = 10000;

// =====================================================
// URL Helper
// =====================================================

function getSocketUrl(): string {
  // Check if explicitly set in Expo config
  if (Constants.expoConfig?.extra?.apiUrl) {
    // Remove /api/v1 and keep base URL for socket
    return Constants.expoConfig.extra.apiUrl.replace(/\/api\/v1$/, '');
  }

  if (__DEV__) {
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:3000';
    }
    return 'http://localhost:3000';
  }

  return 'https://pointlock-production.up.railway.app';
}

// =====================================================
// Socket Service Singleton
// =====================================================

class SocketService {
  // Singleton instance
  private static instance: SocketService | null = null;

  // Socket.IO client
  private socket: Socket | null = null;

  // Connection state
  private connectionState: ConnectionState = 'disconnected';
  private connectionGeneration: number = 0;
  private reconnectionAttempt: number = 0;
  private reconnectionTimer: ReturnType<typeof setTimeout> | null = null;

  // Event listeners with unique IDs
  private listeners: Map<string, { event: ServerToClientEvent; callback: EventCallback }> = new Map();
  private listenerCounter: number = 0;

  // Connection state observers
  private stateObservers: Set<(state: ConnectionState) => void> = new Set();

  // Room management
  private activeRooms: Set<string> = new Set();
  private roomCleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Unsubscribe from auth store
  private authUnsubscribe: (() => void) | null = null;

  // Token refresh state - prevents infinite refresh loops
  private isRefreshingToken: boolean = false;
  private tokenRefreshRetryCount: number = 0;

  // =====================================================
  // Private Constructor (Singleton)
  // =====================================================

  private constructor() {
    // Subscribe to auth state changes for auto-disconnect on logout
    this.authUnsubscribe = useAuthStore.subscribe((state, prevState) => {
      // User logged out
      if (prevState.isAuthenticated && !state.isAuthenticated) {
        console.log('[Socket] Auth state changed: logged out - disconnecting');
        this.disconnect();
      }
    });
  }

  // =====================================================
  // Public API
  // =====================================================

  /**
   * Get the singleton instance.
   */
  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * Get current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get list of currently joined match IDs.
   */
  getJoinedMatches(): string[] {
    return Array.from(this.activeRooms);
  }

  // =====================================================
  // Connection Management
  // =====================================================

  /**
   * Connect to the socket server.
   * Waits for auth initialization and uses JWT token.
   */
  async connect(): Promise<void> {
    // Already connected or connecting
    if (this.socket?.connected || this.connectionState === 'connecting') {
      return;
    }

    this.setConnectionState('connecting');

    try {
      // Wait for auth store to load tokens from SecureStore
      await waitForAuthInitialization();

      const authStore = useAuthStore.getState();

      // Must be authenticated to connect
      if (!authStore.isCurrentlyAuthenticated()) {
        console.log('[Socket] Not authenticated - skipping connection');
        this.setConnectionState('disconnected');
        return;
      }

      const token = authStore.accessToken;
      if (!token) {
        console.log('[Socket] No access token - skipping connection');
        this.setConnectionState('disconnected');
        return;
      }

      const socketUrl = getSocketUrl();
      console.log('[Socket] Connecting to:', socketUrl);

      // Create socket connection
      this.socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: false, // We handle reconnection manually
        timeout: 10000,
      });

      // Setup event handlers
      this.setupEventHandlers();
    } catch (error) {
      console.error('[Socket] Connection error:', error);
      this.setConnectionState('error');
      this.attemptReconnection();
    }
  }

  /**
   * Disconnect from the socket server.
   */
  disconnect(): void {
    console.log('[Socket] Disconnecting...');

    // Clear reconnection timer
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }

    // Clear room cleanup timers
    for (const timer of this.roomCleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.roomCleanupTimers.clear();

    // Clear rooms
    this.activeRooms.clear();

    // Disconnect socket
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.reconnectionAttempt = 0;
    this.setConnectionState('disconnected');
  }

  // =====================================================
  // Room Management
  // =====================================================

  /**
   * Join a match room.
   * @param matchId - The match ID to join
   * @param signal - Optional AbortSignal for cancellation
   */
  async joinMatch(matchId: string, signal?: AbortSignal): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    // Track the connection generation to detect reconnects
    const currentGen = this.connectionGeneration;

    return new Promise((resolve, reject) => {
      // Handle abort
      if (signal?.aborted) {
        return reject(new Error('Join aborted'));
      }

      const abortHandler = () => reject(new Error('Join aborted'));
      signal?.addEventListener('abort', abortHandler);

      // Timeout safety net
      const timeout = setTimeout(() => {
        signal?.removeEventListener('abort', abortHandler);
        reject(new Error('Join timeout'));
      }, JOIN_TIMEOUT_MS);

      this.socket!.emit('join:match', { matchId }, (response: JoinMatchResponse) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortHandler);

        // Check if connection cycled during join
        if (currentGen !== this.connectionGeneration) {
          return reject(new Error('Connection cycled during join'));
        }

        if (response.success) {
          this.activeRooms.add(matchId);
          console.log('[Socket] Joined match room:', matchId);
          resolve();
        } else {
          console.error('[Socket] Failed to join match:', response.error);
          reject(new Error(response.error || 'Failed to join match'));
        }
      });
    });
  }

  /**
   * Leave a match room.
   * @param matchId - The match ID to leave
   */
  leaveMatch(matchId: string): void {
    if (!this.socket?.connected) {
      // Not connected - just clean up local state
      this.activeRooms.delete(matchId);
      return;
    }

    // Clear any existing cleanup timer for this room
    const existingTimer = this.roomCleanupTimers.get(matchId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.socket.emit('leave:match', { matchId }, (response: LeaveMatchResponse) => {
      if (response.success) {
        this.activeRooms.delete(matchId);
        this.roomCleanupTimers.delete(matchId);
        console.log('[Socket] Left match room:', matchId);
      } else {
        console.error('[Socket] Failed to leave match:', response.error);
      }
    });

    // Safety net: Force remove after timeout even if callback fails
    const cleanupTimer = setTimeout(() => {
      this.activeRooms.delete(matchId);
      this.roomCleanupTimers.delete(matchId);
    }, LEAVE_CLEANUP_TIMEOUT_MS);

    this.roomCleanupTimers.set(matchId, cleanupTimer);
  }

  // =====================================================
  // Event Subscription
  // =====================================================

  /**
   * Subscribe to a socket event.
   * @param event - The event name
   * @param callback - The callback function
   * @returns Listener ID for unsubscribing
   */
  subscribe<T = unknown>(event: ServerToClientEvent, callback: EventCallback<T>): string {
    const listenerId = `listener_${++this.listenerCounter}_${Date.now()}`;

    this.listeners.set(listenerId, { event, callback: callback as EventCallback });

    // Attach to socket if connected
    if (this.socket) {
      this.socket.on(event, callback as EventCallback);
    }

    // Dev mode leak detection
    if (__DEV__) {
      const eventListenerCount = Array.from(this.listeners.values())
        .filter(l => l.event === event).length;

      if (eventListenerCount > 5) {
        console.warn(
          `[Socket] LEAK WARNING: ${eventListenerCount} listeners for "${event}"! ` +
          'Check that useEffect cleanup is working properly.'
        );
      }
    }

    return listenerId;
  }

  /**
   * Unsubscribe from a socket event.
   * @param listenerId - The listener ID returned from subscribe()
   */
  unsubscribe(listenerId: string): void {
    const listener = this.listeners.get(listenerId);
    if (!listener) {
      return;
    }

    // Remove from socket
    if (this.socket) {
      this.socket.off(listener.event, listener.callback);
    }

    // Remove from registry
    this.listeners.delete(listenerId);
  }

  // =====================================================
  // Connection State Observation
  // =====================================================

  /**
   * Subscribe to connection state changes.
   * @param observer - Callback for state changes
   * @returns Unsubscribe function
   */
  observeConnectionState(observer: (state: ConnectionState) => void): () => void {
    this.stateObservers.add(observer);

    // Immediately call with current state
    observer(this.connectionState);

    return () => {
      this.stateObservers.delete(observer);
    };
  }

  // =====================================================
  // Private Methods
  // =====================================================

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Handle successful connection
    this.socket.on('connect', () => {
      console.log('[Socket] Connected! Socket ID:', this.socket?.id);
      this.connectionGeneration++;
      this.reconnectionAttempt = 0;
      this.setConnectionState('connected');

      // Re-join active rooms after reconnect
      this.rejoinActiveRooms();

      // Reattach all event listeners
      for (const { event, callback } of this.listeners.values()) {
        this.socket?.on(event, callback);
      }
    });

    // Handle disconnection
    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected. Reason:', reason);

      // Socket.IO disconnect reasons:
      // - "io server disconnect": Server forcibly disconnected
      // - "io client disconnect": Client called disconnect()
      // - "ping timeout": Server didn't respond to ping
      // - "transport close": Connection lost
      // - "transport error": Connection error

      // Don't reconnect if we intentionally disconnected
      if (reason === 'io client disconnect') {
        this.setConnectionState('disconnected');
        return;
      }

      // Auth error - don't reconnect
      if (reason === 'io server disconnect') {
        console.log('[Socket] Server disconnected us - likely auth error');
        this.setConnectionState('error');
        return;
      }

      // Connection lost - attempt reconnection
      this.setConnectionState('reconnecting');
      this.attemptReconnection();
    });

    // Handle connection error
    this.socket.on('connect_error', async (error) => {
      console.error('[Socket] Connection error:', error.message);

      // Check if this is a token expiration error
      if (error.message === 'TOKEN_EXPIRED' || error.message === 'jwt expired') {
        await this.handleTokenExpired();
        return;
      }

      this.setConnectionState('error');
      this.attemptReconnection();
    });

    // Handle generic errors from server
    this.socket.on('error', (payload: { message: string; code: string }) => {
      console.error('[Socket] Server error:', payload.code, payload.message);
    });
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;

    this.connectionState = state;
    console.log('[Socket] State changed:', state);

    // Notify all observers
    for (const observer of this.stateObservers) {
      try {
        observer(state);
      } catch (error) {
        console.error('[Socket] Error in state observer:', error);
      }
    }
  }

  /**
   * Handle TOKEN_EXPIRED error by refreshing the token and reconnecting.
   * Uses centralized TokenRefreshService to prevent race conditions with HTTP interceptor.
   * Includes fail-safe to prevent infinite refresh loops.
   */
  private async handleTokenExpired(): Promise<void> {
    // Check if refresh is already in progress globally (HTTP or Socket)
    if (TokenRefreshService.isRefreshing()) {
      console.log('[Socket] Token refresh already in progress globally, waiting...');
      try {
        // Join the existing refresh attempt
        await TokenRefreshService.refresh();
        console.log('[Socket] Global refresh completed, reconnecting...');

        // Disconnect and reconnect with new token
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }

        this.setConnectionState('reconnecting');
        await this.connect();
        return;
      } catch (error: any) {
        console.error('[Socket] Global refresh failed:', error?.message || error);
        this.setConnectionState('error');
        return;
      }
    }

    // Prevent infinite refresh loops
    if (this.isRefreshingToken) {
      console.log('[Socket] Socket-specific refresh already in progress, skipping...');
      return;
    }

    // Check retry count to prevent infinite loops
    if (this.tokenRefreshRetryCount >= TOKEN_REFRESH_CONFIG.maxRetries) {
      console.warn('[Socket] Max token refresh retries reached. Giving up.');
      this.tokenRefreshRetryCount = 0;
      this.setConnectionState('error');
      return;
    }

    this.isRefreshingToken = true;
    this.tokenRefreshRetryCount++;

    console.log(`[Socket] Token expired. Attempting refresh (attempt ${this.tokenRefreshRetryCount}/${TOKEN_REFRESH_CONFIG.maxRetries})...`);

    try {
      // Use centralized token refresh service
      // This ensures only ONE refresh happens across the entire app
      const newAccessToken = await TokenRefreshService.refresh();

      console.log('[Socket] ✅ Token refreshed successfully. Reconnecting with new token...');

      // Disconnect the current socket
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
        this.socket = null;
      }

      // Reset retry count on successful refresh
      this.tokenRefreshRetryCount = 0;

      // Reconnect with the new token
      // The new token is now in the auth store, connect() will use it
      this.setConnectionState('reconnecting');
      await this.connect();
    } catch (error: any) {
      console.error('[Socket] ❌ Token refresh failed:', error?.message || error);
      this.setConnectionState('error');
      // TokenRefreshService already handles logout on failure
    } finally {
      this.isRefreshingToken = false;
    }
  }

  private attemptReconnection(): void {
    // Check if we should reconnect
    if (this.reconnectionAttempt >= RECONNECTION_CONFIG.maxAttempts) {
      console.log('[Socket] Max reconnection attempts reached');
      this.setConnectionState('error');
      return;
    }

    // Check if still authenticated
    const authStore = useAuthStore.getState();
    if (!authStore.isCurrentlyAuthenticated()) {
      console.log('[Socket] Not authenticated - skipping reconnection');
      this.setConnectionState('disconnected');
      return;
    }

    // Calculate backoff delay
    const delay = Math.min(
      RECONNECTION_CONFIG.baseDelay * Math.pow(2, this.reconnectionAttempt),
      RECONNECTION_CONFIG.maxDelay
    );

    this.reconnectionAttempt++;
    console.log(`[Socket] Reconnecting in ${delay}ms (attempt ${this.reconnectionAttempt}/${RECONNECTION_CONFIG.maxAttempts})`);

    this.reconnectionTimer = setTimeout(async () => {
      this.setConnectionState('reconnecting');
      await this.connect();
    }, delay);
  }

  private async rejoinActiveRooms(): Promise<void> {
    if (this.activeRooms.size === 0) return;

    console.log('[Socket] Rejoining rooms:', Array.from(this.activeRooms));

    for (const matchId of this.activeRooms) {
      try {
        // Create a new set without this match in case rejoin fails
        const tempRooms = new Set(this.activeRooms);
        tempRooms.delete(matchId);

        // Try to rejoin
        await this.joinMatch(matchId);
      } catch (error) {
        console.error(`[Socket] Failed to rejoin room ${matchId}:`, error);
        // Remove from active rooms if rejoin fails
        this.activeRooms.delete(matchId);
      }
    }
  }

  // =====================================================
  // Cleanup (for testing/hot reload)
  // =====================================================

  /**
   * Destroy the singleton instance.
   * Used for testing and hot reload cleanup.
   */
  static destroy(): void {
    if (SocketService.instance) {
      SocketService.instance.disconnect();
      if (SocketService.instance.authUnsubscribe) {
        SocketService.instance.authUnsubscribe();
      }
      SocketService.instance = null;
    }
  }
}

export default SocketService;
