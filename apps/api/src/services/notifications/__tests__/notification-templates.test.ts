// =====================================================
// Notification Templates Test Suite
// =====================================================
// Tests for renderTemplate() and the structural integrity
// of the TEMPLATES and CATEGORY_TEMPLATES registries.
//
// Security invariant: no template may contain PII-sensitive
// variable placeholders (email, phone, password, etc.).
// Missing template variables must survive gracefully —
// the placeholder is left intact, never silently cleared.

import { describe, it, expect } from 'vitest';
import { NotificationCategory } from '@pick-rivals/shared-types';
import {
  renderTemplate,
  TEMPLATES,
  CATEGORY_TEMPLATES,
} from '../notification-templates';

// =====================================================
// renderTemplate — Variable Interpolation
// =====================================================

describe('renderTemplate — settlement.win', () => {
  it('substitutes {opponentName} with the provided value', () => {
    const result = renderTemplate('settlement.win', {
      opponentName: 'Rival99',
    });
    expect(result.body).toContain('Rival99');
  });

  it('does not include financial data in the body (lock-screen safe)', () => {
    const result = renderTemplate('settlement.win', {
      opponentName: 'Rival99',
    });
    // No coin amounts should appear on lock screen
    expect(result.body).not.toMatch(/\d+\s*coins/i);
  });

  it('returns the correct iconType', () => {
    const result = renderTemplate('settlement.win', {
      opponentName: 'X',
    });
    expect(result.iconType).toBe('win');
  });

  it('title does not contain unresolved placeholders when no variables needed', () => {
    const result = renderTemplate('settlement.win', {
      opponentName: 'Y',
    });
    expect(result.title).not.toMatch(/\{[^}]+\}/);
  });
});

describe('renderTemplate — settlement.loss', () => {
  it('substitutes {opponentName} in body', () => {
    const result = renderTemplate('settlement.loss', { opponentName: 'TopDog' });
    expect(result.body).toContain('TopDog');
  });

  it('body has no unresolved placeholders when all variables supplied', () => {
    const result = renderTemplate('settlement.loss', { opponentName: 'TopDog' });
    expect(result.body).not.toMatch(/\{[^}]+\}/);
  });

  it('returns iconType "loss"', () => {
    const result = renderTemplate('settlement.loss', { opponentName: 'X' });
    expect(result.iconType).toBe('loss');
  });
});

describe('renderTemplate — pvp_challenge.received', () => {
  it('substitutes {challengerName} and {eventDescription}', () => {
    const result = renderTemplate('pvp_challenge.received', {
      challengerName: 'FastBall',
      eventDescription: 'NBA game',
    });
    expect(result.body).toContain('FastBall');
    expect(result.body).toContain('NBA game');
  });

  it('returns iconType "challenge"', () => {
    const result = renderTemplate('pvp_challenge.received', {
      challengerName: 'X',
      eventDescription: 'Y',
    });
    expect(result.iconType).toBe('challenge');
  });
});

describe('renderTemplate — slip_expiring.warning', () => {
  it('substitutes {minutesRemaining} with a number', () => {
    const result = renderTemplate('slip_expiring.warning', { minutesRemaining: 5 });
    expect(result.body).toContain('5');
  });

  it('body has no raw placeholder when variable is provided', () => {
    const result = renderTemplate('slip_expiring.warning', { minutesRemaining: 10 });
    expect(result.body).not.toMatch(/\{minutesRemaining\}/);
  });
});

describe('renderTemplate — weekly_recap.summary', () => {
  it('substitutes wins, losses, and spotsClimbed', () => {
    const result = renderTemplate('weekly_recap.summary', {
      wins: 7,
      losses: 3,
      spotsClimbed: 4,
    });
    expect(result.body).toContain('7');
    expect(result.body).toContain('3');
    expect(result.body).toContain('4');
  });
});

describe('renderTemplate — inactivity.7d', () => {
  it('does not promise financial amounts (no bonus until wallet integration)', () => {
    const result = renderTemplate('inactivity.7d', {});
    expect(result.body).not.toMatch(/\d+\s*(coins|bonus)/i);
    expect(result.body).toContain('leaderboard');
  });

  it('returns iconType "alert"', () => {
    const result = renderTemplate('inactivity.7d', {});
    expect(result.iconType).toBe('alert');
  });
});

// =====================================================
// renderTemplate — Missing Variable Behaviour
// =====================================================

