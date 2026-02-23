// =====================================================
// Demo Slip — Hardcoded Event Data
// =====================================================
// Three realistic SportsEvents used exclusively in the
// Practice Mode demo flow. These never hit the real API
// so they have stable, predictable odds for a controlled
// tutorial experience.
//
// Scheduled roughly 2 days from the epoch so any date
// comparison always shows them as "upcoming".

import type { SportsEvent } from '@pick-rivals/shared-types';

// A date far enough in the future that these events are
// always "scheduled" regardless of when the app runs.
const DEMO_DATE_NBA = new Date('2027-03-15T20:00:00.000Z');
const DEMO_DATE_NFL = new Date('2027-03-16T17:30:00.000Z');
const DEMO_DATE_MLB = new Date('2027-03-17T18:10:00.000Z');

export const DEMO_EVENTS: SportsEvent[] = [
  // ---- NBA: Lakers vs Celtics ----
  {
    id: 'demo-event-nba-001',
    externalId: 'demo-nba-lakers-celtics',
    sport: 'NBA',
    league: 'NBA',
    homeTeamId: 'demo-team-celtics',
    homeTeamName: 'Boston Celtics',
    homeTeamAbbr: 'BOS',
    awayTeamId: 'demo-team-lakers',
    awayTeamName: 'Los Angeles Lakers',
    awayTeamAbbr: 'LAL',
    scheduledAt: DEMO_DATE_NBA,
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -165,
        away: +140,
      },
      spread: {
        home: {
          line: -4.5,
          odds: -110,
        },
        away: {
          line: +4.5,
          odds: -110,
        },
      },
      total: {
        line: 224.5,
        over: -110,
        under: -110,
      },
    },
    oddsUpdatedAt: DEMO_DATE_NBA,
    createdAt: DEMO_DATE_NBA,
    updatedAt: DEMO_DATE_NBA,
  },

  // ---- NFL: Chiefs vs Eagles ----
  {
    id: 'demo-event-nfl-001',
    externalId: 'demo-nfl-chiefs-eagles',
    sport: 'NFL',
    league: 'NFL',
    homeTeamId: 'demo-team-chiefs',
    homeTeamName: 'Kansas City Chiefs',
    homeTeamAbbr: 'KC',
    awayTeamId: 'demo-team-eagles',
    awayTeamName: 'Philadelphia Eagles',
    awayTeamAbbr: 'PHI',
    scheduledAt: DEMO_DATE_NFL,
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -120,
        away: +100,
      },
      spread: {
        home: {
          line: -2.5,
          odds: -115,
        },
        away: {
          line: +2.5,
          odds: -105,
        },
      },
      total: {
        line: 48.5,
        over: -110,
        under: -110,
      },
    },
    oddsUpdatedAt: DEMO_DATE_NFL,
    createdAt: DEMO_DATE_NFL,
    updatedAt: DEMO_DATE_NFL,
  },

  // ---- MLB: Yankees vs Dodgers ----
  {
    id: 'demo-event-mlb-001',
    externalId: 'demo-mlb-yankees-dodgers',
    sport: 'MLB',
    league: 'MLB',
    homeTeamId: 'demo-team-dodgers',
    homeTeamName: 'Los Angeles Dodgers',
    homeTeamAbbr: 'LAD',
    awayTeamId: 'demo-team-yankees',
    awayTeamName: 'New York Yankees',
    awayTeamAbbr: 'NYY',
    scheduledAt: DEMO_DATE_MLB,
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -145,
        away: +125,
      },
      spread: {
        home: {
          line: -1.5,
          odds: +115,
        },
        away: {
          line: +1.5,
          odds: -135,
        },
      },
      total: {
        line: 8.5,
        over: -115,
        under: -105,
      },
    },
    oddsUpdatedAt: DEMO_DATE_MLB,
    createdAt: DEMO_DATE_MLB,
    updatedAt: DEMO_DATE_MLB,
  },
];

export const DEMO_MIN_PICKS = 2;
