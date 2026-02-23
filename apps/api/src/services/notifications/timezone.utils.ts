// =====================================================
// Timezone Utilities for Notification Scheduling
// =====================================================
// Handles quiet hours, local day calculation, and timezone
// bucketing for scheduled notification delivery.
//
// Uses Intl.DateTimeFormat (Node 20+ native) — no external deps.
// All functions are pure and accept an optional `date` param
// for deterministic testing without time mocking.

// =====================================================
// Types
// =====================================================

export interface LocalTime {
  hours: number;
  minutes: number;
  totalMinutes: number;
}

// =====================================================
// Timezone Conversion
// =====================================================

/**
 * Get the current local time in a given IANA timezone.
 * Uses Intl.DateTimeFormat (Node 20+ native).
 *
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param date - Optional date to evaluate (defaults to now)
 * @returns LocalTime with hours (0-23), minutes, and totalMinutes
 */
export function getLocalTime(timezone: string, date?: Date): LocalTime {
  const d = date ?? new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  // Intl hour12: false can return '24' at midnight — normalize to 0
  const rawHour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const hours = rawHour === 24 ? 0 : rawHour;
  const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
  };
}

/**
 * Get the current local date string (YYYY-MM-DD) in a given timezone.
 * Used as the key component for daily notification cap tracking.
 *
 * @param timezone - IANA timezone string
 * @param date - Optional date to evaluate (defaults to now)
 * @returns Date string in YYYY-MM-DD format (en-CA locale produces this natively)
 */
export function getLocalDate(timezone: string, date?: Date): string {
  const d = date ?? new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d); // Reliably returns YYYY-MM-DD
}

/**
 * Get the current hour (0-23) in a given timezone.
 * Used for timezone bucketing in digest/recap scheduling.
 *
 * @param timezone - IANA timezone string
 * @param date - Optional date to evaluate (defaults to now)
 */
export function getLocalHour(timezone: string, date?: Date): number {
  return getLocalTime(timezone, date).hours;
}

// =====================================================
// Quiet Hours
// =====================================================

/**
 * Parse an HH:mm string to total minutes since midnight.
 * Invalid or missing minutes default to 0.
 *
 * @param time - Time string in HH:mm format (e.g., '22:00')
 * @returns Total minutes since midnight (0-1439)
 */
export function parseHHMM(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Check if the current time in a user's timezone falls within quiet hours.
 * Handles overnight wrap (e.g., 22:00 -> 08:00) and same-day ranges.
 *
 * Edge cases:
 * - start === end: treated as "no quiet hours" (returns false)
 * - start > end: overnight range, wraps past midnight
 * - start < end: same-day range (e.g., 14:00 -> 16:00 for DND)
 *
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @param quietStart - Start of quiet hours in HH:mm format (e.g., '22:00')
 * @param quietEnd - End of quiet hours in HH:mm format (e.g., '08:00')
 * @param date - Optional date to evaluate (defaults to now)
 * @returns true if the current local time falls within quiet hours
 */
export function isInQuietHours(
  timezone: string,
  quietStart: string,
  quietEnd: string,
  date?: Date,
): boolean {
  const localTime = getLocalTime(timezone, date);
  const startMinutes = parseHHMM(quietStart);
  const endMinutes = parseHHMM(quietEnd);
  const nowMinutes = localTime.totalMinutes;

  if (startMinutes > endMinutes) {
    // ---- Overnight wrap (e.g., 22:00 -> 08:00) ----
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  } else if (startMinutes < endMinutes) {
    // ---- Same-day range (e.g., 14:00 -> 16:00) ----
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // start === end: quiet hours not configured, never suppress
  return false;
}

// =====================================================
// Timezone Bucketing (for scheduled sends)
// =====================================================

/**
 * Check if a user's local hour matches a target HH:mm send time.
 * Used by cron jobs to determine which users should receive a
 * digest or recap notification during the current run.
 *
 * Example: cron fires every hour at :00. Target is "18:00". This
 * returns true only if the user's local hour is currently 18, so
 * a single hourly job handles all timezones without per-user scheduling.
 *
 * @param timezone - IANA timezone string
 * @param targetTimeLocal - Target local send time in HH:mm format
 * @param date - Optional date to evaluate (defaults to now)
 * @returns true if the user's current local hour matches the target hour
 */
export function isLocalHourMatch(
  timezone: string,
  targetTimeLocal: string,
  date?: Date,
): boolean {
  const localHour = getLocalHour(timezone, date);
  const targetHour = parseInt(targetTimeLocal.split(':')[0] ?? '0', 10);
  return localHour === targetHour;
}

/**
 * Get the ISO day of week (1=Monday through 7=Sunday) in a given timezone.
 * Used to determine weekly recap eligibility by the user's configured day.
 *
 * @param timezone - IANA timezone string
 * @param date - Optional date to evaluate (defaults to now)
 * @returns ISO weekday number (1-7)
 */
export function getLocalDayOfWeek(timezone: string, date?: Date): number {
  const d = date ?? new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const day = formatter.format(d);
  const dayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return dayMap[day] ?? 1;
}

/**
 * Validate and resolve an IANA timezone string.
 * Returns the original timezone if valid, or the fallback if not.
 * Invalid timezones must not crash the scheduler — silently fall back.
 *
 * @param timezone - Raw timezone string from user preferences (may be null/undefined)
 * @param fallback - Default timezone to use when input is invalid (default: 'America/New_York')
 * @returns A guaranteed-valid IANA timezone string
 */
export function resolveTimezone(
  timezone: string | null | undefined,
  fallback: string = 'America/New_York',
): string {
  if (!timezone) return fallback;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return fallback;
  }
}
