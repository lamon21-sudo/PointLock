# Quick Start - Load Testing

Get up and running with load tests in 5 minutes.

## Step 1: Install k6

**macOS:**
```bash
brew install k6
```

**Windows:**
```powershell
winget install k6
```

**Linux:**
```bash
sudo apt-get install k6
```

Verify installation:
```bash
k6 version
```

## Step 2: Setup Test Users

From the `apps/api` directory:

```bash
pnpm load:setup
```

This creates 200 test users with credentials:
- Email: `loadtest-1@example.com` to `loadtest-200@example.com`
- Password: `LoadTest123!`
- Each user gets 10,000 coins and a ready-to-use slip

## Step 3: Start API Server

In a separate terminal:

```bash
# From apps/api directory
pnpm dev
```

Wait for server to be ready (should see "Server listening on port 3000").

## Step 4: Run Load Test

```bash
# From apps/api directory
pnpm load:test
```

That's it! The test will run for ~2 minutes and display results.

## Quick Commands

| Command | Description |
|---------|-------------|
| `pnpm load:setup` | Create 200 test users |
| `pnpm load:setup:clean` | Delete and recreate test users |
| `pnpm load:test` | Run load test (console output) |
| `pnpm load:test:json` | Run load test (save JSON results) |

## Reading Results

### Good Results ✅

```
✓ http_req_duration.........: avg=145ms  p(95)=320ms  p(99)=420ms
✓ http_req_failed...........: 0.00%
✓ queue_join_duration.......: avg=185ms  p(95)=265ms
✓ match_found_rate..........: 75.56%
```

### Bad Results ❌

```
✗ http_req_duration.........: avg=1.2s   p(95)=2.5s   p(99)=5s
✗ http_req_failed...........: 5.23%
✗ queue_join_errors.........: 12.5%
✗ match_found_rate..........: 15.00%
```

## Common Issues

**"Login failed: 401"**
→ Run `pnpm load:setup` to create test users

**"k6: command not found"**
→ Install k6 (see Step 1)

**"Connection refused"**
→ Start API server with `pnpm dev`

**"Queue join errors > 5%"**
→ Check that test users have wallets and slips (run setup again)

## Next Steps

For detailed documentation, see [README.md](./README.md).

For CI/CD integration and advanced scenarios, check the README's "CI/CD Integration" and "Advanced Configuration" sections.
