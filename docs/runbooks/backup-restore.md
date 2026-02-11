# Backup & Restore Runbook

## Overview

This document covers database backup and restore procedures for Pick-Rivals. The primary database is PostgreSQL, deployed on Railway.

---

## Railway Managed Backups

Railway PostgreSQL provides automated daily backups with 7-day retention on the Pro plan.

### Accessing Railway Backups
1. Go to Railway dashboard -> Project -> PostgreSQL service
2. Click "Backups" tab
3. Select the desired backup point
4. Click "Restore" to restore to that point

### Important Notes
- Railway backups are point-in-time snapshots
- Restoration replaces the entire database
- Always verify the backup timestamp before restoring

---

## Manual Backup (pg_dump)

For pre-deployment or ad-hoc backups, use `pg_dump` directly.

### Prerequisites
- PostgreSQL client tools installed (`pg_dump`, `pg_restore`)
- `DATABASE_URL` environment variable set (from Railway dashboard or `.env`)

### Create Backup

```bash
# Standard custom-format backup (recommended)
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="backup_$(date +%Y%m%d_%H%M%S).dump"

# Verify the backup file
ls -lh backup_*.dump
pg_restore --list backup_*.dump | head -20
```

### Create SQL Backup (human-readable)

```bash
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-acl \
  > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

---

## Restore Procedures

### Restore to Local Database (Testing)

```bash
# 1. Create a disposable local database
createdb pickrivals_restore_test

# 2. Restore the backup
pg_restore \
  --dbname="postgresql://postgres:password@localhost:5432/pickrivals_restore_test" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  backup_YYYYMMDD_HHMMSS.dump

# 3. Verify data
psql "postgresql://postgres:password@localhost:5432/pickrivals_restore_test" \
  -c "SELECT COUNT(*) FROM \"User\";"

# 4. Clean up
dropdb pickrivals_restore_test
```

### Restore to Production (DANGER)

Only perform this in emergencies. This will OVERWRITE all current data.

```bash
# 1. Take a fresh backup of current state first!
pg_dump "$DATABASE_URL" --format=custom --no-owner \
  --file="pre_restore_$(date +%Y%m%d_%H%M%S).dump"

# 2. Restore
pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  backup_YYYYMMDD_HHMMSS.dump

# 3. Verify
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"User\";"
```

---

## Pre-Deployment Backup Procedure

Before any migration or deployment:

1. Take manual backup:
   ```bash
   pg_dump "$DATABASE_URL" --format=custom --no-owner \
     --file="pre_deploy_$(date +%Y%m%d_%H%M%S).dump"
   ```
2. Verify backup file size is > 0 bytes
3. Record current migration state:
   ```bash
   cd apps/api && npx prisma migrate status
   ```
4. Store backup in secure location (NOT in git)
5. Proceed with deployment

---

## Redis Data

Redis stores ephemeral data (queues, cache, rate limits). No backup is typically needed.

- **If needed**, flush Redis cache after restore:
  ```bash
  redis-cli -u "$REDIS_URL" FLUSHALL
  ```
- Queue workers will rebuild their state automatically on restart

---

## Verification Checklist

After any restore:

- [ ] `SELECT COUNT(*) FROM "User"` returns expected count
- [ ] `SELECT COUNT(*) FROM "Wallet"` matches user count
- [ ] `SELECT COUNT(*) FROM "Match" WHERE status = 'active'` looks reasonable
- [ ] API health check returns healthy: `curl /health`
- [ ] Auth login works with a known test account
- [ ] Prisma migration status is clean: `npx prisma migrate status`
