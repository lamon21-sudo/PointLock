// =====================================================
// MatchStatusBadge Component
// =====================================================
// Displays match status with appropriate styling.
// LIVE status includes a pulse animation.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import type { MatchStatus } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

type DisplayStatus = 'LIVE' | 'FINAL' | 'PENDING' | 'CANCELLED' | 'DISPUTED';
type BadgeSize = 'sm' | 'md' | 'lg';

interface MatchStatusBadgeProps {
  /** Match status from API */
  status: MatchStatus;
  /** Whether any event in the match is currently live */
  hasLiveEvents?: boolean;
  /** Size variant */
  size?: BadgeSize;
}

// =====================================================
// Status Mapping
// =====================================================

interface StatusConfig {
  label: string;
  color: string;
  backgroundColor: string;
  showPulse: boolean;
}

function getStatusConfig(status: MatchStatus, hasLiveEvents: boolean): StatusConfig {
  // Active match with live events
  if (status === 'active' && hasLiveEvents) {
    return {
      label: 'LIVE',
      color: LUXURY_THEME.status.success,
      backgroundColor: 'rgba(63, 208, 143, 0.2)',
      showPulse: true,
    };
  }

  // Active but no live events (waiting for games to start)
  if (status === 'active') {
    return {
      label: 'ACTIVE',
      color: LUXURY_THEME.gold.main,
      backgroundColor: LUXURY_THEME.gold.glow,
      showPulse: false,
    };
  }

  switch (status) {
    case 'settled':
      return {
        label: 'FINAL',
        color: LUXURY_THEME.text.muted,
        backgroundColor: 'rgba(107, 114, 128, 0.2)',
        showPulse: false,
      };
    case 'pending':
      return {
        label: 'PENDING',
        color: LUXURY_THEME.gold.vibrant,
        backgroundColor: LUXURY_THEME.gold.glow,
        showPulse: false,
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        color: LUXURY_THEME.status.error,
        backgroundColor: 'rgba(255, 92, 108, 0.2)',
        showPulse: false,
      };
    case 'disputed':
      return {
        label: 'DISPUTED',
        color: LUXURY_THEME.status.warning,
        backgroundColor: 'rgba(245, 158, 11, 0.2)',
        showPulse: false,
      };
    default: {
      // Handle any unexpected status values
      const unknownStatus: string = status;
      return {
        label: unknownStatus.toUpperCase(),
        color: LUXURY_THEME.text.muted,
        backgroundColor: 'rgba(107, 114, 128, 0.2)',
        showPulse: false,
      };
    }
  }
}

// =====================================================
// Size Configuration
// =====================================================

const SIZE_CONFIG: Record<BadgeSize, { fontSize: number; paddingH: number; paddingV: number; dotSize: number }> = {
  sm: { fontSize: 10, paddingH: 8, paddingV: 4, dotSize: 6 },
  md: { fontSize: 11, paddingH: 10, paddingV: 5, dotSize: 7 },
  lg: { fontSize: 13, paddingH: 12, paddingV: 6, dotSize: 8 },
};

// =====================================================
// Component
// =====================================================

export function MatchStatusBadge({
  status,
  hasLiveEvents = false,
  size = 'md',
}: MatchStatusBadgeProps): React.ReactElement {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const config = getStatusConfig(status, hasLiveEvents);
  const sizeConfig = SIZE_CONFIG[size];

  // Pulse animation for LIVE status
  useEffect(() => {
    if (config.showPulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [config.showPulse, pulseAnim]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          paddingHorizontal: sizeConfig.paddingH,
          paddingVertical: sizeConfig.paddingV,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Match status: ${config.label}`}
    >
      {config.showPulse && (
        <Animated.View
          style={[
            styles.pulseDot,
            {
              backgroundColor: config.color,
              width: sizeConfig.dotSize,
              height: sizeConfig.dotSize,
              borderRadius: sizeConfig.dotSize / 2,
              opacity: pulseAnim,
            },
          ]}
        />
      )}
      <Text
        style={[
          styles.label,
          {
            color: config.color,
            fontSize: sizeConfig.fontSize,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 6,
  },
  pulseDot: {
    // Size set dynamically
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default MatchStatusBadge;
