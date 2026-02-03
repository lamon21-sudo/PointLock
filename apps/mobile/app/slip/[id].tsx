// =====================================================
// Slip Detail Screen
// =====================================================
// Displays full slip details with all picks and results.
// Dynamic route: /slip/[id]

import { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSlipDetail } from '../../src/hooks/useSlips';
import { SlipStatusBadge } from '../../src/components/slip/SlipStatusBadge';
import { PointsDisplay } from '../../src/components/slip/PointsDisplay';
import { PickResultItem } from '../../src/components/slip/PickResultItem';
import { ApiPickResponse } from '../../src/services/slip.service';
import type { SlipStatus } from '@pick-rivals/shared-types';
import { formatSlipDate, isSlipSettled } from '../../src/types/api-slip.types';

// =====================================================
// Helper Functions
// =====================================================

/**
 * Format full date for detail view
 */
function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =====================================================
// Sub-components
// =====================================================

/**
 * Loading state
 */
function LoadingState() {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.loadingText}>Loading slip...</Text>
    </View>
  );
}

/**
 * Error state
 */
function ErrorState({
  error,
  onRetry,
  onGoBack,
}: {
  error: string;
  onRetry: () => void;
  onGoBack: () => void;
}) {
  const isNotFound = error.includes('not found') || error.includes('404');

  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorIcon}>{isNotFound ? '🔍' : '⚠️'}</Text>
      <Text style={styles.errorTitle}>
        {isNotFound ? 'Slip Not Found' : 'Error Loading Slip'}
      </Text>
      <Text style={styles.errorMessage}>{error}</Text>
      <View style={styles.errorButtons}>
        <Pressable style={styles.secondaryButton} onPress={onGoBack}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </Pressable>
        {!isNotFound && (
          <Pressable style={styles.primaryButton} onPress={onRetry}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export default function SlipDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Fetch slip data
  const { slip, isLoading, error, refresh } = useSlipDetail({
    slipId: id || '',
    autoFetch: !!id,
  });

  // =====================================================
  // Handlers
  // =====================================================

  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  const renderPick = useCallback(
    ({ item }: { item: ApiPickResponse }) => (
      <PickResultItem
        pick={item}
        showResult={isSlipSettled(slip?.status || 'PENDING')}
      />
    ),
    [slip?.status]
  );

  const keyExtractor = useCallback((item: ApiPickResponse) => item.id, []);

  // =====================================================
  // Render
  // =====================================================

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Slip Details' }} />
        <LoadingState />
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !slip) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Slip Details' }} />
        <ErrorState
          error={error || 'Failed to load slip'}
          onRetry={refresh}
          onGoBack={handleGoBack}
        />
      </SafeAreaView>
    );
  }

  // Calculate derived values
  const isSettled = isSlipSettled(slip.status);
  const correctCount = slip.picks.filter(
    (p) => p.status.toUpperCase() === 'CORRECT'
  ).length;
  const incorrectCount = slip.picks.filter(
    (p) => p.status.toUpperCase() === 'INCORRECT'
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Slip Details',
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.headerSection}>
          {/* Status Badge */}
          <View style={styles.statusRow}>
            <SlipStatusBadge status={slip.status as SlipStatus} size="md" />
            <Text style={styles.dateText}>
              {formatSlipDate(slip.lockedAt || slip.createdAt)}
            </Text>
          </View>

          {/* Points Display */}
          <PointsDisplay
            status={slip.status as SlipStatus}
            pointPotential={slip.pointPotential}
            pointsEarned={slip.pointsEarned}
            variant="full"
          />
        </View>

        {/* Metadata Section */}
        <View style={styles.metadataSection}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Picks</Text>
            <Text style={styles.metadataValue}>
              {slip.totalPicks} {slip.totalPicks === 1 ? 'pick' : 'picks'}
            </Text>
          </View>

          {isSettled && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Results</Text>
              <View style={styles.resultsRow}>
                <Text style={styles.correctText}>{correctCount} correct</Text>
                <Text style={styles.metadataSeparator}>•</Text>
                <Text style={styles.incorrectText}>{incorrectCount} incorrect</Text>
              </View>
            </View>
          )}

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Created</Text>
            <Text style={styles.metadataValue}>
              {formatFullDate(slip.createdAt)}
            </Text>
          </View>

          {slip.lockedAt && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Locked</Text>
              <Text style={styles.metadataValue}>
                {formatFullDate(slip.lockedAt)}
              </Text>
            </View>
          )}

          {slip.settledAt && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Settled</Text>
              <Text style={styles.metadataValue}>
                {formatFullDate(slip.settledAt)}
              </Text>
            </View>
          )}
        </View>

        {/* Picks Section */}
        <View style={styles.picksSection}>
          <Text style={styles.picksSectionTitle}>Picks</Text>

          <FlatList
            data={slip.picks}
            renderItem={renderPick}
            keyExtractor={keyExtractor}
            scrollEnabled={false}
            contentContainerStyle={styles.picksList}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  // Center Container (Loading/Error)
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 15,
    marginTop: 16,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorMessage: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
  },
  secondaryButtonText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
  // Header Section
  headerSection: {
    padding: 16,
    gap: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  // Metadata Section
  metadataSection: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metadataLabel: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  metadataValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  metadataSeparator: {
    color: '#6b7280',
    marginHorizontal: 6,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  correctText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
  incorrectText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  // Picks Section
  picksSection: {
    padding: 16,
  },
  picksSectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  picksList: {
    gap: 0,
  },
});
