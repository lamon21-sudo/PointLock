import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../src/stores/auth.store';
import { useWalletStore } from '../../src/stores/wallet.store';
import { AuthService } from '../../src/services/auth.service';
import { formatRC } from '../../src/types/wallet.types';
import { useProfile } from '../../src/hooks/useProfile';
import {
  ProfileHeader,
  StatsCard,
  StreaksCard,
  EditProfileModal,
} from '../../src/components/profile';
import { LUXURY_THEME } from '../../src/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isInitialized, isLoading } = useAuthStore();
  const { wallet, isLoadingWallet, fetchWallet } = useWalletStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);

  // Fetch user profile data
  const {
    profile,
    isLoading: isLoadingProfile,
    updateProfile,
    isSaving,
    updateError,
  } = useProfile();

  // Fetch wallet data when authenticated AND initialized (prevents 401 race condition)
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      fetchWallet();
    }
  }, [isAuthenticated, isInitialized, fetchWallet]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await AuthService.logout();
      router.replace('/login');
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSignIn = () => {
    router.push('/login');
  };

  // Show loading state while auth is initializing
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
      </SafeAreaView>
    );
  }

  // Guest Mode - User not authenticated
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <ScrollView className="flex-1 px-4 pt-4">
          {/* Guest Profile Header */}
          <View className="items-center mb-6">
            <View className="w-24 h-24 bg-surface rounded-full items-center justify-center mb-3">
              <Text className="text-5xl">👤</Text>
            </View>
            <Text className="text-white text-xl font-bold">Guest User</Text>
            <Text className="text-gray-400">Not signed in</Text>
          </View>

          {/* Sign In Banner */}
          <View className="bg-surface-elevated rounded-xl p-6 mb-6">
            <Text className="text-white text-lg font-bold text-center mb-2">
              Sign in to track your stats
            </Text>
            <Text className="text-gray-400 text-sm text-center mb-4">
              Create an account to save your progress, compete on leaderboards, and challenge friends.
            </Text>
            <Pressable
              onPress={handleSignIn}
              className="bg-primary py-3 px-6 rounded-xl active:opacity-80"
            >
              <Text className="text-white font-bold text-center">Sign In</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/register')}
              className="py-3 px-6 mt-2 active:opacity-80"
            >
              <Text className="text-primary font-semibold text-center">Create Account</Text>
            </Pressable>
          </View>

          {/* Limited Settings for Guests */}
          <View className="bg-surface rounded-2xl mb-6">
            <Pressable className="flex-row justify-between items-center p-4 border-b border-background active:opacity-80">
              <View className="flex-row items-center">
                <Text className="text-xl mr-3">⚙️</Text>
                <Text className="text-white">Settings</Text>
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
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Authenticated User View
  const displayName = user.displayName || user.username;

  // Handle profile update
  const handleSaveProfile = async (updates: { displayName: string; avatarId: string }) => {
    try {
      await updateProfile({
        displayName: updates.displayName,
        avatarUrl: updates.avatarId,
      });
      setIsEditModalVisible(false);
    } catch (error) {
      // Error is already handled by the hook
      console.error('Failed to update profile:', error);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Profile Header - Show loading state while profile loads */}
        {isLoadingProfile ? (
          <View className="items-center mb-6 py-8">
            <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
          </View>
        ) : (
          <ProfileHeader
            username={user.username}
            displayName={displayName}
            avatarUrl={user.avatarUrl}
            rank={profile?.rank || 'Unranked'}
            onEditPress={() => setIsEditModalVisible(true)}
          />
        )}

        {/* Stats Grid */}
        {isLoadingProfile ? (
          <View className="flex-row mb-6">
            <View className="flex-1 bg-surface rounded-xl p-4 mr-2 items-center">
              <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
            </View>
            <View className="flex-1 bg-surface rounded-xl p-4 mx-1 items-center">
              <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
            </View>
            <View className="flex-1 bg-surface rounded-xl p-4 ml-2 items-center">
              <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
            </View>
          </View>
        ) : (
          <StatsCard
            totalMatches={profile?.stats?.totalMatches ?? 0}
            wins={profile?.stats?.wins ?? 0}
            winRate={profile?.stats?.winRate ?? 0}
          />
        )}

        {/* Wallet Section */}
        <Pressable
          onPress={() => router.push('/(tabs)/wallet')}
          className="bg-surface rounded-2xl p-5 mb-4 active:opacity-80"
        >
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-white font-bold text-lg">Wallet</Text>
            <View className="flex-row items-center">
              {isLoadingWallet && !wallet ? (
                <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
              ) : (
                <Text className="text-gray-400 text-sm mr-1">View Details</Text>
              )}
              <Text className="text-gray-500">›</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center py-3 border-b border-background">
            <Text className="text-gray-400">Cash Balance</Text>
            <Text className="text-white font-semibold">
              {formatRC(wallet?.paidBalance ?? 0)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center py-3 border-b border-background">
            <Text className="text-gray-400">Bonus Balance</Text>
            <Text className="text-white font-semibold">
              {formatRC(wallet?.bonusBalance ?? 0)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center py-3">
            <Text className="text-white font-bold">Total Balance</Text>
            <Text className="text-primary font-bold text-lg">
              {formatRC(wallet?.totalBalance ?? 0)}
            </Text>
          </View>
        </Pressable>

        {/* Streaks */}
        {isLoadingProfile ? (
          <View className="bg-surface rounded-2xl p-5 mb-4 items-center">
            <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
          </View>
        ) : (
          <StreaksCard
            currentStreak={profile?.stats?.currentStreak ?? 0}
            bestStreak={profile?.stats?.bestStreak ?? 0}
          />
        )}

        {/* Settings */}
        <View className="bg-surface rounded-2xl mb-4">
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
          <Pressable
            onPress={() => router.push('/(tabs)/wallet')}
            className="flex-row justify-between items-center p-4 border-b border-background active:opacity-80"
          >
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

        {/* Sign Out Button */}
        <Pressable
          onPress={handleSignOut}
          disabled={isSigningOut}
          className="bg-surface rounded-2xl p-4 mb-6 active:opacity-80"
        >
          <View className="flex-row items-center justify-center">
            {isSigningOut ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <>
                <Text className="text-xl mr-2">🚪</Text>
                <Text className="text-red-500 font-semibold">Sign Out</Text>
              </>
            )}
          </View>
        </Pressable>
      </ScrollView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={isEditModalVisible}
        currentDisplayName={displayName}
        currentAvatarUrl={user.avatarUrl}
        onSave={handleSaveProfile}
        onCancel={() => setIsEditModalVisible(false)}
        isSaving={isSaving}
        error={updateError}
      />
    </SafeAreaView>
  );
}
