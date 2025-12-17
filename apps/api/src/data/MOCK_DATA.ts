// =====================================================
// Mock NFL Games Data for Development
// =====================================================
// This file provides realistic mock data for building the UI
// without requiring an API key from SportRadar or OddsAPI.
// =====================================================

import { SportsEvent, EventOdds, SportType } from '@pick-rivals/shared-types';

// Helper to create dates relative to now
const daysFromNow = (days: number, hours: number = 13): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, 0, 0, 0);
  return date;
};

// =====================================================
// NFL Teams
// =====================================================

export const NFL_TEAMS = {
  KC: { id: 'nfl-kc', name: 'Kansas City Chiefs', abbr: 'KC' },
  BUF: { id: 'nfl-buf', name: 'Buffalo Bills', abbr: 'BUF' },
  SF: { id: 'nfl-sf', name: 'San Francisco 49ers', abbr: 'SF' },
  PHI: { id: 'nfl-phi', name: 'Philadelphia Eagles', abbr: 'PHI' },
  DAL: { id: 'nfl-dal', name: 'Dallas Cowboys', abbr: 'DAL' },
  MIA: { id: 'nfl-mia', name: 'Miami Dolphins', abbr: 'MIA' },
  DET: { id: 'nfl-det', name: 'Detroit Lions', abbr: 'DET' },
  BAL: { id: 'nfl-bal', name: 'Baltimore Ravens', abbr: 'BAL' },
  CIN: { id: 'nfl-cin', name: 'Cincinnati Bengals', abbr: 'CIN' },
  GB: { id: 'nfl-gb', name: 'Green Bay Packers', abbr: 'GB' },
} as const;

// =====================================================
// Mock NFL Events with Odds
// =====================================================

