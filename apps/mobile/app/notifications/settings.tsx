// =====================================================
// Notification Settings Screen
// =====================================================
// Allows users to fine-tune which notifications they
// receive, configure quiet hours, and set digest timing.
//
// Layout:
//   Master toggle (all notifications)
//   ─────────────────────────────────
//   Section: High Priority
//     Settlement, PvP Challenge, Slip Expiring
//   Section: Game Updates
//     Game Reminder, Social, Leaderboard
//   Section: Engagement
//     Daily Digest, Weekly Recap, Win Streak, Inactivity
//   Section: Quiet Hours
//     Enable toggle + start / end times
//   Section: Digest Schedule
//     Preferred time + recap day
//
// Each toggle row uses optimistic updates via
// useUpdateNotificationPreferences so switches feel
// instant with no visible latency.

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LUXURY_THEME } from '../../src/constants/theme';
import { GlassCard } from '../../src/components/ui/GlassCard';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../src/hooks/useNotificationPreferences';
import type { NotificationPreferenceDTO } from '@pick-rivals/shared-types';

// ---- Day of week label helpers --------------------------

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function dayLabel(n: number): string {
  return DAY_LABELS[n] ?? 'Mon';
}

// ---- Toggle Row Component --------------------------------

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isLast?: boolean;
  disabled?: boolean;
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  isLast = false,
  disabled = false,
}: ToggleRowProps): React.ReactElement {
  return (
    <View style={[styles.toggleRow, !isLast && styles.toggleRowBorder]}>
      <View style={styles.toggleTextBlock}>
        <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>
          {label}
        </Text>
        <Text style={[styles.toggleDesc, disabled && styles.toggleDescDisabled]}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: LUXURY_THEME.surface.elevated,
          true: LUXURY_THEME.gold.main,
        }}
        thumbColor={LUXURY_THEME.text.primary}
        // iOS: tint the off-track subtly
        ios_backgroundColor={LUXURY_THEME.surface.elevated}
      />
    </View>
  );
}

// ---- Info Row (read-only display) -----------------------

interface InfoRowProps {
  label: string;
  value: string;
  isLast?: boolean;
}

