// =====================================================
// Sentry Instrumentation
// =====================================================
// Must be imported before any other application code.
// Initializes Sentry error tracking for the API.

import * as Sentry from '@sentry/node';
import { config } from './config';

if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: `pick-rivals-api@${process.env.npm_package_version || '0.1.0'}`,
    tracesSampleRate: config.nodeEnv === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip PII from user context
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });
}
