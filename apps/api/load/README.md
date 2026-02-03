# k6 Load Tests - Matchmaking Queue

Comprehensive load testing suite for the PICK-RIVALS matchmaking queue system using k6.

## Overview

This test suite simulates 100+ concurrent users joining the matchmaking queue, tracking performance metrics including:

- Queue join latency
- Match found rates
- Queue wait times
- Error rates
- HTTP request performance

## Prerequisites

### 1. Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```powershell
winget install k6
```

Or download from: https://k6.io/docs/get-started/installation/

### 2. Verify Installation

```bash
k6 version
```

### 3. Database Setup

Ensure your PostgreSQL database is running and migrated:

```bash
# From apps/api directory
pnpm prisma migrate deploy
```

## Setup Test Users

Before running load tests, create test users with wallets and draft slips:

```bash
# From apps/api directory
tsx load/setup-load-test-users.ts
```

### Setup Options

**Create 200 users (default):**
```bash
tsx load/setup-load-test-users.ts
```

**Create custom number of users:**
```bash
tsx load/setup-load-test-users.ts --count 500
```

**Clean up and recreate:**
```bash
tsx load/setup-load-test-users.ts --clean
```

### What Gets Created

For each test user:
- Email: `loadtest-{n}@example.com`
- Username: `loadtest{n}`
- Password: `LoadTest123!`
- Wallet: 10,000 coins starting balance
- Draft slip: 1 slip with 3 picks (ready to join queue)

## Running Load Tests

### Basic Test Run

```bash
# From apps/api directory
k6 run load/matchmaking-queue.k6.js
```

### With Custom API URL

```bash
API_URL=http://localhost:3000 k6 run load/matchmaking-queue.k6.js
```

### With Custom Configuration

```bash
# Override max users
MAX_USERS=200 k6 run load/matchmaking-queue.k6.js

# Override test duration
TEST_DURATION=5m k6 run load/matchmaking-queue.k6.js
```

### Save Results to JSON

```bash
k6 run --out json=results.json load/matchmaking-queue.k6.js
```

### Cloud Run (k6 Cloud)

```bash
k6 cloud load/matchmaking-queue.k6.js
```

## Test Configuration

### Load Profile

The test uses ramping stages:

1. **Ramp Up (30s)**: 0 → 50 concurrent users
2. **Peak Load (1m)**: 50 → 100 concurrent users
3. **Ramp Down (30s)**: 100 → 0 users

Total duration: ~2 minutes

### Performance Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration` | p95 < 500ms, p99 < 1000ms | HTTP request latency |
| `http_req_failed` | < 1% | HTTP-level errors (4xx, 5xx) |
| `login_errors` | < 1% | Failed login attempts |
| `queue_join_errors` | < 5% | Failed queue join attempts |
| `queue_join_duration` | p95 < 300ms | Time to join queue |
| `queue_wait_time` | p95 < 30s | Time from join to match |

### Custom Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `login_errors` | Rate | Percentage of failed logins |
| `queue_join_errors` | Rate | Percentage of failed queue joins |
| `queue_join_duration` | Trend | Latency to join queue |
| `queue_wait_time` | Trend | Time waiting in queue for match |
| `match_found_rate` | Rate | Percentage of users matched |
| `queue_status_checks` | Counter | Total queue status polls |
| `active_queuers` | Gauge | Current users in queue |

## Interpreting Results

### Terminal Output

k6 provides real-time feedback during test execution:

```
running (0m30.0s), 000/100 VUs, 45 complete and 0 interrupted iterations
matchmaking_queue_load ✓ [======================================] 000/100 VUs  0m30s

     ✓ login: status is 200
     ✓ login: has access token
     ✓ queue_join: status is 201
     ✓ queue_join: has entry id

     checks.........................: 100.00% ✓ 180      ✗ 0
     data_received..................: 125 kB  4.2 kB/s
     data_sent......................: 89 kB   3.0 kB/s
     http_req_duration..............: avg=145ms  min=45ms   med=120ms  max=450ms  p(90)=250ms p(95)=320ms p(99)=420ms
     http_req_failed................: 0.00%   ✓ 0        ✗ 180
     login_errors...................: 0.00%   ✓ 0        ✗ 45
     queue_join_duration............: avg=185ms  min=95ms   med=175ms  max=285ms  p(90)=235ms p(95)=265ms
     queue_join_errors..............: 2.22%   ✓ 1        ✗ 44
     queue_status_checks............: 450     15.0/s
     queue_wait_time................: avg=12s    min=2.1s   med=10.5s  max=29.8s  p(90)=22s   p(95)=26s
     match_found_rate...............: 75.56%  ✓ 34       ✗ 11
```

