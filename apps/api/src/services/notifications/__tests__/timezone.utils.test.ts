// =====================================================
// Timezone Utilities Test Suite
// =====================================================
// Pure unit tests for all functions in timezone.utils.ts.
// No external dependencies, no mocks — all functions
// accept an optional `date` param for determinism.
//
// Fixed reference dates used throughout:
//   UTC_NOON        — 2024-03-15 17:00:00 UTC (noon in New York, EST+5h offset)
//   UTC_MIDNIGHT    — 2024-03-16 05:00:00 UTC (midnight in New York)
//   UTC_3AM_NY      — 2024-03-16 08:00:00 UTC (03:00 in New York)
//   UTC_WEDNESDAY   — 2024-03-13 12:00:00 UTC (Wednesday in New York, ISO 3)
//   UTC_SUNDAY      — 2024-03-17 12:00:00 UTC (Sunday in New York,  ISO 7)
//   UTC_MONDAY      — 2024-03-18 12:00:00 UTC (Monday in New York,  ISO 1)

import { describe, it, expect } from 'vitest';
import {
  getLocalTime,
  getLocalDate,
  parseHHMM,
  isInQuietHours,
  isLocalHourMatch,
  getLocalDayOfWeek,
  resolveTimezone,
} from '../timezone.utils';

// =====================================================
// Shared Fixed Dates
// =====================================================
// America/New_York in March 2024 observes EDT (UTC-4).
// The dates below are chosen so their New York local time
// is precisely known, making assertions deterministic.

// 2024-03-15 17:00:00 UTC  →  2024-03-15 13:00 EDT (hour=13, minute=0)
const NY_1PM = new Date('2024-03-15T17:00:00.000Z');

// 2024-03-16 04:00:00 UTC  →  2024-03-16 00:00 EDT (midnight)
const NY_MIDNIGHT = new Date('2024-03-16T04:00:00.000Z');

// 2024-03-16 07:00:00 UTC  →  2024-03-16 03:00 EDT
const NY_3AM = new Date('2024-03-16T07:00:00.000Z');

// 2024-03-15 19:00:00 UTC  →  2024-03-15 15:00 EDT (hour=15)
const NY_3PM = new Date('2024-03-15T19:00:00.000Z');

// 2024-03-15 22:00:00 UTC  →  2024-03-15 18:00 EDT (hour=18)
const NY_6PM = new Date('2024-03-15T22:00:00.000Z');

// 2024-03-16 02:00:00 UTC  →  2024-03-15 22:00 EDT (hour=22)
const NY_10PM = new Date('2024-03-16T02:00:00.000Z');

// 2024-03-16 12:00:00 UTC  →  2024-03-16 08:00 EDT (hour=8, exactly at quiet end)
const NY_8AM = new Date('2024-03-16T12:00:00.000Z');

// 2024-03-13 16:00:00 UTC  →  2024-03-13 12:00 EDT (Wednesday, ISO 3)
const NY_WED_NOON = new Date('2024-03-13T16:00:00.000Z');

// 2024-03-17 16:00:00 UTC  →  2024-03-17 12:00 EDT (Sunday, ISO 7)
const NY_SUN_NOON = new Date('2024-03-17T16:00:00.000Z');

// 2024-03-18 16:00:00 UTC  →  2024-03-18 12:00 EDT (Monday, ISO 1)
const NY_MON_NOON = new Date('2024-03-18T16:00:00.000Z');

// =====================================================
// getLocalTime
// =====================================================

describe('getLocalTime', () => {
  it('returns correct hours and minutes for America/New_York at 13:00 EDT', () => {
    const result = getLocalTime('America/New_York', NY_1PM);
    expect(result.hours).toBe(13);
    expect(result.minutes).toBe(0);
  });

  it('totalMinutes equals hours * 60 + minutes', () => {
    const result = getLocalTime('America/New_York', NY_1PM);
    expect(result.totalMinutes).toBe(13 * 60 + 0);
  });

  it('returns correct hours for America/New_York at 15:00 EDT', () => {
    const result = getLocalTime('America/New_York', NY_3PM);
    expect(result.hours).toBe(15);
  });

  it('normalises midnight: hours is 0, not 24', () => {
    const result = getLocalTime('America/New_York', NY_MIDNIGHT);
    expect(result.hours).toBe(0);
  });

  it('midnight totalMinutes is 0', () => {
    const result = getLocalTime('America/New_York', NY_MIDNIGHT);
    expect(result.totalMinutes).toBe(0);
  });

  it('midnight minutes is 0', () => {
    const result = getLocalTime('America/New_York', NY_MIDNIGHT);
    expect(result.minutes).toBe(0);
  });

  it('returns correct hours for America/New_York at 03:00 EDT', () => {
    const result = getLocalTime('America/New_York', NY_3AM);
    expect(result.hours).toBe(3);
  });

  it('hours field is in range 0-23', () => {
    const result = getLocalTime('America/New_York', NY_1PM);
    expect(result.hours).toBeGreaterThanOrEqual(0);
    expect(result.hours).toBeLessThanOrEqual(23);
  });

  it('minutes field is in range 0-59', () => {
    const result = getLocalTime('America/New_York', NY_1PM);
    expect(result.minutes).toBeGreaterThanOrEqual(0);
    expect(result.minutes).toBeLessThanOrEqual(59);
  });
});

