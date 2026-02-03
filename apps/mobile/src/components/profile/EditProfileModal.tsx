// =====================================================
// Edit Profile Modal
// =====================================================
// Bottom sheet modal for editing user profile.
// Allows changing display name and avatar selection.

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { AvatarSelector } from './AvatarSelector';
import { getAvatarEmoji } from '../../types/profile.types';
import { LUXURY_THEME } from '../../constants/theme';

// =====================================================
// Types
// =====================================================

interface EditProfileModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Current display name (null = username) */
  currentDisplayName: string | null;
  /** Current avatar ID (null = default) */
  currentAvatarId: string | null;
  /** Called when user saves changes */
  onSave: (data: { displayName: string; avatarId: string | null }) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Whether save operation is in progress */
  isSaving: boolean;
  /** Error message from save attempt */
  error?: string | null;
}

// =====================================================
// Constants
// =====================================================

const MIN_DISPLAY_NAME_LENGTH = 2;
const MAX_DISPLAY_NAME_LENGTH = 30;

// =====================================================
// Component
// =====================================================

export function EditProfileModal({
  visible,
  currentDisplayName,
  currentAvatarId,
  onSave,
  onCancel,
  isSaving,
  error,
}: EditProfileModalProps) {
  // Local state for form inputs
  const [displayName, setDisplayName] = useState(currentDisplayName || '');
  const [avatarId, setAvatarId] = useState<string | null>(currentAvatarId);

  // Initialize form when modal opens
  useEffect(() => {
    if (visible) {
      setDisplayName(currentDisplayName || '');
      setAvatarId(currentAvatarId);
    }
  }, [visible, currentDisplayName, currentAvatarId]);

  // Track if user has made changes
  const hasChanges =
    displayName.trim() !== (currentDisplayName || '').trim() ||
    avatarId !== currentAvatarId;

  // Validate display name
  const isValidDisplayName =
    displayName.trim().length >= MIN_DISPLAY_NAME_LENGTH &&
    displayName.trim().length <= MAX_DISPLAY_NAME_LENGTH;

  // Disable save when: saving, no changes, or validation fails
  const canSave = !isSaving && hasChanges && isValidDisplayName;

  // Character count for display name
  const characterCount = displayName.trim().length;

  // Show validation hint when user has typed but invalid
  const showValidationHint =
    displayName.trim().length > 0 && !isValidDisplayName;

  // Handle save
  const handleSave = () => {
    if (canSave) {
      onSave({
        displayName: displayName.trim(),
        avatarId,
      });
    }
  };

  // Get current avatar emoji for preview
  const currentAvatarEmoji = getAvatarEmoji(avatarId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        // Only allow back button dismiss when not saving
        if (!isSaving) {
          onCancel();
        }
      }}
    >
      <BlurView intensity={80} tint="dark" style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Profile</Text>
            <Text style={styles.subtitle}>
              Customize your display name and avatar
            </Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {/* Avatar Section */}
            <View style={styles.section}>
              {/* Current Avatar Preview */}
              <View style={styles.avatarPreview}>
                <View style={styles.avatarCircleLarge}>
                  <Text style={styles.avatarEmojiLarge}>
                    {currentAvatarEmoji}
                  </Text>
                </View>
              </View>

              {/* Avatar Selector */}
              <AvatarSelector
                selectedAvatarId={avatarId}
                onSelect={setAvatarId}
              />
            </View>

            {/* Display Name Section */}
            <View style={styles.section}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter display name"
                placeholderTextColor="#6b7280"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                editable={!isSaving}
              />

              {/* Character Count */}
              <View style={styles.inputFooter}>
                <Text
                  style={[
                    styles.characterCount,
                    characterCount > MAX_DISPLAY_NAME_LENGTH &&
                      styles.characterCountOver,
                  ]}
                >
                  {characterCount}/{MAX_DISPLAY_NAME_LENGTH}
                </Text>
              </View>

              {/* Validation Hint */}
              {showValidationHint && (
                <Text style={styles.validationHint}>
                  Display name must be {MIN_DISPLAY_NAME_LENGTH}-
                  {MAX_DISPLAY_NAME_LENGTH} characters
                </Text>
              )}
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
              style={[styles.cancelButton, isSaving && styles.buttonDisabled]}
              onPress={onCancel}
              disabled={isSaving}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  isSaving && styles.textDisabled,
                ]}
              >
                Cancel
              </Text>
            </Pressable>

            {/* Save Button */}
            <Pressable
              style={[
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!canSave}
            >
              {isSaving ? (
                <View style={styles.savingContent}>
                  <ActivityIndicator color={LUXURY_THEME.bg.primary} size="small" />
                  <Text style={styles.saveButtonText}>Saving...</Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
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
    backgroundColor: LUXURY_THEME.surface.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    color: LUXURY_THEME.text.primary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: LUXURY_THEME.text.secondary,
    fontSize: 15,
  },
  content: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  avatarPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircleLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LUXURY_THEME.surface.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmojiLarge: {
    fontSize: 40,
    lineHeight: 48,
  },
  label: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    backgroundColor: LUXURY_THEME.bg.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: LUXURY_THEME.border.muted,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  characterCount: {
    color: LUXURY_THEME.text.muted,
    fontSize: 13,
  },
  characterCountOver: {
    color: LUXURY_THEME.status.error,
  },
  validationHint: {
    color: LUXURY_THEME.status.warning,
    fontSize: 13,
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 92, 108, 0.15)',
    marginHorizontal: 20,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 92, 108, 0.3)',
  },
  errorText: {
    color: LUXURY_THEME.status.error,
    fontSize: 14,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: LUXURY_THEME.surface.elevated,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  cancelButtonText: {
    color: LUXURY_THEME.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 2,
    backgroundColor: LUXURY_THEME.gold.vibrant,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    shadowColor: LUXURY_THEME.gold.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  saveButtonDisabled: {
    backgroundColor: LUXURY_THEME.surface.elevated,
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  saveButtonText: {
    color: LUXURY_THEME.bg.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  savingContent: {
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
});

export default EditProfileModal;
