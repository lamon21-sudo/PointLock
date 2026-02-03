#!/bin/bash
# Regenerate Prisma Client - Unix/Linux/macOS Script
# Run this after updating schema.prisma

set -e

echo "========================================"
echo "Prisma Client Regeneration Script"
echo "========================================"
echo ""

cd "$(dirname "$0")/.."

echo "[1/4] Checking for running Node processes..."
if pgrep -x "node" > /dev/null; then
    echo "WARNING: Node processes are running."
    echo "Please close your IDE and dev servers, then run this script again."
    echo ""
    echo "Running Node processes:"
    ps aux | grep node | grep -v grep
    echo ""
    exit 1
fi
echo "OK: No node processes found."
echo ""

echo "[2/4] Removing old Prisma client cache..."
if [ -d "../../node_modules/.prisma/client" ]; then
    rm -rf "../../node_modules/.prisma/client"
    echo "Removed: node_modules/.prisma/client"
else
    echo "No cache found, skipping."
fi
echo ""

echo "[3/4] Generating Prisma client..."
npx prisma generate
echo ""

echo "[4/4] Verifying TypeScript compilation..."
npx tsc --noEmit
echo ""

echo "========================================"
echo "SUCCESS: Prisma client regenerated!"
echo "========================================"
echo ""
echo "You can now start your dev server."
echo ""