describe('renderTemplate — missing variable behaviour', () => {
  it('leaves placeholder intact when a variable is not provided', () => {
    // settlement.win requires opponentName — deliberately omit it
    const result = renderTemplate('settlement.win', {});
    expect(result.body).toContain('{opponentName}');
  });

  it('does not collapse missing placeholder to empty string', () => {
    const result = renderTemplate('slip_expiring.warning', {});
    // {minutesRemaining} must remain visible, not become empty
    expect(result.body).toContain('{minutesRemaining}');
    expect(result.body).not.toMatch(/minutes\s+minutes/);
  });

  it('resolves present variables even when others are missing', () => {
    // pvp_challenge.received has {challengerName} and {eventDescription}
    const result = renderTemplate('pvp_challenge.received', {
      challengerName: 'TestUser',
      // eventDescription deliberately absent
    });
    expect(result.body).toContain('TestUser');
    expect(result.body).toContain('{eventDescription}');
  });

  it('number zero is a valid substitution value (not treated as falsy-absent)', () => {
    const result = renderTemplate('weekly_recap.summary', {
      wins: 0,
      losses: 5,
      spotsClimbed: 0,
    });
    // "0" must appear in the output — zero is a real value
    expect(result.body).toContain('0');
    expect(result.body).not.toContain('{wins}');
  });
});

// =====================================================
// renderTemplate — Unknown Template ID
// =====================================================

describe('renderTemplate — unknown templateId', () => {
  it('throws an Error for a completely unknown templateId', () => {
    expect(() => renderTemplate('does.not.exist', {})).toThrow(Error);
  });

  it('error message identifies the bad templateId', () => {
    expect(() => renderTemplate('fake.template', {})).toThrow(
      /fake\.template/,
    );
  });

  it('throws for an empty string templateId', () => {
    expect(() => renderTemplate('', {})).toThrow(Error);
  });
});

// =====================================================
// TEMPLATES registry — structural completeness
// =====================================================

describe('TEMPLATES registry — all entries have required fields', () => {
  const allTemplateIds = Object.keys(TEMPLATES);

  it('registry is non-empty', () => {
    expect(allTemplateIds.length).toBeGreaterThan(0);
  });

  for (const id of allTemplateIds) {
    it(`"${id}" has a non-empty title`, () => {
      expect(TEMPLATES[id].title).toBeTruthy();
    });

    it(`"${id}" has a non-empty body`, () => {
      expect(TEMPLATES[id].body).toBeTruthy();
    });

    it(`"${id}" has a non-empty iconType`, () => {
      expect(TEMPLATES[id].iconType).toBeTruthy();
    });
  }
});

// =====================================================
// CATEGORY_TEMPLATES — every template ID is registered
// =====================================================

describe('CATEGORY_TEMPLATES — every listed templateId exists in TEMPLATES', () => {
  const allCategories = Object.keys(CATEGORY_TEMPLATES) as NotificationCategory[];

  it('covers all NotificationCategory enum values', () => {
    const enumValues = Object.values(NotificationCategory);
    for (const value of enumValues) {
      expect(Object.keys(CATEGORY_TEMPLATES)).toContain(value);
    }
  });

  for (const category of allCategories) {
    const templateIds = CATEGORY_TEMPLATES[category as NotificationCategory];

    it(`category "${category}" maps to at least one templateId`, () => {
      expect(templateIds.length).toBeGreaterThan(0);
    });

    for (const templateId of templateIds) {
      it(`"${templateId}" (in ${category}) resolves to an entry in TEMPLATES`, () => {
        expect(TEMPLATES[templateId]).toBeDefined();
      });
    }
  }
});

// =====================================================
// Security — no PII-unsafe variable placeholders
// =====================================================

describe('TEMPLATES — no PII-sensitive variable placeholders in any template', () => {
  // Variables that must never appear in lock-screen-visible notification content.
  const bannedPlaceholders = [
    '{email}',
    '{phone}',
    '{password}',
    '{ssn}',
    '{creditCard}',
    '{cardNumber}',
    '{bankAccount}',
    '{token}',
    '{secret}',
    '{apiKey}',
    '{address}',
    '{dob}',
    '{dateOfBirth}',
  ];

  for (const [id, template] of Object.entries(TEMPLATES)) {
    for (const banned of bannedPlaceholders) {
      it(`"${id}" title does not contain ${banned}`, () => {
        expect(template.title.toLowerCase()).not.toContain(banned.toLowerCase());
      });

      it(`"${id}" body does not contain ${banned}`, () => {
        expect(template.body.toLowerCase()).not.toContain(banned.toLowerCase());
      });
    }
  }
});
