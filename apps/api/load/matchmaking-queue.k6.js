// =====================================================
// k6 Load Test: Matchmaking Queue
// =====================================================
// Tests matchmaking queue performance under concurrent load.
// Simulates 100+ users joining queue, waiting for matches.
//
// Usage:
//   k6 run load/matchmaking-queue.k6.js
//   API_URL=http://localhost:3000 k6 run load/matchmaking-queue.k6.js
//   k6 run --out json=results.json load/matchmaking-queue.k6.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// =====================================================
// Configuration
// =====================================================

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const TEST_DURATION = __ENV.TEST_DURATION || '2m';
const MAX_USERS = parseInt(__ENV.MAX_USERS || '100');

// =====================================================
// Custom Metrics
// =====================================================

const loginErrors = new Rate('login_errors');
const queueJoinErrors = new Rate('queue_join_errors');
const queueJoinDuration = new Trend('queue_join_duration');
const queueWaitTime = new Trend('queue_wait_time');
const matchFoundRate = new Rate('match_found_rate');
const queueStatusChecks = new Counter('queue_status_checks');
const activeQueuers = new Gauge('active_queuers');

// =====================================================
// Test Configuration
// =====================================================

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users over 30s
    { duration: '1m', target: 100 },   // Ramp up to 100 users over 1 minute
    { duration: '30s', target: 0 },    // Ramp down to 0 over 30s
  ],
  thresholds: {
    // HTTP request duration thresholds
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],

    // Error rate thresholds
    'http_req_failed': ['rate<0.01'],  // Less than 1% HTTP errors
    'login_errors': ['rate<0.01'],     // Less than 1% login errors
    'queue_join_errors': ['rate<0.05'], // Less than 5% queue join errors (more lenient due to business logic)

    // Performance thresholds
    'queue_join_duration': ['p(95)<300'], // Queue join should be fast (< 300ms at p95)
    'queue_wait_time': ['p(95)<30000'],   // 30s wait time at p95
  },
  // Disable built-in metrics we don't need
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get user credentials based on virtual user ID.
 * Uses pre-seeded loadtest users: loadtest-1@example.com to loadtest-200@example.com
 */
function getUserCredentials(vuId) {
  const userId = ((vuId - 1) % 200) + 1; // Cycle through 200 users
  return {
    email: `loadtest-${userId}@example.com`,
    password: 'LoadTest123!',
  };
}

/**
 * Login and get JWT token.
 * Returns { success: boolean, token: string | null, userId: string | null }
 */
function login(credentials) {
  const startTime = Date.now();

  const payload = JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'login' },
  };

  const response = http.post(`${API_URL}/api/v1/auth/login`, payload, params);

  const success = check(response, {
    'login: status is 200': (r) => r.status === 200,
    'login: has access token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && body.data.tokens && body.data.tokens.accessToken;
      } catch (e) {
        return false;
      }
    },
  });

  loginErrors.add(!success);

  if (!success) {
    console.error(`Login failed for ${credentials.email}: ${response.status} ${response.body}`);
    return { success: false, token: null, userId: null };
  }

  try {
    const body = JSON.parse(response.body);
    return {
      success: true,
      token: body.data.tokens.accessToken,
      userId: body.data.user.id,
    };
  } catch (e) {
    console.error(`Failed to parse login response: ${e.message}`);
    loginErrors.add(true);
    return { success: false, token: null, userId: null };
  }
}

/**
 * Get or create a draft slip for the user.
 * Returns slipId or null if failed.
 */
function getOrCreateSlip(token, userId) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'list_slips' },
  };

  // Try to get existing draft slips
  const listResponse = http.get(`${API_URL}/api/v1/slips?status=DRAFT&limit=1`, params);

  const listSuccess = check(listResponse, {
    'list_slips: status is 200': (r) => r.status === 200,
  });

  if (listSuccess) {
    try {
      const body = JSON.parse(listResponse.body);
      if (body.success && body.data && body.data.slips && body.data.slips.length > 0) {
        return body.data.slips[0].id;
      }
    } catch (e) {
      // Fall through to creation
    }
  }

  // No draft slip found - this should not happen as setup script creates them
  // But we log it for debugging
  console.warn(`No draft slip found for user ${userId}`);
  return null;
}

/**
 * Join matchmaking queue.
 * Returns { success: boolean, entryId: string | null, duration: number }
 */
