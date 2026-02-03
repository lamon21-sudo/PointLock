// =====================================================
// API Slip Response Types
// =====================================================
// Types for slip data from the backend API.
// Distinct from DraftPick types used in slip builder.

import type { SlipStatus } from '@pick-rivals/shared-types';

// =====================================================
// Pick Result Status
// =====================================================

/**
 * Status for settled picks
 */
export type PickResultStatus = 'PENDING' | 'CORRECT' | 'INCORRECT' | 'VOID';

// =====================================================
// Filter Configuration
// =====================================================

/**
 * UI filter types for slip list
 */
export type SlipFilterType = 'draft' | 'active' | 'completed';

/**
 * Filter configuration with labels and API status mappings
 */
export interface SlipFilterConfig {
  label: string;
  apiStatuses: SlipStatus[];
  emptyMessage: string;
  emptyIcon: string;
}

/**
 * Filter configuration for each filter type
 */
export const SLIP_FILTER_CONFIG: Record<SlipFilterType, SlipFilterConfig> = {
  draft: {
    label: 'Draft',
    apiStatuses: ['DRAFT'],
    emptyMessage: 'No draft slips. Start building your picks!',
    emptyIcon: '📝',
  },
  active: {
    label: 'Active',
    apiStatuses: ['PENDING', 'ACTIVE'],
    emptyMessage: 'No active slips. Submit a slip to track it here.',
    emptyIcon: '⏳',
  },
  completed: {
    label: 'Completed',
    apiStatuses: ['WON', 'LOST', 'VOID'],
    emptyMessage: 'No completed slips yet. Your history will appear here.',
    emptyIcon: '📊',
  },
};

// =====================================================
// Pagination
// =====================================================

/**
 * Pagination metadata from API response
 */
export interface SlipPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Check if a slip status indicates the slip is settled
 */
export function isSlipSettled(status: SlipStatus | string): boolean {
  const upperStatus = status.toUpperCase();
  return ['WON', 'LOST', 'PUSH', 'CANCELLED'].includes(upperStatus);
}

/**
 * Check if a slip status indicates the slip is active/in-progress
 */
export function isSlipActive(status: SlipStatus | string): boolean {
  const upperStatus = status.toUpperCase();
  return ['PENDING', 'ACTIVE'].includes(upperStatus);
}

/**
 * Get display color for slip status
 */
export function getSlipStatusColor(status: SlipStatus | string): string {
  const upperStatus = status.toUpperCase();
  switch (upperStatus) {
    case 'DRAFT':
      return '#6b7280'; // Gray
    case 'PENDING':
      return '#3b82f6'; // Blue
    case 'ACTIVE':
      return '#f59e0b'; // Amber
    case 'WON':
      return '#22c55e'; // Green
    case 'LOST':
      return '#ef4444'; // Red
    case 'PUSH':
      return '#f97316'; // Orange
    case 'CANCELLED':
      return '#6b7280'; // Gray
    default:
      return '#6b7280';
  }
}

/**
 * Get display color for pick result status
 */
export function getPickResultColor(status: PickResultStatus | string): string {
  const upperStatus = status.toUpperCase();
  switch (upperStatus) {
    case 'CORRECT':
      return '#22c55e'; // Green
    case 'INCORRECT':
      return '#ef4444'; // Red
    case 'VOID':
      return '#6b7280'; // Gray
    case 'PENDING':
    default:
      return '#3b82f6'; // Blue
  }
}

/**
 * Format a date string for display
 */
export function formatSlipDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