### Key Indicators

**✅ Test Passing:**
- All thresholds green (no red ✗ marks)
- `http_req_failed` < 1%
- `match_found_rate` > 60% (depends on matchmaking algorithm)
- `queue_join_duration` p95 < 300ms

**⚠️ Warning Signs:**
- `login_errors` > 1% → Auth service issues
- `queue_join_errors` > 5% → Wallet/business logic issues
- `queue_wait_time` > 30s at p95 → Matchmaking too slow
- `match_found_rate` < 50% → Not enough users or matchmaking issues

**❌ Critical Issues:**
- `http_req_failed` > 5% → Server crashes or database issues
- `http_req_duration` p95 > 1s → Performance degradation
- Threshold failures → Load test failed

### Analyzing JSON Output

If you saved results with `--out json=results.json`:

```bash
# View metrics summary
jq '.metrics' results.json | less

# Extract failed checks
jq 'select(.type=="Point" and .metric=="checks" and .data.value==0)' results.json

# View custom metric trends
jq 'select(.metric=="queue_join_duration")' results.json | jq -s 'map(.data.value) | add/length'
```

## Troubleshooting

### Test Users Not Found

**Error:** `Login failed: 401 Unauthorized`

**Solution:**
```bash
# Run setup script
tsx load/setup-load-test-users.ts
```

### Database Connection Errors

**Error:** `Connection terminated unexpectedly`

**Solution:**
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in `.env`
- Check connection limits in `postgresql.conf`

### Queue Join Failures

**Error:** `queue_join_errors` > 5%

**Common causes:**
- Insufficient wallet balance (check test user wallets)
- Missing draft slips (run setup script)
- Database locks under load (check `max_connections`)

### No Matches Found

**Error:** `match_found_rate` = 0%

**Common causes:**
- Matchmaking worker not running
- Queue timeout too short
- Not enough concurrent users (increase `MAX_USERS`)
- Tier/skill mismatches preventing matches

### High Latency

**Error:** `http_req_duration` p95 > 1s

**Common causes:**
- Database not indexed properly
- Redis connection issues
- Insufficient server resources
- N+1 query problems

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Run nightly at 2am
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update
          sudo apt-get install k6

      - name: Install dependencies
        run: pnpm install

      - name: Run migrations
        run: pnpm prisma migrate deploy
        working-directory: apps/api

      - name: Setup test users
        run: tsx load/setup-load-test-users.ts
        working-directory: apps/api

      - name: Start API server
        run: pnpm dev &
        working-directory: apps/api

      - name: Wait for API
        run: npx wait-on http://localhost:3000/health

      - name: Run load tests
        run: k6 run --out json=load-test-results.json load/matchmaking-queue.k6.js
        working-directory: apps/api

      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: load-test-results
          path: apps/api/load-test-results.json
```

## Best Practices

### Before Running Tests

1. **Isolate environment**: Don't run on production
2. **Clean state**: Reset database between runs for consistency
3. **Monitor resources**: Watch CPU, memory, disk I/O during tests
4. **Baseline first**: Run with 10 users to establish baseline

### During Tests

1. **Monitor logs**: `tail -f apps/api/logs/combined.log`
2. **Watch database**: `pg_stat_activity` for connection counts
3. **Check Redis**: `redis-cli INFO stats`
4. **Monitor API**: Dashboard or APM tool

### After Tests

1. **Review all thresholds**: Don't just check pass/fail
2. **Compare to baseline**: Track performance over time
3. **Check error logs**: Investigate any 4xx/5xx responses
4. **Profile slow endpoints**: Use `http_req_duration` by URL

## Advanced Configuration

### Custom Scenarios

Edit `load/matchmaking-queue.k6.js` to add scenarios:

```javascript
export const options = {
  scenarios: {
    // Sustained load
    steady_state: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
    // Spike test
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      stages: [
        { duration: '10s', target: 100 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 10 },
      ],
    },
  },
};
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | Base API URL |
| `MAX_USERS` | `100` | Maximum concurrent users |
| `TEST_DURATION` | `2m` | Total test duration |

## Support

For issues or questions:
1. Check server logs: `apps/api/logs/`
2. Review database queries: Enable query logging
3. Check k6 docs: https://k6.io/docs/

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 Examples](https://k6.io/docs/examples/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [k6 Metrics](https://k6.io/docs/using-k6/metrics/)
