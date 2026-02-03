# Load Testing Implementation Summary

## Overview

Complete k6 load testing suite for PICK-RIVALS matchmaking queue system. Tests 100+ concurrent users joining queues, waiting for matches, and tracking performance metrics.

## Files Created

### 1. `matchmaking-queue.k6.js` (10.5 KB)
**Purpose:** Main k6 load test script

**Key Features:**
- Simulates realistic user behavior (login → get slip → join queue → poll status)
- Configurable via environment variables (API_URL, MAX_USERS, TEST_DURATION)
- 3-stage ramping: 0→50→100→0 users over 2 minutes
- Custom metrics tracking:
  - `queue_join_duration` - Latency to join queue
  - `match_found_rate` - Percentage of users matched
  - `queue_wait_time` - Time from join to match
  - `login_errors`, `queue_join_errors` - Error rates

**Thresholds:**
- p95 HTTP latency < 500ms
- p99 HTTP latency < 1000ms
- HTTP error rate < 1%
- Queue join p95 < 300ms

**Usage:**
```bash
k6 run load/matchmaking-queue.k6.js
API_URL=http://localhost:3000 MAX_USERS=200 k6 run load/matchmaking-queue.k6.js
```

### 2. `setup-load-test-users.ts` (9.6 KB)
**Purpose:** Database seeding script for test users

**What It Creates:**
- 200 test users (`loadtest-1@example.com` to `loadtest-200@example.com`)
- Password: `LoadTest123!` (bcrypt hashed)
- Wallets with 10,000 coins each (via STARTER_CREDIT transaction)
- Draft slips with 3 picks per user (ready to join queue)
- Mock events for pick references

**Features:**
- Idempotent - skips existing users
- Batch processing (10 users at a time)
- Transaction-safe (user + wallet + slip + picks in one transaction)
- Progress logging and error handling

**Usage:**
```bash
tsx load/setup-load-test-users.ts
tsx load/setup-load-test-users.ts --count 500
tsx load/setup-load-test-users.ts --clean
```

### 3. `validate-setup.ts` (11 KB)
**Purpose:** Pre-flight validation script

**Checks:**
- ✅ Database connectivity
- ✅ API server reachability (`/health` endpoint)
- ✅ Test users exist (expected count: 200)
- ✅ Wallets exist with sufficient balance (>1000 coins)
- ✅ Draft slips exist with picks
- ✅ Mock events exist
- ✅ Authentication works (test login)

**Exit Codes:**
- `0` - All checks passed
- `1` - Critical failures (missing users, API down, etc.)

**Usage:**
```bash
tsx load/validate-setup.ts
```

### 4. `k6.config.json` (1.1 KB)
**Purpose:** k6 configuration defaults

**Contains:**
- Scenario definitions (ramping-vus executor)
- Global thresholds
- Summary trend stats
- Tag configuration
- System tags for metrics

**Usage:**
```bash
k6 run --config load/k6.config.json load/matchmaking-queue.k6.js
```

### 5. `README.md` (11 KB)
**Purpose:** Comprehensive documentation

