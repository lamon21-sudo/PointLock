import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Mock leaderboard data for UI development
const MOCK_LEADERBOARD = [
  { rank: 1, username: 'ChiefsKingdom', wins: 47, points: 12450, streak: 8 },
  { rank: 2, username: 'BillsMafia22', wins: 43, points: 11200, streak: 5 },
  { rank: 3, username: 'NinersFaithful', wins: 41, points: 10800, streak: 3 },
  { rank: 4, username: 'EaglesNation', wins: 38, points: 9950, streak: 2 },
  { rank: 5, username: 'CowboysFan88', wins: 35, points: 9200, streak: 0 },
  { rank: 6, username: 'DolphinsDan', wins: 33, points: 8700, streak: 4 },
  { rank: 7, username: 'LionsRoar', wins: 31, points: 8100, streak: 1 },
  { rank: 8, username: 'RavensFlock', wins: 29, points: 7600, streak: 0 },
  { rank: 9, username: 'BengalStripes', wins: 27, points: 7100, streak: 2 },
  { rank: 10, username: 'PackerBacker', wins: 25, points: 6500, streak: 0 },
];

function LeaderboardItem({
  rank,
  username,
  wins,
  points,
  streak,
  isCurrentUser = false,
}: {
  rank: number;
  username: string;
  wins: number;
  points: number;
  streak: number;
  isCurrentUser?: boolean;
}) {
  const getRankColor = () => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-gray-500';
  };

  const getRankEmoji = () => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <View
      className={`flex-row items-center p-4 rounded-xl mb-2 ${
        isCurrentUser ? 'bg-primary/20 border border-primary' : 'bg-surface'
      }`}
    >
      {/* Rank */}
      <View className="w-12 items-center">
        {getRankEmoji() ? (
          <Text className="text-xl">{getRankEmoji()}</Text>
        ) : (
          <Text className={`font-bold text-lg ${getRankColor()}`}>#{rank}</Text>
        )}
      </View>

      {/* User Info */}
      <View className="flex-1 ml-3">
        <Text className={`font-bold ${isCurrentUser ? 'text-primary' : 'text-white'}`}>
          {username}
        </Text>
        <Text className="text-gray-400 text-xs">{wins} wins</Text>
      </View>

      {/* Streak */}
      {streak > 0 && (
        <View className="bg-success/20 px-2 py-1 rounded mr-3">
          <Text className="text-success text-xs font-semibold">🔥 {streak}</Text>
        </View>
      )}

      {/* Points */}
      <View className="items-end">
        <Text className="text-white font-bold">{points.toLocaleString()}</Text>
        <Text className="text-gray-500 text-xs">pts</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Your Rank Card */}
        <View className="bg-surface rounded-2xl p-5 mb-6">
          <Text className="text-gray-400 text-sm mb-2">Your Ranking</Text>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-white text-3xl font-bold">#--</Text>
              <Text className="text-gray-500 text-sm">Not ranked yet</Text>
            </View>
            <View className="items-end">
              <Text className="text-2xl font-bold text-primary">0</Text>
              <Text className="text-gray-500 text-sm">points</Text>
            </View>
          </View>
          <Text className="text-gray-400 text-xs mt-3">
            Complete matches to appear on the leaderboard
          </Text>
        </View>

        {/* Period Selector */}
        <View className="flex-row mb-4">
          <View className="bg-primary px-4 py-2 rounded-full mr-2">
            <Text className="text-white font-semibold">All Time</Text>
          </View>
          <View className="bg-surface px-4 py-2 rounded-full mr-2">
            <Text className="text-gray-400 font-semibold">This Week</Text>
          </View>
          <View className="bg-surface px-4 py-2 rounded-full">
            <Text className="text-gray-400 font-semibold">Friends</Text>
          </View>
        </View>

        {/* Leaderboard List */}
        <Text className="text-white font-bold text-lg mb-3">Top Players</Text>
        {MOCK_LEADERBOARD.map((player) => (
          <LeaderboardItem key={player.rank} {...player} />
        ))}

        {/* Note */}
        <View className="bg-surface-elevated rounded-xl p-4 mt-4 mb-6">
          <Text className="text-gray-400 text-sm text-center">
            📊 Mock data for UI preview. Real leaderboards coming in Sprint 9.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