function joinQueue(token, slipId) {
  const startTime = Date.now();

  const payload = JSON.stringify({
    slipId: slipId,
    stakeAmount: 100, // 100 coins
    region: 'us-east',
    idempotencyKey: `load-test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'queue_join' },
  };

  const response = http.post(`${API_URL}/api/v1/matchmaking/queue`, payload, params);
  const duration = Date.now() - startTime;

  const success = check(response, {
    'queue_join: status is 201': (r) => r.status === 201,
    'queue_join: has entry id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && body.data.id;
      } catch (e) {
        return false;
      }
    },
  });

  queueJoinErrors.add(!success);

  if (success) {
    queueJoinDuration.add(duration);
  } else {
    console.error(`Queue join failed: ${response.status} ${response.body}`);
  }

  try {
    const body = JSON.parse(response.body);
    return {
      success,
      entryId: success ? body.data.id : null,
      duration,
    };
  } catch (e) {
    return { success: false, entryId: null, duration };
  }
}

/**
 * Check queue status.
 * Returns { inQueue: boolean, matchId: string | null, position: number | null }
 */
function checkQueueStatus(token) {
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'queue_status' },
  };

  const response = http.get(`${API_URL}/api/v1/matchmaking/queue/QUICK_MATCH/status`, params);

  queueStatusChecks.add(1);

  const success = check(response, {
    'queue_status: status is 200': (r) => r.status === 200,
  });

  if (!success) {
    return { inQueue: false, matchId: null, position: null };
  }

  try {
    const body = JSON.parse(response.body);
    const entry = body.data?.entry;

    if (!entry) {
      return { inQueue: false, matchId: null, position: null };
    }

    return {
      inQueue: true,
      matchId: entry.matchId || null,
      position: body.data?.position || null,
    };
  } catch (e) {
    return { inQueue: false, matchId: null, position: null };
  }
}

/**
 * Leave matchmaking queue.
 */
function leaveQueue(token) {
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'queue_leave' },
  };

  const response = http.del(`${API_URL}/api/v1/matchmaking/queue/QUICK_MATCH`, params);

  check(response, {
    'queue_leave: status is 200': (r) => r.status === 200,
  });
}

// =====================================================
// Main Test Function
// =====================================================

export default function () {
  const credentials = getUserCredentials(__VU);

  // Step 1: Login
  const loginResult = login(credentials);
  if (!loginResult.success) {
    sleep(1);
    return;
  }

  const { token, userId } = loginResult;

  // Step 2: Get or create slip
  const slipId = getOrCreateSlip(token, userId);
  if (!slipId) {
    console.error(`Failed to get slip for user ${userId}`);
    sleep(1);
    return;
  }

  // Step 3: Join queue
  const queueJoinResult = joinQueue(token, slipId);
  if (!queueJoinResult.success) {
    sleep(1);
    return;
  }

  activeQueuers.add(1);

  // Step 4: Poll queue status for up to 30 seconds
  const queueStartTime = Date.now();
  const maxWaitTime = 30000; // 30 seconds
  let matched = false;
  let matchId = null;

  while (Date.now() - queueStartTime < maxWaitTime) {
    sleep(2); // Poll every 2 seconds

    const status = checkQueueStatus(token);

    if (!status.inQueue) {
      // Left queue (possibly matched or timed out)
      break;
    }

    if (status.matchId) {
      matched = true;
      matchId = status.matchId;
      const waitTime = Date.now() - queueStartTime;
      queueWaitTime.add(waitTime);
      matchFoundRate.add(true);
      break;
    }
  }

  // Record match found rate
  if (!matched) {
    matchFoundRate.add(false);

    // Leave queue if still in it
    leaveQueue(token);
  }

  activeQueuers.add(-1);

  // Small delay before next iteration
  sleep(1);
}

// =====================================================
// Setup and Teardown
// =====================================================

export function setup() {
  console.log('='.repeat(60));
  console.log('k6 Load Test: Matchmaking Queue');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Max Users: ${MAX_USERS}`);
  console.log(`Test Duration: ${TEST_DURATION}`);
  console.log('='.repeat(60));

  // Verify API is reachable
  const response = http.get(`${API_URL}/health`);
  if (response.status !== 200) {
    console.warn('WARNING: Health check failed. API may not be running.');
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(60));
  console.log(`Test completed in ${duration.toFixed(2)}s`);
  console.log('='.repeat(60));
}
