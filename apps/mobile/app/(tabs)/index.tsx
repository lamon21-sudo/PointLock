import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Balance Card */}
        <View className="bg-surface rounded-2xl p-5 mb-6">
          <Text className="text-gray-400 text-sm mb-1">Your Balance</Text>
          <View className="flex-row items-baseline">
            <Text className="text-3xl font-bold text-white">10,000</Text>
            <Text className="text-lg text-primary ml-2">RC</Text>
          </View>
          <Text className="text-gray-500 text-xs mt-1">Rival Coins</Text>
        </View>

        {/* Quick Actions */}
        <Text className="text-white font-bold text-lg mb-3">Quick Actions</Text>
        <View className="flex-row mb-6 gap-3">
          <Link href="/(tabs)/events" asChild>
            <Pressable className="flex-1 bg-primary rounded-xl p-4 active:opacity-80">
              <Text className="text-2xl mb-2">🎯</Text>
              <Text className="text-white font-semibold">Build Slip</Text>
              <Text className="text-primary-200 text-xs">Make your picks</Text>
            </Pressable>
          </Link>
          <Link href="/(tabs)/matches" asChild>
            <Pressable className="flex-1 bg-surface rounded-xl p-4 active:opacity-80">
              <Text className="text-2xl mb-2">⚔️</Text>
              <Text className="text-white font-semibold">Challenge</Text>
              <Text className="text-gray-400 text-xs">PvP matches</Text>
            </Pressable>
          </Link>
        </View>

        {/* Featured Game */}
        <Text className="text-white font-bold text-lg mb-3">Featured Matchup</Text>
        <View className="bg-surface rounded-2xl p-5 mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-gray-400 text-xs">NFL • Tomorrow 1:00 PM</Text>
            <View className="bg-primary/20 px-2 py-1 rounded">
              <Text className="text-primary text-xs font-semibold">HOT 🔥</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center">
            <View className="flex-1 items-center">
              <Text className="text-3xl mb-2">🏈</Text>
              <Text className="text-white font-bold">Chiefs</Text>
              <Text className="text-success font-semibold">-145</Text>
            </View>

            <View className="px-4">
              <Text className="text-gray-500 font-bold">VS</Text>
            </View>

            <View className="flex-1 items-center">
              <Text className="text-3xl mb-2">🏈</Text>
              <Text className="text-white font-bold">Bills</Text>
              <Text className="text-error font-semibold">+125</Text>
            </View>
          </View>

          <View className="mt-4 pt-4 border-t border-background">
            <View className="flex-row justify-between">
              <Text className="text-gray-400 text-sm">Spread</Text>
              <Text className="text-white text-sm">KC -2.5 / BUF +2.5</Text>
            </View>
            <View className="flex-row justify-between mt-2">
              <Text className="text-gray-400 text-sm">Total</Text>
              <Text className="text-white text-sm">O/U 52.5</Text>
            </View>
          </View>
        </View>

        {/* Status */}
        <View className="bg-surface-elevated rounded-xl p-4 mb-6">
          <Text className="text-success font-semibold mb-1">
            ✅ App Initialized Successfully
          </Text>
          <Text className="text-gray-400 text-sm">
            All systems operational. Ready for Phase 1 development.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
