import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { UserCircleIcon, CaretRightIcon } from 'phosphor-react-native';
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
  MenuRow,
} from '../../src/components/profile';
import { GlassCard } from '../../src/components/ui/GlassCard';
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
    isUpdating,
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
      <SafeAreaView style={styles.containerCentered}>
        <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
      </SafeAreaView>
    );
  }

  // Guest Mode - User not authenticated
  if (!isAuthenticated || !user) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Guest Profile Header */}
          <GlassCard padded style={styles.cardSpacing}>
            <View style={styles.guestHeaderContent}>
              <View style={styles.guestAvatarContainer}>
                <UserCircleIcon size={48} color={LUXURY_THEME.gold.main} weight="duotone" />
              </View>
              <Text style={styles.guestDisplayName}>Guest User</Text>
              <Text style={styles.guestUsername}>Not signed in</Text>
            </View>
          </GlassCard>

          {/* Sign In Banner */}
          <GlassCard padded style={styles.cardSpacing}>
            <Text style={styles.signInTitle}>Sign in to track your stats</Text>
            <Text style={styles.signInSubtitle}>
              Create an account to save your progress, compete on leaderboards, and challenge friends.
            </Text>
            <Pressable
              onPress={handleSignIn}
              style={({ pressed }) => [
                styles.signInButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/register')}
              style={({ pressed }) => [
                styles.createAccountButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.createAccountText}>Create Account</Text>
            </Pressable>
          </GlassCard>

          {/* Limited Settings for Guests */}
          <GlassCard style={styles.cardSpacing}>
            <MenuRow icon="GearSix" label="Settings" onPress={() => {}} />
            <MenuRow icon="Question" label="Help & Support" onPress={() => {}} isLast />
          </GlassCard>

          {/* Bottom Spacer */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Authenticated User View
  const displayName = user.displayName || user.username;

  // Handle profile update
  const handleSaveProfile = async (updates: { displayName: string; avatarId: string | null }) => {
    try {
      await updateProfile({
        displayName: updates.displayName,
        avatarUrl: updates.avatarId ?? undefined,
      });
      setIsEditModalVisible(false);
    } catch (error) {
      // Error is already handled by the hook
      console.error('Failed to update profile:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header - Show loading state while profile loads */}
        {isLoadingProfile ? (
          <GlassCard padded style={styles.headerLoading}>
            <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
          </GlassCard>
        ) : (
          <View style={styles.cardSpacing}>
            <ProfileHeader
              username={user.username}
              displayName={displayName}
              avatarUrl={user.avatarUrl ?? null}
              skillRating={profile?.skillRating ?? 1000}
              isOwnProfile={true}
              onEditPress={() => setIsEditModalVisible(true)}
            />
          </View>
        )}

        {/* Stats Grid */}
        {isLoadingProfile ? (
          <GlassCard padded style={styles.statsLoading}>
            <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
          </GlassCard>
        ) : (
          <View style={styles.cardSpacing}>
            <StatsCard
              matchesPlayed={profile?.stats?.matchesPlayed ?? 0}
              matchesWon={profile?.stats?.matchesWon ?? 0}
              winRate={profile?.stats?.winRate ?? 0}
            />
          </View>
        )}

        {/* Wallet Section */}
        <GlassCard
          pressable
          onPress={() => router.push('/(tabs)/wallet')}
          padded
          style={styles.cardSpacing}
        >
          <View style={styles.walletHeader}>
            <Text style={styles.walletTitle}>Wallet</Text>
            <View style={styles.walletHeaderRight}>
              {isLoadingWallet && !wallet ? (
                <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
              ) : (
                <Text style={styles.viewDetails}>View Details</Text>
              )}
              <CaretRightIcon size={18} color={LUXURY_THEME.text.muted} weight="bold" />
            </View>
          </View>

          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>Cash Balance</Text>
            <Text style={styles.walletValue}>{formatRC(wallet?.paidBalance ?? 0)}</Text>
          </View>
          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>Bonus Balance</Text>
            <Text style={styles.walletValue}>{formatRC(wallet?.bonusBalance ?? 0)}</Text>
          </View>
          <View style={[styles.walletRow, styles.walletTotalRow]}>
            <Text style={styles.walletTotalLabel}>Total Balance</Text>
            <Text style={styles.walletTotalValue}>{formatRC(wallet?.totalBalance ?? 0)}</Text>
          </View>
        </GlassCard>

        {/* Streaks */}
        {isLoadingProfile ? (
          <GlassCard padded style={styles.streaksLoading}>
            <ActivityIndicator size="small" color={LUXURY_THEME.gold.main} />
          </GlassCard>
        ) : (
          <View style={styles.cardSpacing}>
            <StreaksCard
              currentStreak={profile?.stats?.currentStreak ?? 0}
              bestStreak={profile?.stats?.bestStreak ?? 0}
            />
          </View>
        )}

        {/* Settings Menu */}
        <GlassCard style={styles.cardSpacing}>
          <MenuRow icon="GearSix" label="Settings" onPress={() => {}} />
          <MenuRow icon="Bell" label="Notifications" onPress={() => {}} />
          <MenuRow
            icon="Receipt"
            label="Transaction History"
            onPress={() => router.push('/(tabs)/wallet')}
          />
          <MenuRow icon="Question" label="Help & Support" onPress={() => {}} isLast />
        </GlassCard>

        {/* Sign Out Button */}
        <GlassCard style={styles.cardSpacing}>
          {isSigningOut ? (
            <View style={styles.signOutLoading}>
              <ActivityIndicator size="small" color={LUXURY_THEME.status.error} />
            </View>
          ) : (
            <MenuRow
              icon="SignOut"
              label="Sign Out"
              onPress={handleSignOut}
              showChevron={false}
              destructive
              isLast
            />
          )}
        </GlassCard>

        {/* Bottom Spacer for Tab Bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={isEditModalVisible}
        currentDisplayName={displayName}
        currentAvatarId={user.avatarUrl ?? null}
        onSave={handleSaveProfile}
        onCancel={() => setIsEditModalVisible(false)}
        isSaving={isUpdating}
        error={updateError}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  containerCentered: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Card Spacing
  cardSpacing: {
    marginBottom: LUXURY_THEME.spacing.cardGap,
  },

  // Loading States
  headerLoading: {
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsLoading: {
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streaksLoading: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Guest Mode
  guestHeaderContent: {
    alignItems: 'center',
  },
  guestAvatarContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: LUXURY_THEME.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  guestDisplayName: {
    fontSize: 20,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    marginBottom: 4,
  },
  guestUsername: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
  },

  // Sign In Banner
  signInTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  signInSubtitle: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  signInButton: {
    backgroundColor: LUXURY_THEME.gold.main,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.bg.primary,
  },
  createAccountButton: {
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  createAccountText: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.gold.main,
  },
  buttonPressed: {
    opacity: 0.8,
  },

  // Wallet Card
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  walletHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetails: {
    fontSize: 14,
    color: LUXURY_THEME.text.secondary,
    marginRight: 4,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
  },
  walletLabel: {
    fontSize: 15,
    color: LUXURY_THEME.text.secondary,
  },
  walletValue: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.text.primary,
  },
  walletTotalRow: {
    borderBottomWidth: 0,
    paddingTop: 12,
  },
  walletTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: LUXURY_THEME.text.primary,
  },
  walletTotalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: LUXURY_THEME.gold.main,
  },

  // Sign Out
  signOutLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  // Bottom Spacer (matches Home tab)
  bottomSpacer: {
    height: 100,
  },
});
