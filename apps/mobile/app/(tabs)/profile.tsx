import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Profile Header */}
        <View className="items-center mb-6">
          <View className="w-24 h-24 bg-surface rounded-full items-center justify-center mb-3">
            <Text className="text-5xl">👤</Text>
          </View>
          <Text className="text-white text-xl font-bold">Guest User</Text>
          <Text className="text-gray-400">@guest_user</Text>
          <View className="bg-primary/20 px-3 py-1 rounded-full mt-2">
            <Text className="text-primary text-sm font-semibold">Unranked</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View className="flex-row mb-6">
          <View className="flex-1 bg-surface rounded-xl p-4 mr-2 items-center">
            <Text className="text-2xl font-bold text-white">0</Text>
            <Text className="text-gray-400 text-xs">Matches</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-4 mx-1 items-center">
            <Text className="text-2xl font-bold text-success">0</Text>
            <Text className="text-gray-400 text-xs">Wins</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-4 ml-2 items-center">
            <Text className="text-2xl font-bold text-white">0%</Text>
            <Text className="text-gray-400 text-xs">Win Rate</Text>
          </View>
        </View>

        {/* Wallet Section */}
        <View className="bg-surface rounded-2xl p-5 mb-4">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white font-bold text-lg">Wallet</Text>
            <Pressable className="bg-primary px-4 py-2 rounded-lg active:opacity-80">
              <Text className="text-white font-semibold">+ Add Coins</Text>
            </Pressable>
          </View>

          <View className="flex-row justify-between items-center py-3 border-b border-background">
            <Text className="text-gray-400">Paid Balance</Text>
            <Text className="text-white font-semibold">0 RC</Text>
          </View>
          <View className="flex-row justify-between items-center py-3 border-b border-background">
            <Text className="text-gray-400">Bonus Balance</Text>
            <Text className="text-white font-semibold">10,000 RC</Text>
          </View>
          <View className="flex-row justify-between items-center py-3">
            <Text className="text-white font-bold">Total Balance</Text>
            <Text className="text-primary font-bold text-lg">10,000 RC</Text>
          </View>
        </View>

        {/* Streaks */}
        <View className="bg-surface rounded-2xl p-5 mb-4">
          <Text className="text-white font-bold text-lg mb-4">Streaks</Text>

          <View className="flex-row justify-between items-center py-2">
            <View className="flex-row items-center">
              <Text className="text-xl mr-2">🔥</Text>
              <Text className="text-gray-400">Current Streak</Text>
            </View>
            <Text className="text-white font-bold">0</Text>
          </View>
          <View className="flex-row justify-between items-center py-2">
            <View className="flex-row items-center">
              <Text className="text-xl mr-2">🏆</Text>
              <Text className="text-gray-400">Best Streak</Text>
            </View>
            <Text className="text-white font-bold">0</Text>
          </View>
        </View>

        {/* Settings */}
        <View className="bg-surface rounded-2xl mb-6">
          <Pressable className="flex-row justify-between items-center p-4 border-b border-background active:opacity-80">
            <View className="flex-row items-center">
              <Text className="text-xl mr-3">⚙️</Text>
              <Text className="text-white">Settings</Text>
            </View>
            <Text className="text-gray-500">›</Text>
          </Pressable>
          <Pressable className="flex-row justify-between items-center p-4 border-b border-background active:opacity-80">
            <View className="flex-row items-center">
              <Text className="text-xl mr-3">🔔</Text>
              <Text className="text-white">Notifications</Text>
            </View>
            <Text className="text-gray-500">›</Text>
          </Pressable>
          <Pressable className="flex-row justify-between items-center p-4 border-b border-background active:opacity-80">
            <View className="flex-row items-center">
              <Text className="text-xl mr-3">📜</Text>
              <Text className="text-white">Transaction History</Text>
            </View>
            <Text className="text-gray-500">›</Text>
          </Pressable>
          <Pressable className="flex-row justify-between items-center p-4 active:opacity-80">
            <View className="flex-row items-center">
              <Text className="text-xl mr-3">❓</Text>
              <Text className="text-white">Help & Support</Text>
            </View>
            <Text className="text-gray-500">›</Text>
          </Pressable>
        </View>

        {/* Auth Notice */}
        <View className="bg-surface-elevated rounded-xl p-4 mb-6">
          <Text className="text-gray-400 text-sm text-center">
            🔐 Authentication coming in Sprint 1. Currently viewing as Guest.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
