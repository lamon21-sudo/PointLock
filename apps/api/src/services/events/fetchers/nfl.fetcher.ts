// =====================================================
// NFL Events Fetcher
// =====================================================
// Fetches NFL game data and odds from The Odds API.

import { BaseSportsFetcher } from './base.fetcher';
import { SportType, NormalizedEvent, EventStatus, PlayerPropData } from '../types';
import { PlayerPropMarket, NFL_PROP_MARKETS } from '../../odds/types';

/**
 * NFL team abbreviations lookup
 */
const NFL_TEAM_ABBR: Record<string, string> = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
};

/**
 * NFL-specific event fetcher
 */
export class NFLFetcher extends BaseSportsFetcher {
  readonly sportType = SportType.NFL;
  readonly name = 'NFLFetcher';

  protected getLeagueName(): string {
    return 'NFL';
  }

  protected abbreviateTeamName(teamName: string): string {
    return NFL_TEAM_ABBR[teamName] || super.abbreviateTeamName(teamName);
  }

  protected getPropMarkets(): PlayerPropMarket[] {
    return NFL_PROP_MARKETS;
  }

  /**
   * Generate mock NFL player props for development
   */
  protected generateMockProps(_eventId: string): PlayerPropData[] {
    // QB mock data
    const qbPlayers = [
      { name: 'Patrick Mahomes', passYds: 285.5, passTds: 2.5, rushYds: 25.5 },
      { name: 'Josh Allen', passYds: 275.5, passTds: 2.5, rushYds: 35.5 },
      { name: 'Lamar Jackson', passYds: 225.5, passTds: 1.5, rushYds: 65.5 },
    ];

    // Receiver mock data
    const receiverPlayers = [
      { name: 'Travis Kelce', receptions: 6.5, recYds: 75.5 },
      { name: 'Tyreek Hill', receptions: 7.5, recYds: 95.5 },
    ];

    const props: PlayerPropData[] = [];

    for (const player of qbPlayers) {
      const playerId = player.name.toLowerCase().replace(/\s+/g, '_');
      props.push({
        playerId,
        playerName: player.name,
        propType: 'player_pass_yds',
        line: player.passYds,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
      props.push({
        playerId,
        playerName: player.name,
        propType: 'player_pass_tds',
        line: player.passTds,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
      props.push({
        playerId,
        playerName: player.name,
        propType: 'player_rush_yds',
        line: player.rushYds,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
    }

    for (const player of receiverPlayers) {
      const playerId = player.name.toLowerCase().replace(/\s+/g, '_');
      props.push({
        playerId,
        playerName: player.name,
        propType: 'player_receptions',
        line: player.receptions,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
      props.push({
        playerId,
        playerName: player.name,
        propType: 'player_reception_yds',
        line: player.recYds,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
    }

    return props;
  }

  /**
   * Generate mock NFL events when API is not configured
   */
  protected generateMockEvents(): NormalizedEvent[] {
    const now = new Date();
    const mockGames: Array<{
      home: string;
      away: string;
      daysFromNow: number;
      hour: number;
    }> = [
      { home: 'Kansas City Chiefs', away: 'Buffalo Bills', daysFromNow: 1, hour: 13 },
      { home: 'San Francisco 49ers', away: 'Dallas Cowboys', daysFromNow: 1, hour: 16 },
      { home: 'Philadelphia Eagles', away: 'New York Giants', daysFromNow: 2, hour: 20 },
      { home: 'Detroit Lions', away: 'Green Bay Packers', daysFromNow: 7, hour: 13 },
      { home: 'Baltimore Ravens', away: 'Cincinnati Bengals', daysFromNow: 7, hour: 16 },
    ];

    return mockGames.map((game, index) => {
      const scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + game.daysFromNow);
      scheduledAt.setHours(game.hour, 0, 0, 0);

      return {
        externalId: `mock_nfl_${index + 1}`,
        sport: SportType.NFL,
        league: 'NFL',
        homeTeamId: this.generateTeamId(game.home),
        homeTeamName: game.home,
        homeTeamAbbr: NFL_TEAM_ABBR[game.home] || 'UNK',
        awayTeamId: this.generateTeamId(game.away),
        awayTeamName: game.away,
        awayTeamAbbr: NFL_TEAM_ABBR[game.away] || 'UNK',
        scheduledAt,
        status: EventStatus.SCHEDULED,
        oddsData: {
          provider: 'Mock Sportsbook',
          lastUpdated: new Date().toISOString(),
          markets: {
            moneyline: {
              home: 1.85 + Math.random() * 0.3,
              away: 1.95 + Math.random() * 0.3,
            },
            spread: {
              home: -3.5,
              away: 3.5,
              homeOdds: 1.91,
              awayOdds: 1.91,
            },
            totals: {
              value: 45.5 + Math.floor(Math.random() * 5),
              overOdds: 1.91,
              underOdds: 1.91,
            },
          },
        },
      };
    });
  }
}
