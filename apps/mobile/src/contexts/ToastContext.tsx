// =====================================================
// ToastContext
// =====================================================
// Global toast notification system with queue management.
// Provides showToast/hideToast methods via context.
//
// Features:
// - Queue system (max 3 visible, FIFO dismissal)
// - Auto-dismiss with configurable duration
// - Unique IDs for targeted dismissal
// - Pick settlement variants (hit/miss/push)

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Haptics } from '../services/haptics.service';

// =====================================================
// Types
// =====================================================

export type ToastType =
  | 'pick_hit'
  | 'pick_miss'
  | 'pick_push'
  | 'success'
  | 'error'
  | 'info'
  | 'warning';

export interface ToastConfig {
  /** Unique ID for the toast */
  id: string;
  /** Type determines styling */
  type: ToastType;
  /** Main title text */
  title: string;
  /** Optional secondary message */
  message?: string;
  /** Auto-dismiss duration in ms (default: 4000) */
  duration?: number;
}

export interface ToastContextValue {
  /** Show a toast notification, returns toast ID */
  showToast: (config: Omit<ToastConfig, 'id'>) => string;
  /** Hide a specific toast by ID */
  hideToast: (id: string) => void;
  /** Clear all toasts */
  clearAll: () => void;
  /** Current visible toasts */
  toasts: ToastConfig[];
}

// =====================================================
// Context
// =====================================================

const ToastContext = createContext<ToastContextValue | null>(null);

// =====================================================
// Constants
// =====================================================

const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION = 4000;

// =====================================================
// Provider
// =====================================================

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.ReactElement {
  const [toasts, setToasts] = useState<ToastConfig[]>([]);
  const toastIdCounter = useRef(0);
  const dismissTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Clean up timer for a toast
  const clearTimer = useCallback((id: string) => {
    const timer = dismissTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(id);
    }
  }, []);

  // Hide a specific toast
  const hideToast = useCallback((id: string) => {
    clearTimer(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, [clearTimer]);

  // Show a new toast
  const showToast = useCallback(
    (config: Omit<ToastConfig, 'id'>): string => {
      const id = `toast-${++toastIdCounter.current}-${Date.now()}`;
      const duration = config.duration ?? DEFAULT_DURATION;

      const newToast: ToastConfig = {
        ...config,
        id,
        duration,
      };

      // Settlement haptic for pick result toasts — the 5000ms throttle
      // in the haptics service prevents double-fire with MatchCompletionModal.
      if (config.type === 'pick_hit') Haptics.trigger('settlement-win');
      else if (config.type === 'pick_miss') Haptics.trigger('settlement-loss');
      else if (config.type === 'pick_push') Haptics.trigger('settlement-push');

      setToasts((prev) => {
        // If at max capacity, remove oldest toast(s)
        let updated = [...prev];
        while (updated.length >= MAX_VISIBLE_TOASTS) {
          const oldest = updated[0];
          clearTimer(oldest.id);
          updated = updated.slice(1);
        }
        return [...updated, newToast];
      });

      // Set auto-dismiss timer
      if (duration > 0) {
        const timer = setTimeout(() => {
          hideToast(id);
        }, duration);
        dismissTimers.current.set(id, timer);
      }

      return id;
    },
    [hideToast, clearTimer]
  );

  // Clear all toasts
  const clearAll = useCallback(() => {
    // Clear all timers
    dismissTimers.current.forEach((timer) => clearTimeout(timer));
    dismissTimers.current.clear();
    setToasts([]);
  }, []);

  // Cleanup all timers on unmount
  React.useEffect(() => {
    return () => {
      dismissTimers.current.forEach((timer) => clearTimeout(timer));
      dismissTimers.current.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      showToast,
      hideToast,
      clearAll,
      toasts,
    }),
    [showToast, hideToast, clearAll, toasts]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

// =====================================================
// Hook
// =====================================================

/**
 * Hook to access toast functionality.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showToast } = useToast();
 *
 *   const handleSuccess = () => {
 *     showToast({
 *       type: 'pick_hit',
 *       title: 'Pick Hit!',
 *       message: 'Lakers +3.5',
 *     });
 *   };
 *
 *   return <Button onPress={handleSuccess} title="Show Toast" />;
 * }
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}

export default ToastContext;
