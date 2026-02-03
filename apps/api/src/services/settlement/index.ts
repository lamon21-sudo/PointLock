// =====================================================
// Settlement Service Module Exports
// =====================================================

// Main service functions
export { settleMatch, checkSettlementReadiness } from './settlement.service';

// Edge case handlers (Task 8.5)
export {
  handleCancelledEvent,
  handlePostponedEvent,
  processVoidMatchRefunds,
  checkPostponedMatches,
  checkSettlementEligibility,
  validateAdminPermission,
  manualSettleMatch,
} from './settlement-edge-cases.service';

// Pure referee functions (for testing and direct use)
export { determinePickResult, determinePickResults } from './pick-result';
export { calculateSlipScore, calculateSlipScores, summarizePickResults } from './slip-scorer';
export {
  determineMatchWinner,
  calculateSettlementAmounts,
  validateMatchForSettlement,
} from './match-winner';

// Types
export type {
  PickResultInput,
  EventScores,
  PickResultOutput,
  SlipScoreResult,
  MatchWinnerResult,
  SettlementResult,
  MatchForSettlement,
  SlipForSettlement,
  PickForSettlement,
  PickWithEvent,
} from './settlement.types';

// Constants
export {
  FINAL_EVENT_STATUSES,
  VOID_EVENT_STATUSES,
  HOME_SELECTIONS,
  AWAY_SELECTIONS,
  OVER_SELECTIONS,
  UNDER_SELECTIONS,
} from './settlement.types';

// Edge case types (Task 8.5)
export type {
  CancelledGameResult,
  PostponedGameResult,
  PostponedMatchCheckResult,
  ManualSettlementParams,
  ManualSettlementResult,
  SettlementEligibility,
  VoidSettlementJobData,
  PostponedCheckJobData,
} from './settlement-edge-cases.types';

export {
  SETTLEMENT_EDGE_CASE_CONSTANTS,
  generateVoidMatchRefundKey,
  generateCancellationRefundKey,
  generateManualPayoutKey,
  generateManualRefundKey,
} from './settlement-edge-cases.types';
