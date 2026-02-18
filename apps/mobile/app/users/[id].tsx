// =====================================================
// Public User Profile Screen
// =====================================================
// Displays another user's public profile with challenge option.
// Dynamic route: /users/[id]
//
// Features:
// - Public profile viewing (no edit capability)
// - User stats and streaks display
// - Challenge button to start a match
// - Pull-to-refresh functionality
// - Loading and error states

import React, { useCallback } from 'react';
import { SmileyMehIcon } from 'phosphor-react-native';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProfile } from '../../src/hooks/useProfile';
import { ProfileHeader, StatsCard, StreaksCard } from '../../src/components/profile';

// =====================================================
// Sub-components
// =====================================================

/**
 * Header with back button and title
 */
function Header({ onBackPress }: { onBackPress: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBackPress}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.backButtonPressed,
        ]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.backButtonText}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Profile</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

/**
 * Loading state (centered spinner)
 */
function LoadingState() {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#6366f1" />
      <Text style={styles.loadingText}>Loading profile...</Text>
    </View>
  );
}

/**
 * Error state with retry button
 */
function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <SmileyMehIcon size={64} color="#9ca3af" weight="duotone" style={{ marginBottom: 16 }} />
      <Text style={styles.errorTitle}>Unable to load profile</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          pressed && styles.retryButtonPressed,
        ]}
      >
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function PublicUserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const userId = params.id;

  // Fetch public profile
  const { profile, isLoading, error, refresh } = useProfile({ userId });

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleBack = () => {
    router.back();
  };

  const handleChallenge = () => {
    if (!userId) return;
    router.push(`/challenge/create?opponentId=${userId}`);
  };

  // Loading state
  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Header onBackPress={handleBack} />
        <LoadingState />
      </SafeAreaView>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Header onBackPress={handleBack} />
        <ErrorState error={error} onRetry={refresh} />
      </SafeAreaView>
    );
  }

  // Profile not found (shouldn't happen if API is working, but defensive)
  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Header onBackPress={handleBack} />
        <ErrorState error="User not found" onRetry={refresh} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Header onBackPress={handleBack} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
      >
        {/* Profile Header (no edit button) */}
        <ProfileHeader
          displayName={profile.user.displayName}
          username={profile.user.username}
          avatarUrl={profile.user.avatarUrl}
          skillRating={profile.skillRating}
          isOwnProfile={false}
        />

        {/* Stats Card */}
        <StatsCard
          matchesPlayed={profile.stats.matchesPlayed}
          matchesWon={profile.stats.matchesWon}
          winRate={profile.stats.winRate}
        />

        {/* Streaks Card */}
        <StreaksCard
          currentStreak={profile.stats.currentStreak}
          bestStreak={profile.stats.bestStreak}
        />

        {/* Bottom padding for challenge button */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Challenge Button (fixed at bottom) */}
      <View style={styles.challengeButtonContainer}>
        <Pressable
          onPress={handleChallenge}
          style={({ pressed }) => [
            styles.challengeButton,
            pressed && styles.challengeButtonPressed,
          ]}
        >
          <Text style={styles.challengeButtonText}>
            Challenge {profile.user.username}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f0f23',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  backButtonPressed: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  backButtonText: {
    fontSize: 32,
    fontWeight: '300',
    color: '#6366f1',
    lineHeight: 36,
    marginTop: -4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  headerSpacer: {
    width: 40, // Match back button width for centering
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  bottomPadding: {
    height: 100, // Space for fixed challenge button
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonPressed: {
    backgroundColor: '#4f46e5',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  challengeButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#0f0f23',
    borderTopWidth: 1,
    borderTopColor: '#1e1e32',
  },
  challengeButton: {
    backgroundColor: '#6366f1',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    // Subtle shadow for depth
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  challengeButtonPressed: {
    backgroundColor: '#4f46e5',
    transform: [{ scale: 0.98 }],
  },
  challengeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});
