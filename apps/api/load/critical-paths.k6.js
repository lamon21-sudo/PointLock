// =====================================================
// k6 Load Test: Critical Paths
// =====================================================
// Tests critical API endpoints under various load patterns.
// Validates health checks, authentication, and public endpoints.
//
// Usage:
//   k6 run load/critical-paths.k6.js
//   API_URL=http://localhost:3000 k6 run load/critical-paths.k6.js
//   k6 run --out json=results.json load/critical-paths.k6.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// =====================================================
// Configuration
// =====================================================

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const MAX_USERS = parseInt(__ENV.MAX_USERS || '30');

// =====================================================
// Custom Metrics
// =====================================================

const healthCheckErrors = new Rate('health_check_errors');
const loginErrors = new Rate('login_errors');
const eventsErrors = new Rate('events_errors');
const leaderboardErrors = new Rate('leaderboard_errors');

const healthCheckDuration = new Trend('health_check_duration');
const loginDuration = new Trend('login_duration');
const eventsDuration = new Trend('events_duration');
const leaderboardDuration = new Trend('leaderboard_duration');

const totalRequests = new Counter('total_requests');
const totalErrors = new Counter('total_errors');

// =====================================================
// Test Configuration
// =====================================================

export const options = {
  scenarios: {
    // Scenario 1: Health Endpoint Baseline
    health_baseline: {
      executor: 'constant-vus',
      exec: 'healthCheck',
      vus: 10,
      duration: '30s',
      tags: { scenario: 'health_baseline' },
    },

    // Scenario 2: Auth Login Load
    auth_login_load: {
      executor: 'ramping-vus',
      exec: 'authLogin',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 30 },  // Ramp up to 30 users over 15s
        { duration: '30s', target: 30 },  // Hold 30 users for 30s
        { duration: '15s', target: 0 },   // Ramp down to 0 over 15s
      ],
      tags: { scenario: 'auth_login_load' },
    },

    // Scenario 3: Public Endpoints (Events + Leaderboard)
    public_endpoints: {
      executor: 'constant-vus',
      exec: 'publicEndpoints',
      vus: 20,
      duration: '30s',
      tags: { scenario: 'public_endpoints' },
    },
  },

  thresholds: {
    // HTTP request duration thresholds
    'http_req_duration': ['p(95)<500'],

    // Scenario-specific thresholds
    'http_req_duration{scenario:health_baseline}': ['p(95)<100'],
    'http_req_duration{scenario:auth_login_load}': ['p(95)<500'],
    'http_req_duration{scenario:public_endpoints}': ['p(95)<300'],

    // Error rate thresholds
    'http_req_failed': ['rate<0.01'],  // Less than 1% HTTP errors
    'health_check_errors': ['rate<0.01'],
    'login_errors': ['rate<0.01'],
    'events_errors': ['rate<0.01'],
    'leaderboard_errors': ['rate<0.01'],

    // Custom metric thresholds
    'health_check_duration': ['p(95)<100'],
    'login_duration': ['p(95)<500'],
    'events_duration': ['p(95)<300'],
    'leaderboard_duration': ['p(95)<300'],
  },

  // Disable built-in metrics we don't need
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// =====================================================
// Helper Functions
// =====================================================

/**
 * Get user credentials based on virtual user ID.
 * Uses pre-seeded loadtest users: loadtest-1@example.com to loadtest-30@example.com
 */
function getUserCredentials(vuId) {
  const userId = ((vuId - 1) % MAX_USERS) + 1;
  return {
    email: `loadtest-${userId}@example.com`,
    password: 'LoadTest123!',
  };
}

// =====================================================
// Scenario 1: Health Check Baseline
// =====================================================

export function healthCheck() {
  const startTime = Date.now();

  const params = {
    tags: { name: 'health_check' },
  };

  const response = http.get(`${API_URL}/health`, params);
  const duration = Date.now() - startTime;

  totalRequests.add(1);

  const success = check(response, {
    'health: status is 200': (r) => r.status === 200,
    'health: has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok';
      } catch (e) {
        return false;
      }
    },
  });

  healthCheckErrors.add(!success);
  healthCheckDuration.add(duration);

  if (!success) {
    totalErrors.add(1);
    console.error(`Health check failed: ${response.status} ${response.body}`);
  }

  sleep(0.5);
}

// =====================================================
// Scenario 2: Auth Login Load
// =====================================================

export function authLogin() {
  const credentials = getUserCredentials(__VU);
  const startTime = Date.now();

  const payload = JSON.stringify({
    email: credentials.email,
    password: credentials.password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'auth_login' },
  };

  const response = http.post(`${API_URL}/api/v1/auth/login`, payload, params);
  const duration = Date.now() - startTime;

  totalRequests.add(1);

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
    'login: has user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && body.data.user && body.data.user.id;
      } catch (e) {
        return false;
      }
    },
  });

  loginErrors.add(!success);
  loginDuration.add(duration);

  if (!success) {
    totalErrors.add(1);
    console.error(`Login failed for ${credentials.email}: ${response.status} ${response.body}`);
  }

  sleep(1);
}

// =====================================================
// Scenario 3: Public Endpoints
// =====================================================

export function publicEndpoints() {
  // Alternate between events and leaderboard
  const endpoint = __ITER % 2 === 0 ? 'events' : 'leaderboard';

  if (endpoint === 'events') {
    testEventsEndpoint();
  } else {
    testLeaderboardEndpoint();
  }

  sleep(0.5);
}

/**
 * Test GET /api/v1/events endpoint.
 */
function testEventsEndpoint() {
  const startTime = Date.now();

  const params = {
    tags: { name: 'get_events' },
  };

  const response = http.get(`${API_URL}/api/v1/events`, params);
  const duration = Date.now() - startTime;

  totalRequests.add(1);

  const success = check(response, {
    'events: status is 200': (r) => r.status === 200,
    'events: has data field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && Array.isArray(body.data.events);
      } catch (e) {
        return false;
      }
    },
  });

  eventsErrors.add(!success);
  eventsDuration.add(duration);

  if (!success) {
    totalErrors.add(1);
    console.error(`Events endpoint failed: ${response.status} ${response.body}`);
  }
}

/**
 * Test GET /api/v1/leaderboard endpoint.
 */
function testLeaderboardEndpoint() {
  const startTime = Date.now();

  const params = {
    tags: { name: 'get_leaderboard' },
  };

  const response = http.get(`${API_URL}/api/v1/leaderboard`, params);
  const duration = Date.now() - startTime;

  totalRequests.add(1);

  const success = check(response, {
    'leaderboard: status is 200': (r) => r.status === 200,
    'leaderboard: has data field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && Array.isArray(body.data.entries);
      } catch (e) {
        return false;
      }
    },
  });

  leaderboardErrors.add(!success);
  leaderboardDuration.add(duration);

  if (!success) {
    totalErrors.add(1);
    console.error(`Leaderboard endpoint failed: ${response.status} ${response.body}`);
  }
}

// =====================================================
// Setup and Teardown
// =====================================================

export function setup() {
  console.log('='.repeat(60));
  console.log('k6 Load Test: Critical Paths');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Max Users: ${MAX_USERS}`);
  console.log('='.repeat(60));

  // Verify API is reachable
  const response = http.get(`${API_URL}/health`);
  if (response.status !== 200) {
    console.warn('WARNING: Health check failed. API may not be running.');
  } else {
    console.log('✓ API health check passed');
  }

  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log('='.repeat(60));
  console.log(`Test completed in ${duration.toFixed(2)}s`);
  console.log('='.repeat(60));
}
