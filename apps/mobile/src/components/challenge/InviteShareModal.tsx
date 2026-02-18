// =====================================================
// Invite Share Modal
// =====================================================
// Post-creation modal to display invite link with sharing options.
// Shows slip summary and provides copy/share functionality.

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Share,
  Platform,
  Clipboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ConfettiIcon, CheckIcon } from 'phosphor-react-native';
import type { Match } from '@pick-rivals/shared-types';
import { LUXURY_THEME } from '../../constants/theme';

import { DraftPick } from '../../types/slip.types';
import { PickItem } from '../slip/PickItem';
import { formatInviteUrl, formatShareMessage } from '../../utils/deep-link-handler';

// =====================================================
// Types
// =====================================================

interface InviteShareModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Match object with invite code */
  match: Match;
  /** Slip summary with picks and point potential */
  slipSummary: {
    picks: DraftPick[];
    pointPotential: number;
  };
  /** Called when user closes the modal */
  onClose: () => void;
  /** Optional callback after successful share */
  onShare?: () => void;
}

// =====================================================
// Component
// =====================================================

export function InviteShareModal({
  visible,
  match,
  slipSummary,
  onClose,
  onShare,
}: InviteShareModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareInProgress, setShareInProgress] = useState(false);

  // Format invite URL
  const inviteUrl = match.inviteCode ? formatInviteUrl(match.inviteCode) : null;

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (!inviteUrl) return;

    try {
      // Use React Native's built-in Clipboard
      Clipboard.setString(inviteUrl);

      // Haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Show success state
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Could show error toast here
    }
  };

  // Handle native share
  const handleShare = async () => {
    if (!inviteUrl || !match.inviteCode) return;

    setShareInProgress(true);

    try {
      const message = formatShareMessage(match.stakeAmount, inviteUrl);

      const result = await Share.share({
        title: 'Join my PickRivals Challenge!',
        message,
        url: inviteUrl, // iOS uses this field
      });

      if (result.action === Share.sharedAction) {
        // Successfully shared
        onShare?.();
      }
      // If result.action === Share.dismissedAction, user cancelled - do nothing
    } catch (error) {
      console.error('Failed to share:', error);
      // Could show error toast here
    } finally {
      setShareInProgress(false);
    }
  };

  // Render pick item in compact mode
  const renderPickItem = ({ item }: { item: DraftPick }) => (
    <PickItem pick={item} compact showRemove={false} />
  );

  // If no invite code, show degraded state
  const hasInviteCode = !!match.inviteCode;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <BlurView intensity={80} tint="dark" style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <ConfettiIcon size={48} color={LUXURY_THEME.gold.main} weight="duotone" />
            </View>
            <Text style={styles.title}>Challenge Created!</Text>
            <Text style={styles.subtitle}>
              {hasInviteCode
                ? 'Share this link to invite opponents'
                : 'Your challenge has been created'}
            </Text>
          </View>

          {/* Slip Summary */}
          <View style={styles.slipSection}>
            <Text style={styles.sectionTitle}>Your Picks</Text>
            <View style={styles.picksContainer}>
              <FlatList
                data={slipSummary.picks}
                renderItem={renderPickItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={styles.pickSeparator} />}
                scrollEnabled={slipSummary.picks.length > 3}
              />
            </View>
            <View style={styles.pointsRow}>
              <Text style={styles.pointsLabel}>Point Potential</Text>
              <Text style={styles.pointsValue}>{slipSummary.pointPotential}</Text>
            </View>
          </View>

          {/* Invite Code Section - Only show if invite code exists */}
          {hasInviteCode && inviteUrl && (
            <View style={styles.inviteSection}>
              <Text style={styles.sectionTitle}>Invite Link</Text>
              <Pressable
                style={styles.inviteCodeCard}
                onPress={handleCopy}
                disabled={copySuccess}
              >
                <View style={styles.inviteCodeContent}>
                  <Text style={styles.inviteCodeLabel}>Invite Code</Text>
                  <Text style={styles.inviteCodeValue}>{match.inviteCode}</Text>
                </View>
                <View style={styles.copyButton}>
                  {copySuccess ? (
                    <View style={styles.copiedContent}>
                      <CheckIcon size={14} color="#22c55e" weight="bold" />
                      <Text style={[styles.copyButtonText, styles.copiedText]}>Copied</Text>
                    </View>
                  ) : (
                    <Text style={styles.copyButtonText}>Copy</Text>
                  )}
                </View>
              </Pressable>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Share Button - Only show if invite code exists */}
            {hasInviteCode && (
              <Pressable
                style={[
                  styles.shareButton,
                  shareInProgress && styles.shareButtonDisabled,
                ]}
                onPress={handleShare}
                disabled={shareInProgress}
              >
                {shareInProgress ? (
                  <View style={styles.sharingContent}>
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text style={styles.shareButtonText}>Sharing...</Text>
                  </View>
                ) : (
                  <Text style={styles.shareButtonText}>Share Challenge</Text>
                )}
              </Pressable>
            )}

            {/* Close Button */}
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>
                {hasInviteCode ? 'Close' : 'Done'}
              </Text>
            </Pressable>
          </View>

          {/* Hint Text */}
          {hasInviteCode && (
            <Text style={styles.hint}>
              Opponents can join your challenge using this invite link
            </Text>
          )}
        </View>
      </BlurView>
    </Modal>
  );
}

// =====================================================
// Styles
// =====================================================

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 20,
    paddingBottom: 32,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  headerIcon: {
    marginBottom: 8,
  },
  title: {
    color: '#22c55e',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
  },

  // Slip Summary Section
  slipSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  picksContainer: {
    maxHeight: 200,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  pickSeparator: {
    height: 8,
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
  },
  pointsLabel: {
    color: '#9ca3af',
    fontSize: 15,
  },
  pointsValue: {
    color: '#22c55e',
    fontSize: 24,
    fontWeight: '800',
  },

  // Invite Section
  inviteSection: {
    marginBottom: 20,
  },
  inviteCodeCard: {
    backgroundColor: '#0f0f23',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  inviteCodeContent: {
    flex: 1,
  },
  inviteCodeLabel: {
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  inviteCodeValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 2,
  },
  copyButton: {
    backgroundColor: '#2a2a3e',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  copyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  copiedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copiedText: {
    color: '#22c55e',
  },

  // Action Buttons
  buttonContainer: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shareButtonDisabled: {
    backgroundColor: '#16a34a',
    opacity: 0.8,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  sharingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closeButton: {
    backgroundColor: '#2a2a3e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Hint
  hint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default InviteShareModal;
