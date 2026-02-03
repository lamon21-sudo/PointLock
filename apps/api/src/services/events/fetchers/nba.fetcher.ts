// =====================================================
// NBA Events Fetcher
// =====================================================
// Fetches NBA game data and odds from The Odds API.

import { BaseSportsFetcher } from './base.fetcher';
import { SportType, NormalizedEvent, EventStatus, PlayerPropData } from '../types';
import { PlayerPropMarket, NBA_PROP_MARKETS } from '../../odds/types';

/**
 * NBA team abbreviations lookup
 */
const NBA_TEAM_ABBR: Record<string, string> = {
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SAS',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA',
  'Washington Wizards': 'WAS',
};

/**
 * NBA-specific event fetcher
 */
export class NBAFetcher extends BaseSportsFetcher {
  readonly sportType = SportType.NBA;
  readonly name = 'NBAFetcher';

  protected getLeagueName(): string {
    return 'NBA';
  }

  protected abbreviateTeamName(teamName: string): string {
    return NBA_TEAM_ABBR[teamName] || super.abbreviateTeamName(teamName);
  }

  protected getPropMarkets(): PlayerPropMarket[] {
    return NBA_PROP_MARKETS;
  }

  /**
   * Generate mock NBA player props for development
   */
  protected generateMockProps(_eventId: string): PlayerPropData[] {
    const mockPlayers = [
      { name: 'LeBron James', points: 25.5, rebounds: 7.5, assists: 7.5 },
      { name: 'Stephen Curry', points: 28.5, rebounds: 5.5, assists: 6.5 },
      { name: 'Kevin Durant', points: 27.5, rebounds: 6.5, assists: 5.5 },
      { name: 'Jayson Tatum', points: 26.5, rebounds: 8.5, assists: 4.5 },
      { name: 'Giannis Antetokounmpo', points: 31.5, rebounds: 11.5, assists: 5.5 },
    ];

    const props: PlayerPropData[] = [];

    for (const player of mockPlayers) {
      props.push({
        playerId: player.name.toLowerCase().replace(/\s+/g, '_'),
        playerName: player.name,
        propType: 'player_points',
        line: player.points,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
      props.push({
        playerId: player.name.toLowerCase().replace(/\s+/g, '_'),
        playerName: player.name,
        propType: 'player_rebounds',
        line: player.rebounds,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
      props.push({
        playerId: player.name.toLowerCase().replace(/\s+/g, '_'),
        playerName: player.name,
        propType: 'player_assists',
        line: player.assists,
        overOdds: 1.87 + Math.random() * 0.1,
        underOdds: 1.87 + Math.random() * 0.1,
      });
    }

    return props;
  }

  /**
   * Generate mock NBA events when API is not configured
   */
  protected generateMockEvents(): NormalizedEvent[] {
    const now = new Date();
    const mockGames: Array<{
      home: string;
      away: string;
      daysFromNow: number;
      hour: number;
    }> = [
      { home: 'Boston Celtics', away: 'Los Angeles Lakers', daysFromNow: 0, hour: 19 },
      { home: 'Golden State Warriors', away: 'Phoenix Suns', daysFromNow: 0, hour: 22 },
      { home: 'Milwaukee Bucks', away: 'Miami Heat', daysFromNow: 1, hour: 19 },
      { home: 'Denver Nuggets', away: 'Dallas Mavericks', daysFromNow: 1, hour: 21 },
      { home: 'Philadelphia 76ers', away: 'New York Knicks', daysFromNow: 2, hour: 19 },
      { home: 'Los Angeles Clippers', away: 'Sacramento Kings', daysFromNow: 2, hour: 22 },
    ];

    return mockGames.map((game, index) => {
      const scheduledAt = new Date(now);
      scheduledAt.setDate(scheduledAt.getDate() + game.daysFromNow);
      scheduledAt.setHours(game.hour, 0, 0, 0);

      return {
        externalId: `mock_nba_${index + 1}`,
        sport: SportType.NBA,
        league: 'NBA',
        homeTeamId: this.generateTeamId(game.home),
        homeTeamName: game.home,
        homeTeamAbbr: NBA_TEAM_ABBR[game.home] || 'UNK',
        awayTeamId: this.generateTeamId(game.away),
        awayTeamName: game.away,
        awayTeamAbbr: NBA_TEAM_ABBR[game.away] || 'UNK',
        scheduledAt,
        status: EventStatus.SCHEDULED,
        oddsData: {
          provider: 'Mock Sportsbook',
          lastUpdated: new Date().toISOString(),
          markets: {
            moneyline: {
              home: 1.65 + Math.random() * 0.4,
              away: 2.10 + Math.random() * 0.4,
            },
            spread: {
              home: -5.5,
              away: 5.5,
              homeOdds: 1.91,
              awayOdds: 1.91,
            },
            totals: {
              value: 215.5 + Math.floor(Math.random() * 10),
              overOdds: 1.91,
              underOdds: 1.91,
            },
          },
        },
      };
    });
  }
}
