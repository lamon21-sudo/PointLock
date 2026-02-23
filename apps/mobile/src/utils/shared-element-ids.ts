// =====================================================
// Shared Element ID Generators
// =====================================================
// Convention: {flow}:{element}:{entityId}
// Used for hero transition element identification.

export const SharedElementId = {
  event: {
    /** Matchup container (sport badge + team abbrs + separator) */
    matchup: (eventId: string) => `event:matchup:${eventId}`,
  },
  // Future: slip, leaderboard, etc.
} as const;
