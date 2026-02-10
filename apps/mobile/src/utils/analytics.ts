/**
 * Analytics utility for mobile app.
 * Currently logs locally in dev. Placeholder for PostHog/Amplitude.
 *
 * IMPORTANT: Never include PII (email, real name, IP) in event properties.
 * userId is acceptable as it's an opaque UUID.
 */

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Track an analytics event.
 * Dev: logs to console
 * Prod: noop (ready for provider swap)
 */
export function trackEvent(event: AnalyticsEvent): void {
  if (__DEV__) {
    console.log('[Analytics]', event.name, event.properties || '');
  }

  // Evolution: Add PostHog/Amplitude SDK call here
  // posthog.capture(event.name, event.properties);
}