// =====================================================
// getLocalDate
// =====================================================

describe('getLocalDate', () => {
  it('returns YYYY-MM-DD format for America/New_York', () => {
    const result = getLocalDate('America/New_York', NY_1PM);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the correct calendar date for NY_1PM (2024-03-15 EDT)', () => {
    const result = getLocalDate('America/New_York', NY_1PM);
    expect(result).toBe('2024-03-15');
  });

  it('returns the correct calendar date for midnight (2024-03-16 EDT)', () => {
    const result = getLocalDate('America/New_York', NY_MIDNIGHT);
    expect(result).toBe('2024-03-16');
  });

  it('year segment is 4 digits', () => {
    const result = getLocalDate('America/New_York', NY_1PM);
    expect(result.substring(0, 4)).toHaveLength(4);
  });

  it('month segment is zero-padded to 2 digits', () => {
    const result = getLocalDate('America/New_York', NY_1PM);
    expect(result.substring(5, 7)).toHaveLength(2);
  });

  it('day segment is zero-padded to 2 digits', () => {
    const result = getLocalDate('America/New_York', NY_1PM);
    expect(result.substring(8, 10)).toHaveLength(2);
  });
});

// =====================================================
// parseHHMM
// =====================================================

describe('parseHHMM', () => {
  it('"22:00" parses to 1320 minutes', () => {
    expect(parseHHMM('22:00')).toBe(1320);
  });

  it('"08:00" parses to 480 minutes', () => {
    expect(parseHHMM('08:00')).toBe(480);
  });

  it('"00:00" parses to 0 minutes (start of day)', () => {
    expect(parseHHMM('00:00')).toBe(0);
  });

  it('"23:59" parses to 1439 minutes (last minute of day)', () => {
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('"12:30" parses to 750 minutes', () => {
    expect(parseHHMM('12:30')).toBe(750);
  });

  it('"01:05" parses to 65 minutes', () => {
    expect(parseHHMM('01:05')).toBe(65);
  });

  it('"18:00" parses to 1080 minutes', () => {
    expect(parseHHMM('18:00')).toBe(1080);
  });
});

// =====================================================
// isInQuietHours
// =====================================================

describe('isInQuietHours — overnight range (22:00 to 08:00)', () => {
  // ---- Overnight wrap: start > end ----
  // Blocked: nowMinutes >= 1320 OR nowMinutes < 480

  it('23:00 (1380 min) is blocked — inside overnight window', () => {
    // NY_10PM = 22:00 EDT, which is exactly on the boundary (>= 1320)
    expect(isInQuietHours('America/New_York', '22:00', '08:00', NY_10PM)).toBe(true);
  });

  it('03:00 (180 min) is blocked — wraps past midnight', () => {
    expect(isInQuietHours('America/New_York', '22:00', '08:00', NY_3AM)).toBe(true);
  });

  it('13:00 (780 min) is allowed — middle of day, outside quiet window', () => {
    expect(isInQuietHours('America/New_York', '22:00', '08:00', NY_1PM)).toBe(false);
  });

  it('08:00 (480 min) is allowed — exclusive end boundary is not blocked', () => {
    // Condition is nowMinutes < endMinutes (480 < 480 is false), so 08:00 is allowed
    expect(isInQuietHours('America/New_York', '22:00', '08:00', NY_8AM)).toBe(false);
  });
});

describe('isInQuietHours — same-day range (14:00 to 16:00)', () => {
  // ---- Same-day: start < end ----
  // Blocked: 840 <= nowMinutes < 960

  it('15:00 (900 min) is blocked — inside same-day window', () => {
    // Build a date that lands at 15:00 EDT
    // 2024-03-15 19:00 UTC = 15:00 EDT — reuse NY_3PM
    expect(isInQuietHours('America/New_York', '14:00', '16:00', NY_3PM)).toBe(true);
  });

  it('13:00 (780 min) is allowed — before same-day window', () => {
    expect(isInQuietHours('America/New_York', '14:00', '16:00', NY_1PM)).toBe(false);
  });

  it('18:00 (1080 min) is allowed — after same-day window', () => {
    expect(isInQuietHours('America/New_York', '14:00', '16:00', NY_6PM)).toBe(false);
  });
});

describe('isInQuietHours — equal start and end', () => {
  it('start === end returns false (no quiet hours configured)', () => {
    expect(isInQuietHours('America/New_York', '08:00', '08:00', NY_1PM)).toBe(false);
  });

  it('start === end returns false even when local time matches the boundary', () => {
    expect(isInQuietHours('America/New_York', '13:00', '13:00', NY_1PM)).toBe(false);
  });
});

// =====================================================
// isLocalHourMatch
// =====================================================

describe('isLocalHourMatch', () => {
  it('returns true when local hour matches the target hour exactly', () => {
    // NY_1PM = 13:00 EDT
    expect(isLocalHourMatch('America/New_York', '13:00', NY_1PM)).toBe(true);
  });

  it('returns false when local hour does not match the target hour', () => {
    // NY_1PM = 13:00 EDT, target is 18:00
    expect(isLocalHourMatch('America/New_York', '18:00', NY_1PM)).toBe(false);
  });

  it('target minute component is ignored — only hour matters', () => {
    // NY_1PM = 13:xx EDT; target "13:45" should still match on hour 13
    expect(isLocalHourMatch('America/New_York', '13:45', NY_1PM)).toBe(true);
  });

  it('returns true for midnight match (hour 0)', () => {
    // NY_MIDNIGHT = 00:00 EDT, target "00:00"
    expect(isLocalHourMatch('America/New_York', '00:00', NY_MIDNIGHT)).toBe(true);
  });

  it('returns false for off-by-one hour', () => {
    expect(isLocalHourMatch('America/New_York', '14:00', NY_1PM)).toBe(false);
  });
});

// =====================================================
// getLocalDayOfWeek
// =====================================================

describe('getLocalDayOfWeek', () => {
  it('returns ISO day 3 (Wednesday) for NY_WED_NOON', () => {
    expect(getLocalDayOfWeek('America/New_York', NY_WED_NOON)).toBe(3);
  });

  it('returns ISO day 7 (Sunday) for NY_SUN_NOON', () => {
    expect(getLocalDayOfWeek('America/New_York', NY_SUN_NOON)).toBe(7);
  });

  it('returns ISO day 1 (Monday) for NY_MON_NOON', () => {
    expect(getLocalDayOfWeek('America/New_York', NY_MON_NOON)).toBe(1);
  });

  it('returns a value in the ISO range 1-7', () => {
    const day = getLocalDayOfWeek('America/New_York', NY_1PM);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(7);
  });
});

// =====================================================
// resolveTimezone
// =====================================================

describe('resolveTimezone', () => {
  it('returns a valid IANA timezone unchanged', () => {
    expect(resolveTimezone('America/Chicago')).toBe('America/Chicago');
  });

  it('returns a valid IANA timezone unchanged (Europe/London)', () => {
    expect(resolveTimezone('Europe/London')).toBe('Europe/London');
  });

  it('returns the default fallback for null input', () => {
    expect(resolveTimezone(null)).toBe('America/New_York');
  });

  it('returns the default fallback for undefined input', () => {
    expect(resolveTimezone(undefined)).toBe('America/New_York');
  });

  it('returns the default fallback for empty string', () => {
    expect(resolveTimezone('')).toBe('America/New_York');
  });

  it('returns the default fallback for a garbage string', () => {
    expect(resolveTimezone('Not/ATimezone')).toBe('America/New_York');
  });

  it('returns the default fallback for a partial timezone name', () => {
    expect(resolveTimezone('America')).toBe('America/New_York');
  });

  it('uses a custom fallback when provided', () => {
    expect(resolveTimezone(null, 'UTC')).toBe('UTC');
  });

  it('uses custom fallback for an invalid string', () => {
    expect(resolveTimezone('Bad/Zone', 'Europe/Paris')).toBe('Europe/Paris');
  });

  it('does not use fallback when timezone is valid (custom fallback ignored)', () => {
    expect(resolveTimezone('Asia/Tokyo', 'UTC')).toBe('Asia/Tokyo');
  });
});
