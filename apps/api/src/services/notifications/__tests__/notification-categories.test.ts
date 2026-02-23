// =====================================================
// Notification Categories Test Suite
// =====================================================
// Tests for CATEGORY_CONFIG and getCategoryConfig().
// Validates structural completeness, type safety,
// priority ordering, and invariants that the scheduler
// depends on at runtime.
//
// No mocks needed — all functions are pure lookups.

import { describe, it, expect } from 'vitest';
import { NotificationCategory, NotificationUrgency } from '@pick-rivals/shared-types';
import {
  CATEGORY_CONFIG,
  getCategoryConfig,
} from '../notification-categories';

// =====================================================
// Helpers
// =====================================================

const ALL_CATEGORIES = Object.values(NotificationCategory);

// =====================================================
// Completeness — every enum value has a config entry
// =====================================================

describe('CATEGORY_CONFIG — every NotificationCategory enum value has an entry', () => {
  for (const category of ALL_CATEGORIES) {
    it(`has a config entry for "${category}"`, () => {
      expect(CATEGORY_CONFIG[category]).toBeDefined();
    });
  }
});

// =====================================================
// getCategoryConfig — returns the correct config object
// =====================================================

describe('getCategoryConfig — returns correct config per category', () => {
  it('SETTLEMENT has urgency HIGH', () => {
    const config = getCategoryConfig(NotificationCategory.SETTLEMENT);
    expect(config.urgency).toBe(NotificationUrgency.HIGH);
  });

  it('SETTLEMENT capPriority is 1 (highest priority)', () => {
    const config = getCategoryConfig(NotificationCategory.SETTLEMENT);
    expect(config.capPriority).toBe(1);
  });

  it('PVP_CHALLENGE has urgency HIGH', () => {
    const config = getCategoryConfig(NotificationCategory.PVP_CHALLENGE);
    expect(config.urgency).toBe(NotificationUrgency.HIGH);
  });

  it('SLIP_EXPIRING has urgency HIGH', () => {
    const config = getCategoryConfig(NotificationCategory.SLIP_EXPIRING);
    expect(config.urgency).toBe(NotificationUrgency.HIGH);
  });

  it('GAME_REMINDER has urgency MEDIUM', () => {
    const config = getCategoryConfig(NotificationCategory.GAME_REMINDER);
    expect(config.urgency).toBe(NotificationUrgency.MEDIUM);
  });

  it('SOCIAL has urgency MEDIUM', () => {
    const config = getCategoryConfig(NotificationCategory.SOCIAL);
    expect(config.urgency).toBe(NotificationUrgency.MEDIUM);
  });

  it('LEADERBOARD has urgency MEDIUM', () => {
    const config = getCategoryConfig(NotificationCategory.LEADERBOARD);
    expect(config.urgency).toBe(NotificationUrgency.MEDIUM);
  });

  it('DAILY_DIGEST has urgency LOW', () => {
    const config = getCategoryConfig(NotificationCategory.DAILY_DIGEST);
    expect(config.urgency).toBe(NotificationUrgency.LOW);
  });

  it('WEEKLY_RECAP has urgency LOW', () => {
    const config = getCategoryConfig(NotificationCategory.WEEKLY_RECAP);
    expect(config.urgency).toBe(NotificationUrgency.LOW);
  });

  it('WIN_STREAK has urgency LOW', () => {
    const config = getCategoryConfig(NotificationCategory.WIN_STREAK);
    expect(config.urgency).toBe(NotificationUrgency.LOW);
  });

  it('INACTIVITY has urgency LOW', () => {
    const config = getCategoryConfig(NotificationCategory.INACTIVITY);
    expect(config.urgency).toBe(NotificationUrgency.LOW);
  });

  it('getCategoryConfig returns the same object reference as CATEGORY_CONFIG direct access', () => {
    const category = NotificationCategory.SETTLEMENT;
    expect(getCategoryConfig(category)).toBe(CATEGORY_CONFIG[category]);
  });
});

// =====================================================
// capPriority — values must be unique
// =====================================================

describe('CATEGORY_CONFIG — capPriority values are unique across all categories', () => {
  it('no two categories share the same capPriority', () => {
    const priorities = ALL_CATEGORIES.map((c) => CATEGORY_CONFIG[c].capPriority);
    const uniquePriorities = new Set(priorities);
    expect(uniquePriorities.size).toBe(priorities.length);
  });

  it('all capPriority values are positive integers', () => {
    for (const category of ALL_CATEGORIES) {
      const { capPriority } = CATEGORY_CONFIG[category];
      expect(Number.isInteger(capPriority)).toBe(true);
      expect(capPriority).toBeGreaterThan(0);
    }
  });
});

// =====================================================
// Priority ordering — HIGH urgency < LOW urgency numerically
// =====================================================

