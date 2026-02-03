// =====================================================
// Application Configuration
// =====================================================

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Redis (for BullMQ job queues)
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per window
  },

  // Wallet
  wallet: {
    weeklyAllowanceAmount: 1000, // 1000 RC (cents)
    weeklyAllowanceDays: 7, // 7 days between claims
    defaultRakePercentage: 5, // 5%
  },

  // Sports Data Providers
  oddsApi: {
    apiKey: process.env.ODDS_API_KEY || '',
    baseUrl: 'https://api.the-odds-api.com/v4',
    cacheTtlSeconds: 60, // Cache odds for 60 seconds
    maxRetries: 3,
    initialRetryDelayMs: 1000, // Start with 1 second, then exponential backoff
  },

  // Live Scores
  liveScores: {
    webhookSecret: process.env.LIVE_SCORES_WEBHOOK_SECRET || '',
    pollingIntervalMs: parseInt(process.env.LIVE_SCORES_POLL_INTERVAL || '30000', 10),
    idempotencyCacheTtlMs: 5 * 60 * 1000, // 5 minutes
    maxUpdatesPerSecond: 100,
    enablePolling: process.env.LIVE_SCORES_ENABLE_POLLING === 'true',
  },

  // Player Tier Sync (auto-categorizes players by performance stats)
  playerTiers: {
    syncSchedule: process.env.PLAYER_TIER_SYNC_SCHEDULE || '0 4 * * *', // Daily at 4 AM UTC
    batchSize: parseInt(process.env.PLAYER_TIER_BATCH_SIZE || '200', 10),
    autoSyncEnabled: process.env.PLAYER_TIER_AUTO_SYNC !== 'false', // Enabled by default
    useMockData: process.env.PLAYER_TIER_USE_MOCK === 'true', // Use mock data for testing
  },

  // Player Props (individual player betting lines)
  playerProps: {
    enabled: process.env.PLAYER_PROPS_ENABLED === 'true',
    syncIntervalMinutes: parseInt(process.env.PROPS_SYNC_INTERVAL || '30', 10),
    fetchWindowHours: parseInt(process.env.PROPS_FETCH_WINDOW_HOURS || '48', 10),
    maxEventsPerSync: parseInt(process.env.PROPS_MAX_EVENTS || '50', 10),
    useMockData: process.env.PLAYER_PROPS_USE_MOCK !== 'false', // Use mock data by default (for dev)
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false', // Enabled by default
    userTierTtlSeconds: parseInt(process.env.CACHE_USER_TIER_TTL || '300', 10), // 5 min
    playerTierTtlSeconds: parseInt(process.env.CACHE_PLAYER_TIER_TTL || '3600', 10), // 1 hour
  },
} as const;

// Validate required environment variables
export function validateConfig(): void {
  const required = ['DATABASE_URL'];

  for (const key of required) {
    if (!process.env[key]) {
      console.warn(`Warning: Missing environment variable: ${key}`);
    }
  }
}

validateConfig();
