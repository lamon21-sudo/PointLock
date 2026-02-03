// =====================================================
// PlayerPropsSection Component - Player Props Display
// =====================================================
// Displays available player props for an event with
// collapsible player cards and Over/Under selection.

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { PropOdds, formatOdds, formatPropType } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';
import { OddsButton } from './OddsButton';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// =====================================================
// Types
// =====================================================

interface PlayerPropsSectionProps {
  props: PropOdds[];
  eventId: string;
  onPropSelect: (prop: PropOdds, selection: 'over' | 'under') => void;
  selectedPropIds: Set<string>;
  disabled?: boolean;
}

interface PlayerGroup {
  playerName: string;
  props: PropOdds[];
}

// =====================================================
// Sub-components
// =====================================================

interface PlayerPropRowProps {
  prop: PropOdds;
  eventId: string;
  onSelect: (prop: PropOdds, selection: 'over' | 'under') => void;
  isOverSelected: boolean;
  isUnderSelected: boolean;
  disabled: boolean;
}

function PlayerPropRow({
  prop,
  onSelect,
  isOverSelected,
  isUnderSelected,
  disabled,
}: PlayerPropRowProps) {
  return (
    <View style={styles.propRow}>
      <View style={styles.propInfo}>
        <Text style={styles.propType}>{formatPropType(prop.propType)}</Text>
        <Text style={styles.propLine}>{prop.line}</Text>
      </View>
      <View style={styles.propButtons}>
        <View style={styles.oddsButtonWrapper}>
          <OddsButton
            label={`O ${prop.line}`}
            odds={formatOdds(prop.over)}
            isSelected={isOverSelected}
            disabled={disabled || isUnderSelected}
            onPress={() => onSelect(prop, 'over')}
            pickType="prop"
            selection="over"
            compact
          />
        </View>
        <View style={styles.oddsButtonWrapper}>
          <OddsButton
            label={`U ${prop.line}`}
            odds={formatOdds(prop.under)}
            isSelected={isUnderSelected}
            disabled={disabled || isOverSelected}
            onPress={() => onSelect(prop, 'under')}
            pickType="prop"
            selection="under"
            compact
          />
        </View>
      </View>
    </View>
  );
}

// =====================================================
// Main Component
// =====================================================

export function PlayerPropsSection({
  props,
  eventId,
  onPropSelect,
  selectedPropIds,
  disabled = false,
}: PlayerPropsSectionProps): React.ReactElement {
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  // Group props by player
  const playerGroups = useMemo(() => {
    const groups = new Map<string, PropOdds[]>();

    for (const prop of props) {
      const existing = groups.get(prop.playerName) || [];
      existing.push(prop);
      groups.set(prop.playerName, existing);
    }

    return Array.from(groups.entries()).map(
      ([playerName, playerProps]): PlayerGroup => ({
        playerName,
        props: playerProps,
      })
    );
  }, [props]);

  const togglePlayer = useCallback((playerName: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedPlayer((current) => (current === playerName ? null : playerName));
  }, []);

  const renderPlayerCard = useCallback(
    ({ item }: { item: PlayerGroup }) => {
      const isExpanded = expandedPlayer === item.playerName;
      const hasSelection = item.props.some(
        (p) =>
          selectedPropIds.has(`${eventId}-${p.propType}-${p.playerName}-over`) ||
          selectedPropIds.has(`${eventId}-${p.propType}-${p.playerName}-under`)
      );

      return (
        <View style={styles.playerCard}>
          <Pressable
            style={[styles.playerHeader, hasSelection && styles.playerHeaderSelected]}
            onPress={() => togglePlayer(item.playerName)}
            accessibilityRole="button"
            accessibilityLabel={`${item.playerName}, ${item.props.length} props available`}
            accessibilityState={{ expanded: isExpanded }}
          >
            <Text style={styles.playerName}>{item.playerName}</Text>
            <Text style={styles.propsCount}>{item.props.length} props</Text>
            <Text style={styles.expandIcon}>{isExpanded ? '−' : '+'}</Text>
          </Pressable>

          {isExpanded && (
            <View style={styles.propsContainer}>
              {item.props.map((prop) => {
                const overKey = `${eventId}-${prop.propType}-${prop.playerName}-over`;
                const underKey = `${eventId}-${prop.propType}-${prop.playerName}-under`;

                return (
                  <PlayerPropRow
                    key={`${prop.propType}-${prop.playerName}`}
                    prop={prop}
                    eventId={eventId}
                    onSelect={onPropSelect}
                    isOverSelected={selectedPropIds.has(overKey)}
                    isUnderSelected={selectedPropIds.has(underKey)}
                    disabled={disabled}
                  />
                );
              })}
            </View>
          )}
        </View>
      );
    },
    [expandedPlayer, eventId, onPropSelect, selectedPropIds, disabled, togglePlayer]
  );

  if (props.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No player props available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>PLAYER PROPS</Text>
      <FlatList
        data={playerGroups}
        renderItem={renderPlayerCard}
        keyExtractor={(item) => item.playerName}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.subtle,
    paddingTop: 16,
  },
  sectionTitle: {
    color: LUXURY_THEME.gold.main,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  playerCard: {
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.muted,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(212, 175, 55, 0.03)',
  },
  playerHeaderSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: LUXURY_THEME.gold.main,
  },
  playerName: {
    flex: 1,
    color: LUXURY_THEME.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  propsCount: {
    color: LUXURY_THEME.text.muted,
    fontSize: 12,
    marginRight: 12,
  },
  expandIcon: {
    color: LUXURY_THEME.gold.main,
    fontSize: 20,
    fontWeight: '600',
    width: 24,
    textAlign: 'center',
  },
  propsContainer: {
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.muted,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  propInfo: {
    flex: 1,
    marginRight: 12,
  },
  propType: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 13,
    fontWeight: '500',
  },
  propLine: {
    color: LUXURY_THEME.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  propButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  oddsButtonWrapper: {
    width: 72,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.subtle,
    marginTop: 16,
  },
  emptyText: {
    color: LUXURY_THEME.text.muted,
    fontSize: 13,
  },
});

export default PlayerPropsSection;
