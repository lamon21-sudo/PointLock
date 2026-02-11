# Rollback Runbook

## Overview

Step-by-step procedures for rolling back the Pick-Rivals API after a failed deployment or critical production issue.

---

## Decision Criteria

Initiate rollback when any of these occur:
- 5xx error rate > 1% sustained for 5+ minutes (check Sentry)
- p95 response latency > 2 seconds sustained for 5+ minutes
- Any financial operation failure (wallet credit/debit, settlement)
- Database migration failure on production
- Critical security vulnerability discovered

---

## App Rollback (Railway)

### Quick Rollback via Railway Dashboard (< 2 minutes)

1. Go to [Railway Dashboard](https://railway.app) -> Pick-Rivals project
2. Select the API service
3. Click "Deployments" tab
4. Find the last known-good deployment (green checkmark)
5. Click the three-dot menu -> "Redeploy"
6. Wait for health check to pass (`GET /health` returns 200)
7. Monitor Sentry for 10 minutes

### Git-based Rollback

```bash
# 1. Identify the bad commit
git log --oneline -10

# 2. Revert the problematic commit(s)
git revert HEAD --no-edit

# 3. Push to trigger CI/CD
git push origin develop    # staging
git push origin master     # production (after staging verified)
```

### Docker Image Rollback

If using a specific image tag:
```bash
# Railway CLI
railway variables --set "RAILWAY_DOCKERFILE_PATH=Dockerfile"
railway up --detach
```

---

## Database Rollback

### Prisma Migration Rollback

Prisma does NOT support automatic "down" migrations. Options:

#### Option 1: Manual SQL Reverse Migration

1. Identify the migration to undo:
   ```bash
   cd apps/api && npx prisma migrate status
   ```

2. Check the migration SQL:
   ```bash
   cat prisma/migrations/<timestamp>_<name>/migration.sql
   ```

3. Write reverse SQL manually:
   ```sql
   -- Example: if migration added a column
   ALTER TABLE "User" DROP COLUMN IF EXISTS "newColumn";

   -- Example: if migration added a table
   DROP TABLE IF EXISTS "NewTable";
   ```

4. Execute against production:
   ```bash
   psql "$DATABASE_URL" -f manual_rollback.sql
   ```

5. Mark migration as rolled back:
   ```bash
   npx prisma migrate resolve --rolled-back <migration_name>
   ```

#### Option 2: Restore from Backup (Nuclear Option)

See [backup-restore.md](./backup-restore.md) for full restore procedure.

1. Take backup of current (broken) state
2. Restore pre-deployment backup
3. Redeploy previous app version
4. Verify data integrity

### Pre-Migration Checklist

Before running any migration:
- [ ] Take manual pg_dump backup
- [ ] Record `npx prisma migrate status` output
- [ ] Document expected schema changes
- [ ] Prepare reverse SQL if migration is destructive (DROP, ALTER)
- [ ] Test migration on staging first

---

## Redis Cache Flush

After any rollback, flush Redis to clear stale cache:

```bash
# Flush all Redis data
redis-cli -u "$REDIS_URL" FLUSHALL

# Or selectively flush rate limit keys only
redis-cli -u "$REDIS_URL" --scan --pattern "rl:*" | xargs redis-cli -u "$REDIS_URL" DEL
```

---

## Queue Drain Procedure

1. Stop adding new jobs (disable cron/webhooks if possible)
2. Monitor queue status:
   ```bash
   curl -H "Authorization: Bearer <admin-token>" \
     https://api.pickrivals.com/admin/live-scores/queue-status
   ```
3. Wait for active jobs to complete (check BullMQ dashboard or logs)
4. After rollback, restart workers -- they will pick up from where they left off

---

## Post-Rollback Smoke Tests

Run these checks after every rollback:

- [ ] `GET /health` returns `{ status: "healthy" }`
- [ ] `GET /health/ready` returns 200
- [ ] `POST /api/v1/auth/login` works with test credentials
- [ ] `GET /api/v1/events` returns event data
- [ ] `GET /api/v1/leaderboard` loads
- [ ] Check Sentry: no new errors in last 5 minutes
- [ ] Check Railway metrics: CPU/memory normal
- [ ] Verify queue workers are processing (check logs)
- [ ] Verify a test wallet balance is correct

---

## Communication

During a rollback:
1. Post in team Slack channel: "Rolling back API to [version/commit]. Reason: [brief description]"
2. After rollback complete: "Rollback complete. Monitoring for stability."
3. Post-mortem within 24 hours