describe('CATEGORY_CONFIG — urgency ordering: HIGH priority < LOW priority (lower number = higher urgency)', () => {
  it('every HIGH urgency category has a lower capPriority than every LOW urgency category', () => {
    const highCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.HIGH,
    );
    const lowCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.LOW,
    );

    // Sanity: both groups must be non-empty for this test to be meaningful
    expect(highCategories.length).toBeGreaterThan(0);
    expect(lowCategories.length).toBeGreaterThan(0);

    const maxHighPriority = Math.max(...highCategories.map((c) => CATEGORY_CONFIG[c].capPriority));
    const minLowPriority = Math.min(...lowCategories.map((c) => CATEGORY_CONFIG[c].capPriority));

    expect(maxHighPriority).toBeLessThan(minLowPriority);
  });

  it('every HIGH urgency category has a lower capPriority than every MEDIUM urgency category', () => {
    const highCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.HIGH,
    );
    const mediumCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.MEDIUM,
    );

    expect(highCategories.length).toBeGreaterThan(0);
    expect(mediumCategories.length).toBeGreaterThan(0);

    const maxHighPriority = Math.max(...highCategories.map((c) => CATEGORY_CONFIG[c].capPriority));
    const minMediumPriority = Math.min(
      ...mediumCategories.map((c) => CATEGORY_CONFIG[c].capPriority),
    );

    expect(maxHighPriority).toBeLessThan(minMediumPriority);
  });

  it('every MEDIUM urgency category has a lower capPriority than every LOW urgency category', () => {
    const mediumCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.MEDIUM,
    );
    const lowCategories = ALL_CATEGORIES.filter(
      (c) => CATEGORY_CONFIG[c].urgency === NotificationUrgency.LOW,
    );

    expect(mediumCategories.length).toBeGreaterThan(0);
    expect(lowCategories.length).toBeGreaterThan(0);

    const maxMediumPriority = Math.max(
      ...mediumCategories.map((c) => CATEGORY_CONFIG[c].capPriority),
    );
    const minLowPriority = Math.min(...lowCategories.map((c) => CATEGORY_CONFIG[c].capPriority));

    expect(maxMediumPriority).toBeLessThan(minLowPriority);
  });
});

// =====================================================
// androidChannelId — non-empty strings
// =====================================================

describe('CATEGORY_CONFIG — androidChannelId is a non-empty string for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" androidChannelId is a non-empty string`, () => {
      const { androidChannelId } = CATEGORY_CONFIG[category];
      expect(typeof androidChannelId).toBe('string');
      expect(androidChannelId.length).toBeGreaterThan(0);
    });
  }
});

describe('CATEGORY_CONFIG — androidChannelId values are unique across all categories', () => {
  it('no two categories share the same androidChannelId', () => {
    const channelIds = ALL_CATEGORIES.map((c) => CATEGORY_CONFIG[c].androidChannelId);
    const uniqueChannelIds = new Set(channelIds);
    expect(uniqueChannelIds.size).toBe(channelIds.length);
  });
});

// =====================================================
// dedupeWindowMs — positive numbers
// =====================================================

describe('CATEGORY_CONFIG — dedupeWindowMs is a positive number for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" dedupeWindowMs is a positive number`, () => {
      const { dedupeWindowMs } = CATEGORY_CONFIG[category];
      expect(typeof dedupeWindowMs).toBe('number');
      expect(dedupeWindowMs).toBeGreaterThan(0);
    });

    it(`"${category}" dedupeWindowMs is finite`, () => {
      const { dedupeWindowMs } = CATEGORY_CONFIG[category];
      expect(Number.isFinite(dedupeWindowMs)).toBe(true);
    });
  }
});

// =====================================================
// ttlSeconds — positive numbers
// =====================================================

describe('CATEGORY_CONFIG — ttlSeconds is a positive number for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" ttlSeconds is a positive number`, () => {
      const { ttlSeconds } = CATEGORY_CONFIG[category];
      expect(typeof ttlSeconds).toBe('number');
      expect(ttlSeconds).toBeGreaterThan(0);
    });
  }
});

// =====================================================
// defaultEnabled — boolean for all categories
// =====================================================

describe('CATEGORY_CONFIG — defaultEnabled is a boolean for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" defaultEnabled is a boolean`, () => {
      const { defaultEnabled } = CATEGORY_CONFIG[category];
      expect(typeof defaultEnabled).toBe('boolean');
    });
  }
});

// =====================================================
// deepLinkPattern — non-empty strings
// =====================================================

describe('CATEGORY_CONFIG — deepLinkPattern is a non-empty string for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" deepLinkPattern is a non-empty string`, () => {
      const { deepLinkPattern } = CATEGORY_CONFIG[category];
      expect(typeof deepLinkPattern).toBe('string');
      expect(deepLinkPattern.length).toBeGreaterThan(0);
    });
  }
});

// =====================================================
// preferenceField — non-empty strings
// =====================================================

describe('CATEGORY_CONFIG — preferenceField is a non-empty string for all categories', () => {
  for (const category of ALL_CATEGORIES) {
    it(`"${category}" preferenceField is a non-empty string`, () => {
      const { preferenceField } = CATEGORY_CONFIG[category];
      expect(typeof preferenceField).toBe('string');
      expect(preferenceField.length).toBeGreaterThan(0);
    });
  }
});

describe('CATEGORY_CONFIG — preferenceField values are unique across all categories', () => {
  it('no two categories share the same preferenceField', () => {
    const fields = ALL_CATEGORIES.map((c) => CATEGORY_CONFIG[c].preferenceField);
    const uniqueFields = new Set(fields);
    expect(uniqueFields.size).toBe(fields.length);
  });
});

// =====================================================
// SLIP_EXPIRING — TTL is short (time-sensitive delivery)
// =====================================================

describe('CATEGORY_CONFIG — SLIP_EXPIRING has shorter TTL than settlement categories', () => {
  it('SLIP_EXPIRING ttlSeconds is less than SETTLEMENT ttlSeconds', () => {
    const slipTTL = CATEGORY_CONFIG[NotificationCategory.SLIP_EXPIRING].ttlSeconds;
    const settlementTTL = CATEGORY_CONFIG[NotificationCategory.SETTLEMENT].ttlSeconds;
    expect(slipTTL).toBeLessThan(settlementTTL);
  });
});
