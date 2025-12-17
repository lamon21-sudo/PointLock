// =====================================================
// Application Configuration
// =====================================================

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

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
    weeklyAllowance: 1000, // 1000 RC
    defaultRakePercentage: 5, // 5%
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
