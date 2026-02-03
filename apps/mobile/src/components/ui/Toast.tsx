// =====================================================
// Toast Component
// =====================================================
// Individual toast notification with slide-in animation
// and swipe-to-dismiss gesture support.
//
// Features:
// - Slide-in from top with spring animation
// - Swipe-to-dismiss via PanResponder
// - Type-based color variants
// - Icon display per type

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import type { ToastConfig, ToastType } from '../../contexts/ToastContext';

// =====================================================
// Types
// =====================================================

interface ToastProps {
  /** Toast configuration */
  config: ToastConfig;
  /** Callback when toast should be dismissed */
  onDismiss: (id: string) => void;
  /** Index in the toast stack (for positioning) */
  index: number;
}

// =====================================================
// Constants
// =====================================================

const SCREEN_WIDTH = Dimensions.get('window').width;
const TOAST_WIDTH = SCREEN_WIDTH - 32;
const SWIPE_THRESHOLD = 80;
const TOAST_HEIGHT = 72;
const TOAST_SPACING = 8;

// Type-based styling configuration (Luxury Lounge theme)
const TYPE_CONFIG: Record<
  ToastType,
  { backgroundColor: string; icon: string; iconColor: string }
> = {
  pick_hit: {
    backgroundColor: 'rgba(63, 208, 143, 0.95)', // Mint green
    icon: '\u2713', // Checkmark
    iconColor: '#070A10',
  },
  pick_miss: {
    backgroundColor: 'rgba(255, 92, 108, 0.95)', // Soft red
    icon: '\u2717', // X mark
    iconColor: '#ffffff',
  },
  pick_push: {
    backgroundColor: 'rgba(245, 158, 11, 0.95)', // Amber
    icon: '=',
    iconColor: '#070A10',
  },
  success: {
    backgroundColor: 'rgba(63, 208, 143, 0.95)', // Mint green
    icon: '\u2713',
    iconColor: '#070A10',
  },
  error: {
    backgroundColor: 'rgba(255, 92, 108, 0.95)', // Soft red
    icon: '!',
    iconColor: '#ffffff',
  },
  warning: {
    backgroundColor: 'rgba(245, 158, 11, 0.95)', // Amber
    icon: '\u26A0', // Warning sign
    iconColor: '#070A10',
  },
  info: {
    backgroundColor: 'rgba(59, 130, 246, 0.95)', // Blue
    icon: 'i',
    iconColor: '#ffffff',
  },
};

// =====================================================
// Component
// =====================================================

export function Toast({ config, onDismiss, index }: ToastProps): React.ReactElement {
  const { id, type, title, message } = config;
  const typeConfig = TYPE_CONFIG[type];

  // Animation values
  const translateY = useRef(new Animated.Value(-100)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Pan responder for swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) > SWIPE_THRESHOLD) {
          // Swipe out
          const direction = gestureState.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: direction,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onDismiss(id);
          });
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            tension: 100,
            friction: 10,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 100,
        friction: 14,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateY, opacity]);

  // Calculate position based on index
  const topPosition = 60 + index * (TOAST_HEIGHT + TOAST_SPACING);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.container,
        {
          backgroundColor: typeConfig.backgroundColor,
          top: topPosition,
          transform: [{ translateY }, { translateX }],
          opacity,
        },
      ]}
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Text style={[styles.icon, { color: typeConfig.iconColor }]}>
          {typeConfig.icon}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {message && (
          <Text style={styles.message} numberOfLines={1}>
            {message}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    width: TOAST_WIDTH,
    minHeight: TOAST_HEIGHT,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginTop: 2,
  },
});

export default Toast;
