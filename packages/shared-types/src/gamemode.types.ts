// =====================================================
// Game Mode Types
// =====================================================

export enum GameMode {
  INVITE_FRIEND = 'invite_friend',   // Mode A - link/code
  PLAY_FRIEND = 'play_friend',       // Mode B - direct challenge
  QUICK_MATCH = 'quick_match',       // Mode C - auto-queue
  RANDOM_MATCH = 'random_match',     // Mode D - manual filters
}
