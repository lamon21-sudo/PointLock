// =====================================================
// BettingTooltip Component
// =====================================================
// A small "?" icon that opens a compact definition modal.
// Designed to educate new users on betting concepts inline
// without navigating them away from the odds grid.
//
// UX decisions:
//   - 28x28 touch target (expands via hitSlop to 44pt minimum)
//   - Modal slides up from bottom so context is preserved
//   - "Learn More" chevron expands to the full long description
//   - Tap-anywhere-outside (backdrop press) dismisses

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { QuestionIcon, XIcon, CaretDownIcon, CaretUpIcon } from 'phosphor-react-native';

import { LUXURY_THEME } from '../../constants/theme';
import { BETTING_TERMS, BettingTerm } from '../../constants/betting-terms';
import { trackEvent } from '../../utils/analytics';
import { ANALYTICS_EVENTS } from '../../constants/analytics';

// =====================================================
// Types
// =====================================================

interface BettingTooltipProps {
  term: 'spread' | 'moneyline' | 'total' | 'parlay';
}

// =====================================================
// Component
// =====================================================

export function BettingTooltip({ term }: BettingTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const termData = BETTING_TERMS[term as BettingTerm];

  const handleOpen = useCallback(() => {
    setVisible(true);
    setExpanded(false); // Reset expanded state on each open
    trackEvent({
      name: ANALYTICS_EVENTS.TOOLTIP_OPENED,
      properties: { term },
    });
  }, [term]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const handleLearnMore = useCallback(() => {
    setExpanded((prev) => !prev);
    if (!expanded) {
      trackEvent({
        name: ANALYTICS_EVENTS.TOOLTIP_LEARN_MORE,
        properties: { term },
      });
    }
  }, [expanded, term]);

  if (!termData) return null;

  return (
    <>
      {/* Trigger icon */}
      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={`Learn about ${termData.title}`}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={styles.trigger}
      >
        <QuestionIcon
          size={14}
          color={LUXURY_THEME.gold.main}
          weight="bold"
        />
      </Pressable>

      {/* Definition Modal */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleClose}
      >
        <BlurView intensity={60} tint="dark" style={styles.backdrop}>
          {/* Backdrop tap to dismiss */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

          {/* Sheet */}
          <View style={styles.sheet}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTextBlock}>
                <Text style={styles.termLabel}>Betting Term</Text>
                <Text style={styles.termTitle}>{termData.title}</Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Close tooltip"
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <XIcon size={20} color={LUXURY_THEME.text.secondary} weight="bold" />
              </Pressable>
            </View>

            {/* Short description */}
            <Text style={styles.shortDescription}>{termData.short}</Text>

            {/* Learn More expander */}
            <Pressable
              style={styles.learnMoreButton}
              onPress={handleLearnMore}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse explanation' : 'Expand explanation'}
            >
              <Text style={styles.learnMoreText}>
                {expanded ? 'Show Less' : 'Learn More'}
              </Text>
              {expanded ? (
                <CaretUpIcon size={14} color={LUXURY_THEME.gold.main} weight="bold" />
              ) : (
                <CaretDownIcon size={14} color={LUXURY_THEME.gold.main} weight="bold" />
              )}
            </Pressable>

            {/* Long description — conditionally rendered */}
            {expanded && (
              <ScrollView
                style={styles.longDescriptionScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.longDescription}>{termData.long}</Text>
              </ScrollView>
            )}

            {/* Bottom safe area */}
            <View style={styles.bottomPad} />
          </View>
        </BlurView>
      </Modal>
    </>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  // Trigger
  trigger: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Backdrop
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },

  // Bottom sheet
  sheet: {
    backgroundColor: LUXURY_THEME.surface.raised,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: LUXURY_THEME.border.gold,
    // Shadow under sheet edge
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },

  // Handle
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: LUXURY_THEME.border.muted,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTextBlock: {
    flex: 1,
  },
  termLabel: {
    color: LUXURY_THEME.gold.main,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  termTitle: {
    color: LUXURY_THEME.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },

  // Short description
  shortDescription: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },

  // Learn more
  learnMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: LUXURY_THEME.border.subtle,
    marginBottom: 4,
  },
  learnMoreText: {
    color: LUXURY_THEME.gold.main,
    fontSize: 13,
    fontWeight: '600',
  },

  // Long description
  longDescriptionScroll: {
    maxHeight: 160,
  },
  longDescription: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 14,
    lineHeight: 21,
    paddingTop: 8,
    paddingBottom: 4,
  },

  // Bottom pad
  bottomPad: {
    height: Platform.OS === 'ios' ? 28 : 16,
  },
});

export default BettingTooltip;
