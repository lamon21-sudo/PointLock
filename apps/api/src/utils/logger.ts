// =====================================================
// Structured Logger Utility (pino)
// =====================================================
// JSON output in production, pretty-printed in development.
// Maintains the same export interface (logger.debug/info/warn/error)
// so all existing import sites work unchanged.

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const baseLogger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: !isProduction && !isTest
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } }
    : undefined,
  base: {
    service: 'pick-rivals-api',
    env: process.env.NODE_ENV || 'development',
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'refreshToken', 'accessToken'],
    censor: '[REDACTED]',
  },
  // Silence in test unless DEBUG is set
  ...(isTest && !process.env.DEBUG ? { level: 'silent' } : {}),
});

// Helper: extract loggable object from variadic args
function extractLogData(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (args.length === 1) {
    const arg = args[0];
    if (arg instanceof Error) return { err: arg };
    if (typeof arg === 'object' && arg !== null) return arg as Record<string, unknown>;
    return { data: arg };
  }
  // Multiple args - check if first is an Error
  const first = args[0];
  if (first instanceof Error) {
    return { err: first, extra: args.slice(1) };
  }
  return { extra: args };
}

// Preserve the exact same export interface used by 56+ import sites:
// logger.debug('msg'), logger.info('msg', obj), logger.error('msg:', error)
export const logger = {
  debug(message: string, ...args: unknown[]): void {
    const data = extractLogData(args);
    if (data) {
      baseLogger.debug(data, message);
    } else {
      baseLogger.debug(message);
    }
  },

  info(message: string, ...args: unknown[]): void {
    const data = extractLogData(args);
    if (data) {
      baseLogger.info(data, message);
    } else {
      baseLogger.info(message);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    const data = extractLogData(args);
    if (data) {
      baseLogger.warn(data, message);
    } else {
      baseLogger.warn(message);
    }
  },

  error(message: string, ...args: unknown[]): void {
    const data = extractLogData(args);
    if (data) {
      baseLogger.error(data, message);
    } else {
      baseLogger.error(message);
    }
  },
};
