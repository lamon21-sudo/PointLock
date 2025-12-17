import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MatchesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Empty State */}
        <View className="items-center justify-center py-16">
          <Text className="text-6xl mb-4">⚔️</Text>
          <Text className="text-white text-xl font-bold mb-2">No Active Matches</Text>
          <Text className="text-gray-400 text-center px-8">
            Build a slip and challenge a friend to start your first PvP match!
          </Text>
        </View>

        {/* Info Card */}
        <View className="bg-surface rounded-2xl p-5 mt-4">
          <Text className="text-white font-bold mb-3">How Matches Work</Text>

          <View className="mb-3">
            <Text className="text-primary font-semibold mb-1">1. Build Your Slip</Text>
            <Text className="text-gray-400 text-sm">
              Select your picks from upcoming NFL & NBA games
            </Text>
          </View>

          <View className="mb-3">
            <Text className="text-primary font-semibold mb-1">2. Set Your Stake</Text>
            <Text className="text-gray-400 text-sm">
              Wager 1K - 50K Rival Coins on your predictions
            </Text>
          </View>

          <View className="mb-3">
            <Text className="text-primary font-semibold mb-1">3. Challenge a Friend</Text>
            <Text className="text-gray-400 text-sm">
              Send an invite link — they build their own slip to compete
            </Text>
          </View>

          <View>
            <Text className="text-primary font-semibold mb-1">4. Winner Takes All</Text>
            <Text className="text-gray-400 text-sm">
              Higher points wins the pot (minus 5% rake)
            </Text>
          </View>
        </View>

        {/* Coming Soon */}
        <View className="bg-surface-elevated rounded-xl p-4 mt-4">
          <Text className="text-gray-400 text-sm text-center">
            🚧 Match creation coming in Phase 1 Sprint 6
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
