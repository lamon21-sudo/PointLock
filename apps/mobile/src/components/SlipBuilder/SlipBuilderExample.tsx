// =====================================================
// Slip Builder Example Component
// =====================================================
// Demonstrates useSlipStore usage and verifies persistence.
// This file serves as both documentation and a test component.

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  useSlipStore,
  useSlipStoreHydration,
  usePointPotential,
  usePicksCount,
  useIsSlipEmpty,
  useIsSlipFull,
  selectPicksByEvent,
} from '../../stores/slip.store';
import { AddPickInput, SLIP_MAX_PICKS } from '../../types/slip.types';

// =====================================================
// Mock Data for Testing
// =====================================================

const MOCK_PICKS: AddPickInput[] = [
  {
    sportsEventId: 'event-1',
    pickType: 'moneyline',
    selection: 'home',
    line: null,
    odds: -150,
    eventInfo: {
      homeTeamName: 'Kansas City Chiefs',
      homeTeamAbbr: 'KC',
      awayTeamName: 'Las Vegas Raiders',
      awayTeamAbbr: 'LV',
      scheduledAt: new Date().toISOString(),
      sport: 'NFL',
      league: 'NFL',
    },
  },
  {
    sportsEventId: 'event-2',
    pickType: 'spread',
    selection: 'away',
    line: 3.5,
    odds: -110,
    eventInfo: {
      homeTeamName: 'Los Angeles Lakers',
      homeTeamAbbr: 'LAL',
      awayTeamName: 'Boston Celtics',
      awayTeamAbbr: 'BOS',
      scheduledAt: new Date().toISOString(),
      sport: 'NBA',
      league: 'NBA',
    },
  },
  {
    sportsEventId: 'event-3',
    pickType: 'total',
    selection: 'over',
    line: 220.5,
    odds: -105,
    eventInfo: {
      homeTeamName: 'Golden State Warriors',
      homeTeamAbbr: 'GSW',
      awayTeamName: 'Phoenix Suns',
      awayTeamAbbr: 'PHX',
      scheduledAt: new Date().toISOString(),
      sport: 'NBA',
      league: 'NBA',
    },
  },
];

// =====================================================
// Example Component
// =====================================================

export function SlipBuilderExample(): React.ReactElement {
  // Hydration check - critical for persistence
  const isHydrated = useSlipStoreHydration();

  // Selectors - each only triggers re-render when its value changes
  const pointPotential = usePointPotential();
  const picksCount = usePicksCount();
  const isEmpty = useIsSlipEmpty();
  const isFull = useIsSlipFull();

  // Direct store access for actions and picks
  const picks = useSlipStore((state) => state.picks);
  const addPick = useSlipStore((state) => state.addPick);
  const removePick = useSlipStore((state) => state.removePick);
  const clearSlip = useSlipStore((state) => state.clearSlip);
  const hasPick = useSlipStore((state) => state.hasPick);

  // Grouped picks selector
  const picksByEvent = useSlipStore(selectPicksByEvent);

  // Loading state during hydration
  if (!isHydrated) {
    return (
      <View style={styles.container}>
        <View style={styles.skeleton}>
          <Text style={styles.skeletonText}>Loading saved picks...</Text>
        </View>
      </View>
    );
  }

  // =====================================================
  // Handlers
  // =====================================================

  const handleAddMockPick = (mockPick: AddPickInput) => {
    const error = addPick(mockPick);
    if (error) {
      Alert.alert('Cannot Add Pick', error);
    }
  };

  const handleClearSlip = () => {
    Alert.alert(
      'Clear Slip',
      'Are you sure you want to remove all picks?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearSlip },
      ]
    );
  };

  // =====================================================
  // Render
  // =====================================================

  return (
    <ScrollView style={styles.container}>
      {/* Header Stats */}
      <View style={styles.header}>
        <Text style={styles.title}>Slip Builder</Text>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{picksCount}/{SLIP_MAX_PICKS}</Text>
            <Text style={styles.statLabel}>Picks</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{pointPotential}</Text>
            <Text style={styles.statLabel}>Point Potential</Text>
          </View>
        </View>
      </View>

      {/* Status Indicators */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, isEmpty && styles.statusActive]}>
          <Text style={styles.statusText}>Empty: {isEmpty ? 'Yes' : 'No'}</Text>
        </View>
        <View style={[styles.statusBadge, isFull && styles.statusWarning]}>
          <Text style={styles.statusText}>Full: {isFull ? 'Yes' : 'No'}</Text>
        </View>
      </View>

      {/* Add Mock Picks */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Test Picks</Text>
        {MOCK_PICKS.map((mockPick, index) => {
          const isInSlip = hasPick(mockPick.sportsEventId, mockPick.pickType, mockPick.selection);
          return (
            <Pressable
              key={`mock-${index}`}
              style={[styles.addButton, isInSlip && styles.addButtonDisabled]}
              onPress={() => handleAddMockPick(mockPick)}
              disabled={isInSlip}
            >
              <Text style={styles.addButtonText}>
                {isInSlip ? 'Added ' : '+ '}
                {mockPick.eventInfo.awayTeamAbbr} @ {mockPick.eventInfo.homeTeamAbbr}
                {' • '}
                {mockPick.pickType} ({mockPick.selection})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Current Picks */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Current Picks</Text>
          {!isEmpty && (
            <Pressable style={styles.clearButton} onPress={handleClearSlip}>
              <Text style={styles.clearButtonText}>Clear All</Text>
            </Pressable>
          )}
        </View>

        {isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No picks yet</Text>
            <Text style={styles.emptySubtext}>Add picks from events to build your slip</Text>
          </View>
        ) : (
          picks.map((pick) => (
            <View key={pick.id} style={styles.pickCard}>
              <View style={styles.pickInfo}>
                <Text style={styles.pickTeams}>
                  {pick.eventInfo.awayTeamAbbr} @ {pick.eventInfo.homeTeamAbbr}
                </Text>
                <Text style={styles.pickDetails}>
                  {pick.pickType.toUpperCase()} • {pick.selection}
                  {pick.line !== null && ` (${pick.line > 0 ? '+' : ''}${pick.line})`}
                </Text>
                <Text style={styles.pickOdds}>
                  Odds: {pick.odds > 0 ? '+' : ''}{pick.odds} • {pick.pointValue} pts
                </Text>
              </View>
              <Pressable
                style={styles.removeButton}
                onPress={() => removePick(pick.id)}
                hitSlop={8}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Persistence Test Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Persistence Test</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Add some picks, then close and reopen the app.{'\n'}
            Your picks should be preserved automatically.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  skeleton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  skeletonText: {
    color: '#666',
    fontSize: 14,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  stats: {
    flexDirection: 'row',
    gap: 24,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#22c55e',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#222',
  },
  statusActive: {
    backgroundColor: '#1e3a5f',
  },
  statusWarning: {
    backgroundColor: '#5f3a1e',
  },
  statusText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '500',
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  addButtonDisabled: {
    backgroundColor: '#0d2818',
    borderColor: '#22c55e',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    color: '#444',
    fontSize: 14,
    marginTop: 4,
  },
  pickCard: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  pickInfo: {
    flex: 1,
  },
  pickTeams: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  pickDetails: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  pickOdds: {
    color: '#22c55e',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  removeButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  infoText: {
    color: '#8888aa',
    fontSize: 13,
    lineHeight: 20,
  },
});

export default SlipBuilderExample;
