// =====================================================
// ToastContainer Component
// =====================================================
// Renders all active toasts at the root level.
// Positioned absolutely at the top of the screen.
//
// Usage: Place inside ToastProvider, renders automatically.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useToast } from '../../contexts/ToastContext';
import { Toast } from './Toast';

// =====================================================
// Component
// =====================================================

export function ToastContainer(): React.ReactElement | null {
  const { toasts, hideToast } = useToast();

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          config={toast}
          onDismiss={hideToast}
          index={index}
        />
      ))}
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    // Allow touches to pass through to content below
    pointerEvents: 'box-none',
  },
});

export default ToastContainer;
