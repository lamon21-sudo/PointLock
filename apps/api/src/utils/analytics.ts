// =====================================================
// Analytics Event Tracking
// =====================================================
// Logs analytics events via structured logging with an analytics: true marker.
// Events are filterable in any JSON log aggregator.
//
// Evolution: swap the internals to PostHog/Amplitude SDK calls
// without changing call sites.

import { baseLogger } from './logger';

const analyticsLogger = baseLogger.child({ analytics: true });

export interface AnalyticsEvent {
  name: string;
  userId?: string;
  properties?: Record<string, string | number | boolean>;
}

export function trackEvent(event: AnalyticsEvent): void {
  analyticsLogger.info(
    { eventName: event.name, userId: event.userId, ...event.properties },
    `[analytics] ${event.name}`
  );
}
