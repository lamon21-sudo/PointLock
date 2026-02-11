# Release Checklist

## Pre-Release

### Code Quality
- [ ] All CI checks pass (lint, type check, unit tests)
- [ ] No new Sentry errors in staging
- [ ] Code reviewed and approved

### Database
- [ ] Migration tested on staging environment
- [ ] Manual backup of production database taken
- [ ] Reverse migration SQL prepared (if applicable)
- [ ] `npx prisma migrate status` recorded

### Configuration
- [ ] New environment variables added to Railway (if any)
- [ ] CORS domains verified for production
- [ ] Rate limit configuration reviewed
- [ ] Feature flags set correctly

### Testing
- [ ] Load test results reviewed (no regressions)
- [ ] Critical user flows tested on staging:
  - [ ] Registration + login
  - [ ] Create slip + join match
  - [ ] Settlement flow
  - [ ] Leaderboard loads
  - [ ] Wallet operations

---

## Deploy to Staging

1. [ ] Merge feature branch to `develop`
2. [ ] CI passes on develop branch
3. [ ] Auto-deploy to staging triggers
4. [ ] Verify staging health: `curl https://staging-api.pickrivals.com/health`
5. [ ] Run smoke tests on staging
6. [ ] Monitor Sentry for 15 minutes

---

## Deploy to Production

1. [ ] Merge `develop` to `master`
2. [ ] CI passes on master branch
3. [ ] Deployment triggers (or manual deploy via Railway)
4. [ ] Monitor deployment progress in Railway dashboard
5. [ ] Verify health check: `curl https://api.pickrivals.com/health`
6. [ ] Monitor Sentry error rates for 15 minutes

---

## Post-Release

### Immediate (first 30 minutes)
- [ ] Monitor Sentry for new errors
- [ ] Check Railway metrics (CPU, memory, response times)
- [ ] Verify queue workers are processing
- [ ] Test critical user flows in production

### Within 1 hour
- [ ] Check database query performance (no slow queries)
- [ ] Verify rate limiting is working
- [ ] Check cache hit rates
- [ ] Review application logs for warnings

### Follow-up
- [ ] Update changelog/release notes
- [ ] Notify team of successful deployment
- [ ] Close related issues/tickets

---

## Rollback Criteria

Immediately rollback if any of these occur:
- 5xx error rate > 1% for 5 minutes
- p95 latency > 2 seconds for 5 minutes
- Any financial operation failure
- Database migration failure
- Critical security vulnerability

See [rollback.md](./rollback.md) for rollback procedure.
