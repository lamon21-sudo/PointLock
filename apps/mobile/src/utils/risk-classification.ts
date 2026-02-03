// =====================================================
// Risk Classification Utilities
// =====================================================
// Categorizes picks by odds into risk tiers for visual color coding.

import { LUXURY_THEME } from '../constants/theme';

export type RiskLevel = 'favorite' | 'underdog' | 'extreme';

/**
 * Classify a pick's risk level based on American odds.
 * - favorite: odds <= -110 (high probability, low payout)
 * - underdog: odds > -110 and < +200 (medium probability)
 * - extreme:  odds >= +200 (low probability, high payout)
 */
export function classifyRisk(americanOdds: number): RiskLevel {
  if (americanOdds <= -110) return 'favorite';
  if (americanOdds >= 200) return 'extreme';
  return 'underdog';
}

/**
 * Get risk color for display based on American odds.
 */
export function getRiskColor(americanOdds: number): string {
  const level = classifyRisk(americanOdds);
  return LUXURY_THEME.risk[level];
}