export const MOCK_NFL_EVENTS: SportsEvent[] = [
  {
    id: 'evt-nfl-001',
    externalId: 'sr:match:nfl001',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: NFL_TEAMS.KC.id,
    homeTeamName: NFL_TEAMS.KC.name,
    homeTeamAbbr: NFL_TEAMS.KC.abbr,
    awayTeamId: NFL_TEAMS.BUF.id,
    awayTeamName: NFL_TEAMS.BUF.name,
    awayTeamAbbr: NFL_TEAMS.BUF.abbr,
    scheduledAt: daysFromNow(1, 13), // Tomorrow 1:00 PM
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
        home: { line: -2.5, odds: -110 },
        away: { line: +2.5, odds: -110 },
      },
      total: {
        line: 52.5,
        over: -110,
        under: -110,
      },
      props: [
        {
          playerId: 'nfl-player-mahomes',
          playerName: 'Patrick Mahomes',
          propType: 'passing_yards',
          line: 285.5,
          over: -115,
          under: -105,
        },
        {
          playerId: 'nfl-player-allen',
          playerName: 'Josh Allen',
          propType: 'passing_yards',
          line: 275.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nfl-player-kelce',
          playerName: 'Travis Kelce',
          propType: 'receiving_yards',
          line: 72.5,
          over: -115,
          under: -105,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nfl-002',
    externalId: 'sr:match:nfl002',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: NFL_TEAMS.SF.id,
    homeTeamName: NFL_TEAMS.SF.name,
    homeTeamAbbr: NFL_TEAMS.SF.abbr,
    awayTeamId: NFL_TEAMS.PHI.id,
    awayTeamName: NFL_TEAMS.PHI.name,
    awayTeamAbbr: NFL_TEAMS.PHI.abbr,
    scheduledAt: daysFromNow(1, 16), // Tomorrow 4:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -160,
        away: +140,
      },
      spread: {
        home: { line: -3.5, odds: -105 },
        away: { line: +3.5, odds: -115 },
      },
      total: {
        line: 48.5,
        over: -105,
        under: -115,
      },
      props: [
        {
          playerId: 'nfl-player-purdy',
          playerName: 'Brock Purdy',
          propType: 'passing_yards',
          line: 245.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nfl-player-hurts',
          playerName: 'Jalen Hurts',
          propType: 'rushing_yards',
          line: 42.5,
          over: -120,
          under: +100,
        },
        {
          playerId: 'nfl-player-cmc',
          playerName: 'Christian McCaffrey',
          propType: 'rushing_yards',
          line: 85.5,
          over: -115,
          under: -105,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nfl-003',
    externalId: 'sr:match:nfl003',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: NFL_TEAMS.DAL.id,
    homeTeamName: NFL_TEAMS.DAL.name,
    homeTeamAbbr: NFL_TEAMS.DAL.abbr,
    awayTeamId: NFL_TEAMS.MIA.id,
    awayTeamName: NFL_TEAMS.MIA.name,
    awayTeamAbbr: NFL_TEAMS.MIA.abbr,
    scheduledAt: daysFromNow(2, 13), // Day after tomorrow 1:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: +110,
        away: -130,
      },
      spread: {
        home: { line: +1.5, odds: -110 },
        away: { line: -1.5, odds: -110 },
      },
      total: {
        line: 54.5,
        over: -108,
        under: -112,
      },
      props: [
        {
          playerId: 'nfl-player-prescott',
          playerName: 'Dak Prescott',
          propType: 'passing_yards',
          line: 265.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nfl-player-tua',
          playerName: 'Tua Tagovailoa',
          propType: 'passing_yards',
          line: 295.5,
          over: -105,
          under: -115,
        },
        {
          playerId: 'nfl-player-hill',
          playerName: 'Tyreek Hill',
          propType: 'receiving_yards',
          line: 95.5,
          over: -110,
          under: -110,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nfl-004',
    externalId: 'sr:match:nfl004',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: NFL_TEAMS.DET.id,
    homeTeamName: NFL_TEAMS.DET.name,
    homeTeamAbbr: NFL_TEAMS.DET.abbr,
    awayTeamId: NFL_TEAMS.BAL.id,
    awayTeamName: NFL_TEAMS.BAL.name,
    awayTeamAbbr: NFL_TEAMS.BAL.abbr,
    scheduledAt: daysFromNow(2, 16), // Day after tomorrow 4:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: +105,
        away: -125,
      },
      spread: {
        home: { line: +1.5, odds: -105 },
        away: { line: -1.5, odds: -115 },
      },
      total: {
        line: 51.5,
        over: -110,
        under: -110,
      },
      props: [
        {
          playerId: 'nfl-player-goff',
          playerName: 'Jared Goff',
          propType: 'passing_yards',
          line: 255.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nfl-player-lamar',
          playerName: 'Lamar Jackson',
          propType: 'rushing_yards',
          line: 62.5,
          over: -115,
          under: -105,
        },
        {
          playerId: 'nfl-player-henry',
          playerName: 'Derrick Henry',
          propType: 'rushing_yards',
          line: 95.5,
          over: -110,
          under: -110,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nfl-005',
    externalId: 'sr:match:nfl005',
    sport: 'NFL' as SportType,
    league: 'NFL',
    homeTeamId: NFL_TEAMS.CIN.id,
    homeTeamName: NFL_TEAMS.CIN.name,
    homeTeamAbbr: NFL_TEAMS.CIN.abbr,
    awayTeamId: NFL_TEAMS.GB.id,
    awayTeamName: NFL_TEAMS.GB.name,
    awayTeamAbbr: NFL_TEAMS.GB.abbr,
    scheduledAt: daysFromNow(3, 20), // 3 days from now 8:00 PM (Sunday Night Football)
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -175,
        away: +155,
      },
      spread: {
        home: { line: -4.0, odds: -110 },
        away: { line: +4.0, odds: -110 },
      },
      total: {
        line: 47.5,
        over: -115,
        under: -105,
      },
      props: [
        {
          playerId: 'nfl-player-burrow',
          playerName: 'Joe Burrow',
          propType: 'passing_yards',
          line: 275.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nfl-player-love',
          playerName: 'Jordan Love',
          propType: 'passing_yards',
          line: 235.5,
          over: -105,
          under: -115,
        },
        {
          playerId: 'nfl-player-chase',
          playerName: "Ja'Marr Chase",
          propType: 'receiving_yards',
          line: 88.5,
          over: -110,
          under: -110,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// =====================================================
// NBA Teams
// =====================================================

export const NBA_TEAMS = {
  BOS: { id: 'nba-bos', name: 'Boston Celtics', abbr: 'BOS' },
  LAL: { id: 'nba-lal', name: 'Los Angeles Lakers', abbr: 'LAL' },
  DEN: { id: 'nba-den', name: 'Denver Nuggets', abbr: 'DEN' },
  MIA: { id: 'nba-mia', name: 'Miami Heat', abbr: 'MIA' },
  GSW: { id: 'nba-gsw', name: 'Golden State Warriors', abbr: 'GSW' },
  PHX: { id: 'nba-phx', name: 'Phoenix Suns', abbr: 'PHX' },
} as const;

// =====================================================
// Mock NBA Events with Odds
// =====================================================

export const MOCK_NBA_EVENTS: SportsEvent[] = [
  {
    id: 'evt-nba-001',
    externalId: 'sr:match:nba001',
    sport: 'NBA' as SportType,
    league: 'NBA',
    homeTeamId: NBA_TEAMS.BOS.id,
    homeTeamName: NBA_TEAMS.BOS.name,
    homeTeamAbbr: NBA_TEAMS.BOS.abbr,
    awayTeamId: NBA_TEAMS.LAL.id,
    awayTeamName: NBA_TEAMS.LAL.name,
    awayTeamAbbr: NBA_TEAMS.LAL.abbr,
    scheduledAt: daysFromNow(1, 19), // Tomorrow 7:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -220,
        away: +185,
      },
      spread: {
        home: { line: -5.5, odds: -110 },
        away: { line: +5.5, odds: -110 },
      },
      total: {
        line: 228.5,
        over: -110,
        under: -110,
      },
      props: [
        {
          playerId: 'nba-player-tatum',
          playerName: 'Jayson Tatum',
          propType: 'points',
          line: 28.5,
          over: -115,
          under: -105,
        },
        {
          playerId: 'nba-player-lebron',
          playerName: 'LeBron James',
          propType: 'points',
          line: 25.5,
          over: -110,
          under: -110,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nba-002',
    externalId: 'sr:match:nba002',
    sport: 'NBA' as SportType,
    league: 'NBA',
    homeTeamId: NBA_TEAMS.DEN.id,
    homeTeamName: NBA_TEAMS.DEN.name,
    homeTeamAbbr: NBA_TEAMS.DEN.abbr,
    awayTeamId: NBA_TEAMS.MIA.id,
    awayTeamName: NBA_TEAMS.MIA.name,
    awayTeamAbbr: NBA_TEAMS.MIA.abbr,
    scheduledAt: daysFromNow(1, 21), // Tomorrow 9:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: -300,
        away: +250,
      },
      spread: {
        home: { line: -7.5, odds: -110 },
        away: { line: +7.5, odds: -110 },
      },
      total: {
        line: 218.5,
        over: -108,
        under: -112,
      },
      props: [
        {
          playerId: 'nba-player-jokic',
          playerName: 'Nikola Jokic',
          propType: 'points',
          line: 26.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nba-player-butler',
          playerName: 'Jimmy Butler',
          propType: 'points',
          line: 22.5,
          over: -115,
          under: -105,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'evt-nba-003',
    externalId: 'sr:match:nba003',
    sport: 'NBA' as SportType,
    league: 'NBA',
    homeTeamId: NBA_TEAMS.GSW.id,
    homeTeamName: NBA_TEAMS.GSW.name,
    homeTeamAbbr: NBA_TEAMS.GSW.abbr,
    awayTeamId: NBA_TEAMS.PHX.id,
    awayTeamName: NBA_TEAMS.PHX.name,
    awayTeamAbbr: NBA_TEAMS.PHX.abbr,
    scheduledAt: daysFromNow(2, 22), // Day after tomorrow 10:00 PM
    startedAt: null,
    endedAt: null,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    oddsData: {
      moneyline: {
        home: +120,
        away: -140,
      },
      spread: {
        home: { line: +2.5, odds: -110 },
        away: { line: -2.5, odds: -110 },
      },
      total: {
        line: 232.5,
        over: -105,
        under: -115,
      },
      props: [
        {
          playerId: 'nba-player-curry',
          playerName: 'Stephen Curry',
          propType: 'points',
          line: 27.5,
          over: -110,
          under: -110,
        },
        {
          playerId: 'nba-player-booker',
          playerName: 'Devin Booker',
          propType: 'points',
          line: 29.5,
          over: -105,
          under: -115,
        },
        {
          playerId: 'nba-player-durant',
          playerName: 'Kevin Durant',
          propType: 'points',
          line: 28.5,
          over: -110,
          under: -110,
        },
      ],
    } as EventOdds,
    oddsUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// =====================================================
// All Mock Events Combined
// =====================================================

export const MOCK_EVENTS: SportsEvent[] = [
  ...MOCK_NFL_EVENTS,
  ...MOCK_NBA_EVENTS,
];

// =====================================================
// Helper Functions
// =====================================================

export function getEventsBySport(sport: SportType): SportsEvent[] {
  return MOCK_EVENTS.filter(event => event.sport === sport);
}

export function getEventById(id: string): SportsEvent | undefined {
  return MOCK_EVENTS.find(event => event.id === id);
}

export function getUpcomingEvents(): SportsEvent[] {
  const now = new Date();
  return MOCK_EVENTS
    .filter(event => new Date(event.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}
