// =====================================================
// Seed NHL Test Events
// =====================================================
// Run with: npx ts-node scripts/seed-nhl-events.ts

import { PrismaClient, SportType, EventStatus } from '@prisma/client';

const prisma = new PrismaClient();

// NHL Teams data
const NHL_TEAMS = [
  { id: 'nhl-bos', name: 'Boston Bruins', abbr: 'BOS' },
  { id: 'nhl-tor', name: 'Toronto Maple Leafs', abbr: 'TOR' },
  { id: 'nhl-nyr', name: 'New York Rangers', abbr: 'NYR' },
  { id: 'nhl-fla', name: 'Florida Panthers', abbr: 'FLA' },
  { id: 'nhl-col', name: 'Colorado Avalanche', abbr: 'COL' },
  { id: 'nhl-vgk', name: 'Vegas Golden Knights', abbr: 'VGK' },
  { id: 'nhl-edm', name: 'Edmonton Oilers', abbr: 'EDM' },
  { id: 'nhl-dal', name: 'Dallas Stars', abbr: 'DAL' },
  { id: 'nhl-car', name: 'Carolina Hurricanes', abbr: 'CAR' },
  { id: 'nhl-wpg', name: 'Winnipeg Jets', abbr: 'WPG' },
];

// Generate random American odds (-110 to -200 for favorites, +100 to +200 for underdogs)
function generateOdds(): { home: number; away: number } {
  const isFavorite = Math.random() > 0.5;
  const favoriteOdds = -(Math.floor(Math.random() * 90) + 110); // -110 to -200
  const underdogOdds = Math.floor(Math.random() * 100) + 100; // +100 to +200

  return isFavorite
    ? { home: favoriteOdds, away: underdogOdds }
    : { home: underdogOdds, away: favoriteOdds };
}

// Generate spread odds
function generateSpread(): { home: { line: number; odds: number }; away: { line: number; odds: number } } {
  const spread = (Math.floor(Math.random() * 3) + 1) * 0.5; // 0.5, 1, 1.5
  return {
    home: { line: -spread, odds: -110 },
    away: { line: spread, odds: -110 },
  };
}

// Generate total odds
function generateTotal(): { line: number; over: number; under: number } {
  const total = Math.floor(Math.random() * 3) + 5.5; // 5.5, 6.5, 7.5
  return {
    line: total,
    over: -110,
    under: -110,
  };
}

async function seedNHLEvents() {
  console.log('🏒 Seeding NHL test events...\n');

  // Generate events for the next 7 days
  const events = [];
  const now = new Date();

  for (let day = 0; day < 7; day++) {
    // 2-4 games per day
    const gamesPerDay = Math.floor(Math.random() * 3) + 2;

    for (let game = 0; game < gamesPerDay; game++) {
      // Pick two random different teams
      const shuffled = [...NHL_TEAMS].sort(() => Math.random() - 0.5);
      const homeTeam = shuffled[0];
      const awayTeam = shuffled[1];

      // Set game time (7pm, 8pm, 9pm, or 10pm ET)
      const gameDate = new Date(now);
      gameDate.setDate(gameDate.getDate() + day);
      gameDate.setHours(19 + Math.floor(Math.random() * 4), 0, 0, 0);

      const moneyline = generateOdds();
      const spread = generateSpread();
      const total = generateTotal();

      events.push({
        externalId: `nhl-test-${day}-${game}-${Date.now()}`,
        sport: SportType.NHL,
        league: 'NHL',
        homeTeamId: homeTeam.id,
        homeTeamName: homeTeam.name,
        homeTeamAbbr: homeTeam.abbr,
        awayTeamId: awayTeam.id,
        awayTeamName: awayTeam.name,
        awayTeamAbbr: awayTeam.abbr,
        scheduledAt: gameDate,
        status: EventStatus.SCHEDULED,
        oddsData: {
          moneyline,
          spread,
          total,
        },
        oddsUpdatedAt: new Date(),
      });
    }
  }

  // Insert events
  let created = 0;
  for (const event of events) {
    try {
      await prisma.sportsEvent.create({ data: event });
      console.log(`✅ Created: ${event.awayTeamAbbr} @ ${event.homeTeamAbbr} - ${event.scheduledAt.toLocaleDateString()}`);
      created++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`⏭️  Skipped (duplicate): ${event.awayTeamAbbr} @ ${event.homeTeamAbbr}`);
      } else {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  }

  console.log(`\n🏒 Done! Created ${created} NHL events.`);
}

async function main() {
  try {
    await seedNHLEvents();
  } catch (error) {
    console.error('Error seeding NHL events:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
