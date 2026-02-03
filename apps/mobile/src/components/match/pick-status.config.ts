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
  /** Unicode icon for status */
  icon: string;
}

// =====================================================
// Configuration
// =====================================================

export const PICK_STATUS_CONFIG: Record<PickStatus, PickStatusConfig> = {
  PENDING: {
    label: 'Pending',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.15)',
    icon: '\u23F3', // Hourglass ⏳
  },
  HIT: {
    label: 'Won',
    color: '#22c55e',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    icon: '\u2713', // Checkmark ✓
  },
  MISS: {
    label: 'Lost',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    icon: '\u2717', // X mark ✗
  },
  PUSH: {
    label: 'Push',
    color: '#eab308',
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    icon: '=',
  },
  VOID: {
    label: 'Void',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    icon: '\u2014', // Em dash —
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
