// =====================================================
// Network Status Hook
// =====================================================
// Tracks network connectivity state.
// Uses socket connection state as a proxy for network availability.
// Can be extended later with expo-network or @react-native-community/netinfo.

import { useState, useEffect, useCallback } from 'react';
import SocketService from '../services/socket.service';
import type { ConnectionState } from '../types/socket.types';

// =====================================================
// Types
// =====================================================

export interface NetworkStatus {
  /** Whether the device appears to be connected to the network */
  isConnected: boolean;
  /** Whether internet is reachable (may be null if unknown) */
  isInternetReachable: boolean | null;
  /** Current connection state from socket service */
  socketState: ConnectionState;
}

// =====================================================
// Hooks
// =====================================================

/**
 * Hook to monitor network connectivity.
 * Uses socket connection state as a proxy for network availability.
 *
 * @returns Current network status
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true, // Optimistic default
    isInternetReachable: null,
    socketState: 'disconnected',
  });

  useEffect(() => {
    const socket = SocketService.getInstance();

    // Observe socket connection state changes
    const unsubscribe = socket.observeConnectionState((connectionState: ConnectionState) => {
      const isConnected = connectionState === 'connected' || connectionState === 'reconnecting';
      const isInternetReachable = connectionState === 'connected' ? true :
        connectionState === 'error' ? false : null;

      setStatus({
        isConnected,
        isInternetReachable,
        socketState: connectionState,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return status;
}

/**
 * Simple hook that returns whether the device is online.
 * Uses socket connection as a proxy.
 *
 * @returns true if connected, false otherwise
 */
export function useIsOnline(): boolean {
  const { isConnected } = useNetworkStatus();
  return isConnected;
}

/**
 * Hook that tracks offline → online transitions.
 * Useful for triggering revalidation when coming back online.
 *
 * @param onReconnect - Callback fired when transitioning from offline to online
 */
export function useOnReconnect(onReconnect: () => void): void {
  const { isConnected } = useNetworkStatus();
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setWasOffline(true);
    } else if (wasOffline && isConnected) {
      // Just came back online
      setWasOffline(false);
      onReconnect();
    }
  }, [isConnected, wasOffline, onReconnect]);
}

export default useNetworkStatus;
