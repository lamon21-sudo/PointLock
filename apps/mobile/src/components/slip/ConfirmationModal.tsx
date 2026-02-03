// =====================================================
// Slip Confirmation Modal
// =====================================================
// Full-screen modal for slip submission confirmation.
// Shows all picks, point potential, and handles submission flow.

import React from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { DraftPick } from '../../types/slip.types';
import { PickItem } from './PickItem';
import { PointPotential } from './PointPotential';

// =====================================================
// Types
// =====================================================

interface ConfirmationModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Picks to display in the modal */
  picks: DraftPick[];
  /** Total point potential */
  pointPotential: number;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Error message from submission attempt */
  error?: string | null;
  /** Called when user confirms submission */
  onConfirm: () => void;
  /** Called when user cancels (only works when not submitting) */
  onCancel: () => void;
}

// =====================================================
// Component
// =====================================================

export function ConfirmationModal({
  visible,
  picks,
  pointPotential,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  // Render pick item in compact mode without remove button
  const renderItem = ({ item }: { item: DraftPick }) => (
    <PickItem pick={item} compact showRemove={false} />
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        // Only allow back button dismiss when not submitting
        if (!isSubmitting) {
          onCancel();
        }
      }}
    >
      <BlurView intensity={80} tint="dark" style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Confirm Your Slip</Text>
            <Text style={styles.subtitle}>
              Review your picks before locking
            </Text>
          </View>

          {/* Picks List */}
          <View style={styles.picksContainer}>
            <FlatList
              data={picks}
              renderItem={renderItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>

          {/* Summary */}
          <View style={styles.summaryContainer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Picks</Text>
              <Text style={styles.summaryValue}>{picks.length}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Point Potential</Text>
              <PointPotential value={pointPotential} size="md" showLabel={false} />
            </View>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            {/* Cancel Button */}
            <Pressable
              style={[
                styles.cancelButton,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={onCancel}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  isSubmitting && styles.textDisabled,
                ]}
              >
                Cancel
              </Text>
            </Pressable>

            {/* Confirm Button */}
            <Pressable
              style={[
                styles.confirmButton,
                isSubmitting && styles.confirmButtonSubmitting,
              ]}
              onPress={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <View style={styles.submittingContent}>
                  <ActivityIndicator color="#ffffff" size="small" />
                  <Text style={styles.confirmButtonText}>Locking...</Text>
                </View>
              ) : (
                <Text style={styles.confirmButtonText}>Lock Slip</Text>
              )}
            </Pressable>
          </View>

          {/* Disclaimer */}
          <Text style={styles.disclaimer}>
            Once locked, your picks cannot be changed.
          </Text>
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
  header: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 15,
  },
  picksContainer: {
    maxHeight: 300,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 8,
  },
  summaryContainer: {
    backgroundColor: '#0f0f23',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    color: '#9ca3af',
    fontSize: 15,
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    marginHorizontal: 20,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2a2a3e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
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
  confirmButtonSubmitting: {
    backgroundColor: '#16a34a',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  submittingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    opacity: 0.5,
  },
  disclaimer: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default ConfirmationModal;
