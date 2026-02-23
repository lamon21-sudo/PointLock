// =====================================================
// Betting Terms Glossary
// =====================================================
// Used by BettingTooltip to show contextual definitions
// to new users without leaving the screen.
//
// Each term has:
//   short — one-sentence explanation for the tooltip header
//   long  — expanded explanation shown via "Learn More"

export const BETTING_TERMS: Record<
  string,
  { title: string; short: string; long: string }
> = {
  spread: {
    title: 'Point Spread',
    short:
      'A handicap applied to the favored team. Pick whether a team wins by more or fewer points than the spread.',
    long:
      'The point spread is a margin of victory set by oddsmakers. The favorite must win by more than the spread (-7.5 means they need to win by 8+). The underdog can lose by fewer points than the spread and still "cover." Spread bets typically have -110 odds on both sides.',
  },
  moneyline: {
    title: 'Moneyline',
    short:
      'A straight-up bet on which team wins the game. No point spread involved.',
    long:
      'Moneyline bets are the simplest form of wagering — just pick the winner. Negative odds (-150) show the favorite and how much you risk to win 100. Positive odds (+130) show the underdog and how much you win on a 100 wager.',
  },
  total: {
    title: 'Over/Under (Total)',
    short:
      'Bet on whether the combined score of both teams will be over or under a set number.',
    long:
      'The total (also called over/under) is a number set by oddsmakers for the combined final score. You bet whether the actual total will be higher (over) or lower (under). For example, if the total is 224.5 and the final score is 112-115 (227), the over wins.',
  },
  parlay: {
    title: 'Parlay (Multi-Pick Slip)',
    short:
      'Combining multiple picks into one slip. All picks must hit for the slip to win, but the payout is bigger.',
    long:
      'A parlay combines two or more picks into a single wager. Every pick must be correct for the parlay to win. While riskier, parlays offer higher payouts because the odds multiply together. In Pick Rivals, your slip is essentially a parlay of all your picks.',
  },
};

export type BettingTerm = keyof typeof BETTING_TERMS;
