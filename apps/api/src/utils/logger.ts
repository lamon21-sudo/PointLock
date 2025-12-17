// =====================================================
// Simple Logger Utility
// =====================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m',
};

function formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString();
  const color = LOG_COLORS[level];
  const reset = LOG_COLORS.reset;
  const levelUpper = level.toUpperCase().padEnd(5);

  return `${color}[${timestamp}] [${levelUpper}]${reset} ${message} ${args.length ? JSON.stringify(args) : ''}`;
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', message, ...args));
    }
  },

  info(message: string, ...args: unknown[]): void {
    console.info(formatMessage('info', message, ...args));
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(formatMessage('warn', message, ...args));
  },

  error(message: string, ...args: unknown[]): void {
    console.error(formatMessage('error', message, ...args));
  },
};
