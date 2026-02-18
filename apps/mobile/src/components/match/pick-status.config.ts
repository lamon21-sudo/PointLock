// =====================================================
// Pick Status Configuration
// =====================================================
// Color and icon configuration for each PickStatus.
// Used by LiveTrackerItem and other match components.
//
// Design Principles:
// - Color + icon for accessibility (not color alone)
// - Consistent with app color palette
// - High contrast for readability

import type { PickStatus } from '@pick-rivals/shared-types';
import type { IconName } from '../ui/AppIcon';

// =====================================================
// Types
// =====================================================

export interface PickStatusConfig {
  /** Display label */
  label: string;
  /** Primary color for text/icon */
  color: string;
  /** Background color (15% opacity) */
  backgroundColor: string;
  /** Phosphor icon name for status */
  iconName: IconName;
}

// =====================================================
// Configuration
// =====================================================

export const PICK_STATUS_CONFIG: Record<PickStatus, PickStatusConfig> = {
  PENDING: {
    label: 'Pending',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    iconName: 'Hourglass',
  },
  HIT: {
    label: 'Won',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    iconName: 'CheckCircle',
  },
  MISS: {
    label: 'Lost',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    iconName: 'XCircle',
  },
  PUSH: {
    label: 'Push',
    color: '#eab308',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    iconName: 'Equals',
  },
  VOID: {
    label: 'Void',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    iconName: 'Prohibit',
  },
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get the configuration for a pick status.
 * Returns PENDING config as fallback for unknown statuses.
 */
export function getPickStatusConfig(status: PickStatus | string): PickStatusConfig {
  return PICK_STATUS_CONFIG[status as PickStatus] || PICK_STATUS_CONFIG.PENDING;
}

/**
 * Check if a pick is resolved (not pending).
 */
export function isPickResolved(status: PickStatus | string): boolean {
  return status !== 'PENDING';
}

/**
 * Check if a pick contributes points (HIT only).
 */
export function isPickWin(status: PickStatus | string): boolean {
  return status === 'HIT';
}