**Sections:**
- Prerequisites (k6 installation)
- Setup instructions (step-by-step)
- Running tests (basic and advanced)
- Interpreting results (what's good vs. bad)
- Troubleshooting (common issues)
- CI/CD integration (GitHub Actions example)
- Advanced configuration (custom scenarios)

### 6. `QUICKSTART.md` (2.2 KB)
**Purpose:** Get started in 5 minutes

**Target Audience:** Developers who want to run tests immediately

**Content:**
- 4-step quick start guide
- Command reference table
- Result interpretation (good vs. bad examples)
- Common issues with solutions

### 7. `.gitignore` (141 bytes)
**Purpose:** Exclude load test artifacts

**Excludes:**
- `*.json` (except `k6.config.json`)
- `load-test-results.json`
- `*.log`, `*.tmp`, `*.temp`

### 8. `IMPLEMENTATION_SUMMARY.md` (this file)
**Purpose:** Developer reference for the implementation

## NPM Scripts Added

```json
{
  "load:setup": "tsx load/setup-load-test-users.ts",
  "load:setup:clean": "tsx load/setup-load-test-users.ts --clean",
  "load:validate": "tsx load/validate-setup.ts",
  "load:test": "k6 run load/matchmaking-queue.k6.js",
  "load:test:json": "k6 run --out json=load-test-results.json load/matchmaking-queue.k6.js"
}
```

## Workflow

### First-Time Setup
```bash
# 1. Install k6
brew install k6  # or winget install k6

# 2. Create test users
pnpm load:setup

# 3. Validate setup
pnpm load:validate

# 4. Start API
pnpm dev  # in separate terminal

# 5. Run tests
pnpm load:test
```

### Subsequent Runs
```bash
# If API is already running
pnpm load:test

# If you need fresh test data
pnpm load:setup:clean && pnpm load:test
```

## Architecture Decisions

### Why k6?
- Industry-standard load testing tool
- JavaScript-based (familiar to team)
- Excellent CLI output and metrics
- Cloud integration available
- Open source and well-maintained

### Why JavaScript (not TypeScript)?
- k6 runtime doesn't natively support TypeScript
- Conversion overhead not worth it for test scripts
- File extension `.k6.js` clearly indicates k6 script

### Why Pre-Seeded Users?
- Avoids registration overhead during tests
- Ensures consistent starting state
- Allows testing at scale (200+ users)
- Prevents database bloat from test runs

### Why Draft Slips?
- Matchmaking requires a slip to join queue
- Creating slips during load test adds latency
- Pre-created slips isolate matchmaking performance
- Mirrors real-world scenario (users have saved slips)

### Why Mock Events?
- Picks require valid event references (foreign key)
- Creating real events is complex
- Mock events are sufficient for load testing
- Can be reused across test runs

## Metrics Tracked

### k6 Built-In Metrics
- `http_req_duration` - Full request latency
- `http_req_waiting` - Time to first byte
- `http_req_sending` - Request send time
- `http_req_receiving` - Response receive time
- `http_req_failed` - Failed request rate
- `http_reqs` - Total HTTP requests
- `data_received` - Bytes downloaded
- `data_sent` - Bytes uploaded
- `vus` - Active virtual users
- `vus_max` - Peak virtual users
- `iteration_duration` - Full test iteration time
- `iterations` - Completed iterations

### Custom Metrics
- `login_errors` (Rate) - Failed login attempts
- `queue_join_errors` (Rate) - Failed queue joins
- `queue_join_duration` (Trend) - Queue join latency
- `queue_wait_time` (Trend) - Time to get matched
- `match_found_rate` (Rate) - Match success rate
- `queue_status_checks` (Counter) - Status poll count
- `active_queuers` (Gauge) - Users in queue

## Performance Baselines

These are target metrics for a healthy system:

| Metric | Target | Critical |
|--------|--------|----------|
| `http_req_duration` p95 | < 300ms | < 500ms |
| `http_req_duration` p99 | < 500ms | < 1000ms |
| `http_req_failed` | < 0.5% | < 1% |
| `login_errors` | < 0.5% | < 1% |
| `queue_join_errors` | < 2% | < 5% |
| `queue_join_duration` p95 | < 200ms | < 300ms |
| `queue_wait_time` p95 | < 20s | < 30s |
| `match_found_rate` | > 80% | > 60% |

**Note:** Actual values depend on matchmaking algorithm and server resources.

## Known Limitations

1. **Match Completion Not Tested:** Tests only queue join and matchmaking, not full match lifecycle
2. **WebSocket Not Tested:** Real-time updates use Socket.IO, not tested here
3. **Fixed Load Pattern:** Only tests ramping load, not spike or soak tests
4. **Single Region:** Tests only one region (configurable but not multi-region)
5. **No Opponent Simulation:** Doesn't simulate opponent actions after match

## Future Enhancements

### Potential Additions
- **Spike Test:** Sudden load increase (0→200 in 10s)
- **Soak Test:** Sustained load for 1 hour
- **Stress Test:** Gradually increase until failure
- **WebSocket Test:** Test Socket.IO real-time updates
- **Full Match Flow:** Complete match from join to settlement
- **Multi-Region:** Test cross-region matchmaking
- **Opponent Bot:** Simulate opponent building slips

### CI/CD Integration
- GitHub Actions workflow (example in README)
- Automated nightly runs
- Performance regression detection
- Result archiving and trending

## Troubleshooting Guide

### Setup Issues

**Problem:** `tsx: command not found`
**Solution:** `pnpm install` in `apps/api` directory

**Problem:** `Cannot connect to database`
**Solution:** Check `.env` DATABASE_URL and PostgreSQL status

**Problem:** `Unique constraint violation on email`
**Solution:** Run `pnpm load:setup:clean` to delete and recreate

### Test Execution Issues

**Problem:** `k6: command not found`
**Solution:** Install k6 (see QUICKSTART.md)

**Problem:** `Connection refused to localhost:3000`
**Solution:** Start API with `pnpm dev`

**Problem:** `Login failed: 401 Unauthorized`
**Solution:** Run `pnpm load:setup` to create test users

**Problem:** High `queue_join_errors` rate
**Solution:** Check wallet balances, slips exist, and events exist

### Performance Issues

**Problem:** High `http_req_duration` (>1s at p95)
**Solution:**
- Check database query performance
- Verify indexes exist on queried columns
- Check Redis connectivity
- Monitor server CPU/memory usage

**Problem:** Low `match_found_rate` (<50%)
**Solution:**
- Increase concurrent users (more players = more matches)
- Check matchmaking worker is running
- Verify matchmaking algorithm constraints
- Check queue timeout settings

**Problem:** High `queue_wait_time` (>30s at p95)
**Solution:**
- Tune matchmaking algorithm
- Reduce tier/skill constraints
- Increase matchmaking worker poll frequency
- Check for deadlocks in queue processing

## Support and Maintenance

### Regular Maintenance
- Update k6 version quarterly
- Adjust thresholds as system improves
- Archive load test results for trending
- Review and update test scenarios

### When to Run Load Tests
- Before major releases
- After infrastructure changes
- When matchmaking algorithm changes
- During performance optimization sprints
- Nightly in CI/CD (recommended)

### Interpreting Trends
- Track p95/p99 latency over time
- Monitor error rates for regressions
- Compare results across git commits
- Use JSON output for historical analysis

## References

- [k6 Documentation](https://k6.io/docs/)
- [k6 HTTP Module](https://k6.io/docs/javascript-api/k6-http/)
- [k6 Metrics](https://k6.io/docs/using-k6/metrics/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [k6 Cloud](https://k6.io/cloud/)

## Contact

For questions or issues with load testing:
1. Check troubleshooting sections in this doc
2. Review API server logs
3. Run `pnpm load:validate` to check setup
4. Verify database state and indexes

---

**Last Updated:** 2026-02-02
**Author:** Backend Engineering Team
**Version:** 1.0.0
