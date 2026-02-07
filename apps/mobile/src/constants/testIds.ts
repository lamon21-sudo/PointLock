// =====================================================
// Centralized testID Registry for E2E Testing
// =====================================================
// Naming Convention: {screen}_{component}_{element}
// Dynamic IDs: {screen}_{component}_{index}_{element}
//
// Usage:
//   import { TEST_IDS } from '@/constants/testIds';
//   <Button testID={TEST_IDS.auth.login.submitButton} />
//   <OddsButton testID={TEST_IDS.events.spreadHome(0)} />

export const TEST_IDS = {
  // =====================================================
  // Auth Screens
  // =====================================================
  auth: {
    login: {
      screen: 'login_screen',
      emailInput: 'login_email_input',
      passwordInput: 'login_password_input',
      submitButton: 'login_submit_button',
      errorMessage: 'login_error_message',
      registerLink: 'login_register_link',
      forgotPasswordLink: 'login_forgot_password_link',
    },
    register: {
      screen: 'register_screen',
      emailInput: 'register_email_input',
      usernameInput: 'register_username_input',
      passwordInput: 'register_password_input',
      confirmPasswordInput: 'register_confirm_password_input',
      termsCheckbox: 'register_terms_checkbox',
      submitButton: 'register_submit_button',
      errorMessage: 'register_error_message',
      loginLink: 'register_login_link',
      usernameStatus: 'register_username_status',
    },
  },

  // =====================================================
  // Tab Navigation
  // =====================================================
  tabs: {
    bar: 'tab_bar',
    home: 'tab_home',
    events: 'tab_events',
    matches: 'tab_matches',
    leaderboard: 'tab_leaderboard',
    wallet: 'tab_wallet',
    profile: 'tab_profile',
  },

  // =====================================================
  // Home Screen
  // =====================================================
  home: {
    screen: 'home_screen',
    balanceAmount: 'home_balance_amount',
    cashOutButton: 'home_cash_out_button',
    addCoinsButton: 'home_add_coins_button',
    quickMatchButton: 'home_quick_match_button',
    playFriendCard: 'home_play_friend_card',
    inviteFriendCard: 'home_invite_friend_card',
    randomMatchCard: 'home_random_match_card',
    tierProgress: 'home_tier_progress',
    liveMatchesCarousel: 'home_live_matches_carousel',
    liveMatchCard: (index: number) => `home_live_match_${index}`,
  },

  // =====================================================
  // Events Screen
  // =====================================================
  events: {
    screen: 'events_screen',
    filterAll: 'events_filter_all',
    filterNFL: 'events_filter_nfl',
    filterNBA: 'events_filter_nba',
    filterMLB: 'events_filter_mlb',
    filterNHL: 'events_filter_nhl',
    eventList: 'events_list',
    eventCard: (index: number) => `events_card_${index}`,
    refreshControl: 'events_refresh',
    emptyState: 'events_empty_state',
    errorState: 'events_error_state',
    loadingState: 'events_loading_state',
    // Betting buttons within event card (by event index)
    spreadHome: (eventIndex: number) => `events_card_${eventIndex}_spread_home`,
    spreadAway: (eventIndex: number) => `events_card_${eventIndex}_spread_away`,
    totalOver: (eventIndex: number) => `events_card_${eventIndex}_total_over`,
    totalUnder: (eventIndex: number) => `events_card_${eventIndex}_total_under`,
    moneylineHome: (eventIndex: number) => `events_card_${eventIndex}_ml_home`,
    moneylineAway: (eventIndex: number) => `events_card_${eventIndex}_ml_away`,
    viewPropsButton: (eventIndex: number) => `events_card_${eventIndex}_view_props`,
  },

  // =====================================================
  // Slip FAB and Tray
  // =====================================================
  slip: {
    fab: 'slip_fab',
    fabBadge: 'slip_fab_badge',
    fabLabel: 'slip_fab_label',
    fabPoints: 'slip_fab_points',
  },

  // =====================================================
  // Slip Review Screen
  // =====================================================
  slipReview: {
    screen: 'slip_review_screen',
    picksList: 'slip_review_picks_list',
    pickItem: (index: number) => `slip_review_pick_${index}`,
    pickRemove: (index: number) => `slip_review_pick_${index}_remove`,
    clearAllButton: 'slip_review_clear_all',
    picksCount: 'slip_review_picks_count',
    remainingCount: 'slip_review_remaining_count',
    pointPotential: 'slip_review_point_potential',
    lockSlipButton: 'slip_review_lock_button',
    errorBanner: 'slip_review_error_banner',
    emptyState: 'slip_review_empty_state',
    successState: 'slip_review_success_state',
    slipIdDisplay: 'slip_review_slip_id',
    createChallengeButton: 'slip_review_create_challenge',
    newSlipButton: 'slip_review_new_slip',
    backButton: 'slip_review_back_button',
  },

  // =====================================================
  // Confirmation Modal
  // =====================================================
  confirmationModal: {
    modal: 'confirmation_modal',
    title: 'confirmation_modal_title',
    picksList: 'confirmation_modal_picks_list',
    confirmButton: 'confirmation_modal_confirm',
    cancelButton: 'confirmation_modal_cancel',
    errorMessage: 'confirmation_modal_error',
    loading: 'confirmation_modal_loading',
  },

  // =====================================================
  // Challenge Create Screen
  // =====================================================
  challengeCreate: {
    screen: 'challenge_create_screen',
    slipIdDisplay: 'challenge_create_slip_id',
    matchTypePublic: 'challenge_create_type_public',
    matchTypePrivate: 'challenge_create_type_private',
    stakePreset: (amount: number) => `challenge_create_stake_${amount}`,
    stakeCustomInput: 'challenge_create_stake_custom',
    stakeSlider: 'challenge_create_stake_slider',
    previewSection: 'challenge_create_preview',
    submitButton: 'challenge_create_submit',
    errorBanner: 'challenge_create_error',
    backButton: 'challenge_create_back',
    loadingState: 'challenge_create_loading',
  },

  // =====================================================
  // Challenge Join Screen
  // =====================================================
  challengeJoin: {
    screen: 'challenge_join_screen',
    matchDetailsCard: 'challenge_join_match_details',
    creatorName: 'challenge_join_creator_name',
    stakeAmount: 'challenge_join_stake_amount',
    matchType: 'challenge_join_match_type',
    yourPicksSection: 'challenge_join_your_picks',
    eventsSection: 'challenge_join_events',
    joinButton: 'challenge_join_submit',
    balanceWarning: 'challenge_join_balance_warning',
    errorBanner: 'challenge_join_error',
    loadingState: 'challenge_join_loading',
    errorState: 'challenge_join_error_state',
  },

  // =====================================================
  // Invite Share Modal
  // =====================================================
  inviteModal: {
    modal: 'invite_modal',
    inviteCode: 'invite_modal_code',
    copyButton: 'invite_modal_copy',
    shareButton: 'invite_modal_share',
    closeButton: 'invite_modal_close',
    qrCode: 'invite_modal_qr',
  },

  // =====================================================
  // Matches Screen (Slip History)
  // =====================================================
  matches: {
    screen: 'matches_screen',
    filterDraft: 'matches_filter_draft',
    filterActive: 'matches_filter_active',
    filterCompleted: 'matches_filter_completed',
    matchList: 'matches_list',
    matchCard: (index: number) => `matches_card_${index}`,
    emptyState: 'matches_empty_state',
    errorState: 'matches_error_state',
    loadingState: 'matches_loading',
    refreshControl: 'matches_refresh',
  },

  // =====================================================
  // Match Detail Screen
  // =====================================================
  matchDetail: {
    screen: 'match_detail_screen',
    versusView: 'match_detail_versus',
    momentumBar: 'match_detail_momentum',
    pickFeed: 'match_detail_pick_feed',
    connectionIndicator: 'match_detail_connection',
    opponentBadge: 'match_detail_opponent_badge',
    completionModal: 'match_detail_completion_modal',
    loadingState: 'match_detail_loading',
    errorState: 'match_detail_error',
    refreshControl: 'match_detail_refresh',
  },

  // =====================================================
  // Queue/Waiting Screen
  // =====================================================
  queue: {
    screen: 'queue_screen',
    waitingIndicator: 'queue_waiting_indicator',
    cancelButton: 'queue_cancel_button',
    statusText: 'queue_status_text',
    matchFoundModal: 'queue_match_found_modal',
  },

  // =====================================================
  // Profile Screen
  // =====================================================
  profile: {
    screen: 'profile_screen',
    avatar: 'profile_avatar',
    username: 'profile_username',
    displayName: 'profile_display_name',
    skillRating: 'profile_skill_rating',
    editButton: 'profile_edit_button',
    statsCard: 'profile_stats_card',
    walletCard: 'profile_wallet_card',
    streaksCard: 'profile_streaks_card',
    settingsMenuItem: 'profile_settings_menu',
    notificationsMenuItem: 'profile_notifications_menu',
    transactionHistoryMenuItem: 'profile_transactions_menu',
    helpMenuItem: 'profile_help_menu',
    logoutButton: 'profile_logout_button',
    signInButton: 'profile_sign_in_button',
    createAccountButton: 'profile_create_account_button',
  },

  // =====================================================
  // Wallet Screen
  // =====================================================
  wallet: {
    screen: 'wallet_screen',
    totalBalance: 'wallet_total_balance',
    paidBalance: 'wallet_paid_balance',
    bonusBalance: 'wallet_bonus_balance',
    addFundsButton: 'wallet_add_funds_button',
    withdrawButton: 'wallet_withdraw_button',
    transactionsList: 'wallet_transactions_list',
    transactionItem: (index: number) => `wallet_transaction_${index}`,
  },

  // =====================================================
  // Leaderboard Screen
  // =====================================================
  leaderboard: {
    screen: 'leaderboard_screen',
    periodSelector: 'leaderboard_period_selector',
    rankingsList: 'leaderboard_rankings_list',
    rankingItem: (index: number) => `leaderboard_rank_${index}`,
    myRank: 'leaderboard_my_rank',
    loadingState: 'leaderboard_loading',
    errorState: 'leaderboard_error',
    refreshControl: 'leaderboard_refresh',
  },

  // =====================================================
  // Common UI Components
  // =====================================================
  common: {
    loading: 'common_loading',
    loadingSpinner: 'common_loading_spinner',
    toast: 'common_toast',
    toastDismiss: 'common_toast_dismiss',
    backButton: 'common_back_button',
    modalOverlay: 'common_modal_overlay',
    errorRetryButton: 'common_error_retry',
  },
} as const;

// Type exports for TypeScript support
export type TestIdKey = keyof typeof TEST_IDS;
export type AuthTestIds = typeof TEST_IDS.auth;
export type TabTestIds = typeof TEST_IDS.tabs;
export type EventsTestIds = typeof TEST_IDS.events;
export type SlipTestIds = typeof TEST_IDS.slip;
export type SlipReviewTestIds = typeof TEST_IDS.slipReview;