function InfoRow({ label, value, isLast = false }: InfoRowProps): React.ReactElement {
  return (
    <View style={[styles.infoRow, !isLast && styles.toggleRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// ---- Section Header ------------------------------------

interface SectionHeaderProps {
  title: string;
}

function SectionHeader({ title }: SectionHeaderProps): React.ReactElement {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ---- Main Screen ----------------------------------------

export default function NotificationSettingsScreen(): React.ReactElement {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const { mutate } = useUpdateNotificationPreferences();

  // Convenience: fire a single-field update
  const update = useCallback(
    (field: keyof NotificationPreferenceDTO, value: boolean | string | number) => {
      mutate({ [field]: value } as Partial<NotificationPreferenceDTO>);
    },
    [mutate]
  );

  // While loading show a centred spinner
  if (isLoading || !prefs) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color={LUXURY_THEME.gold.main} />
      </SafeAreaView>
    );
  }

  const allEnabled = prefs.allNotificationsEnabled;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Master Toggle ---------------------------------- */}
        <GlassCard style={styles.card}>
          <ToggleRow
            label="All Notifications"
            description="Enable or silence every notification at once"
            value={allEnabled}
            onValueChange={(v) => update('allNotificationsEnabled', v)}
            isLast
          />
        </GlassCard>

        {/* ---- High Priority ---------------------------------- */}
        <SectionHeader title="HIGH PRIORITY" />
        <GlassCard style={styles.card}>
          <ToggleRow
            label="Settlement"
            description="Know instantly when your slip or match settles"
            value={prefs.settlementEnabled}
            onValueChange={(v) => update('settlementEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="PvP Challenge"
            description="Receive head-to-head challenge invitations"
            value={prefs.pvpChallengeEnabled}
            onValueChange={(v) => update('pvpChallengeEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Slip Expiring"
            description="Alert before an active slip lock-in expires"
            value={prefs.slipExpiringEnabled}
            onValueChange={(v) => update('slipExpiringEnabled', v)}
            disabled={!allEnabled}
            isLast
          />
        </GlassCard>

        {/* ---- Game Updates ----------------------------------- */}
        <SectionHeader title="GAME UPDATES" />
        <GlassCard style={styles.card}>
          <ToggleRow
            label="Game Reminder"
            description="Reminder before an event you have picks on starts"
            value={prefs.gameReminderEnabled}
            onValueChange={(v) => update('gameReminderEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Social"
            description="Friend requests, mentions, and reactions"
            value={prefs.socialEnabled}
            onValueChange={(v) => update('socialEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Leaderboard"
            description="Weekly rank movements and milestones"
            value={prefs.leaderboardEnabled}
            onValueChange={(v) => update('leaderboardEnabled', v)}
            disabled={!allEnabled}
            isLast
          />
        </GlassCard>

        {/* ---- Engagement ------------------------------------- */}
        <SectionHeader title="ENGAGEMENT" />
        <GlassCard style={styles.card}>
          <ToggleRow
            label="Daily Digest"
            description="A summary of today's picks and results each morning"
            value={prefs.dailyDigestEnabled}
            onValueChange={(v) => update('dailyDigestEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Weekly Recap"
            description="Your performance summary for the past week"
            value={prefs.weeklyRecapEnabled}
            onValueChange={(v) => update('weeklyRecapEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Win Streak"
            description="Celebrate when you hit a new streak milestone"
            value={prefs.winStreakEnabled}
            onValueChange={(v) => update('winStreakEnabled', v)}
            disabled={!allEnabled}
          />
          <ToggleRow
            label="Inactivity"
            description="Nudge if you haven't placed a pick in a while"
            value={prefs.inactivityEnabled}
            onValueChange={(v) => update('inactivityEnabled', v)}
            disabled={!allEnabled}
            isLast
          />
        </GlassCard>

        {/* ---- Quiet Hours ------------------------------------ */}
        <SectionHeader title="QUIET HOURS" />
        <GlassCard style={styles.card}>
          <ToggleRow
            label="Quiet Hours"
            description="Suppress all non-urgent notifications during these hours"
            value={prefs.quietHoursEnabled}
            onValueChange={(v) => update('quietHoursEnabled', v)}
            disabled={!allEnabled}
          />
          <InfoRow
            label="Start time"
            value={prefs.quietHoursStart}
          />
          <InfoRow
            label="End time"
            value={prefs.quietHoursEnd}
            isLast
          />
        </GlassCard>

        {/* ---- Digest Schedule -------------------------------- */}
        <SectionHeader title="DIGEST SCHEDULE" />
        <GlassCard style={styles.card}>
          <InfoRow
            label="Digest time"
            value={prefs.digestTimeLocal}
          />
          <InfoRow
            label="Recap day"
            value={dayLabel(prefs.recapDayOfWeek)}
            isLast
          />
        </GlassCard>

        {/* Bottom spacer for floating tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- Styles ---------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: LUXURY_THEME.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ---- Section Header ------------------------------------
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: LUXURY_THEME.text.muted,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  // ---- Card spacing --------------------------------------
  card: {
    marginBottom: LUXURY_THEME.spacing.cardGap,
  },

  // ---- Toggle Row ----------------------------------------
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  toggleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: LUXURY_THEME.border.muted,
  },
  toggleTextBlock: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: LUXURY_THEME.text.primary,
    lineHeight: 20,
  },
  toggleLabelDisabled: {
    color: LUXURY_THEME.text.muted,
  },
  toggleDesc: {
    fontSize: 12,
    color: LUXURY_THEME.text.secondary,
    marginTop: 2,
    lineHeight: 17,
  },
  toggleDescDisabled: {
    color: LUXURY_THEME.text.muted,
  },

  // ---- Info Row ------------------------------------------
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: LUXURY_THEME.text.secondary,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: LUXURY_THEME.gold.main,
  },

  // ---- Bottom spacer -------------------------------------
  bottomSpacer: {
    height: 100,
  },
});
