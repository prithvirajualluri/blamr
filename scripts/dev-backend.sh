#!/usr/bin/env bash
# Start blamr backend services for LOCAL DEVELOPMENT ONLY.
# Workers must stay running for runs to appear in the dashboard — see docs/OPERATIONS.md.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then set -a && source .env && set +a; fi

echo "Initializing ClickHouse..."
./scripts/init-clickhouse.sh

echo "Building services..."
npm run build -w @blamr/semantic -w @blamr/ml -w @blamr/api -w @blamr/ingest -w @blamr/workers 2>&1 | tail -5

echo "Starting API (3000), Ingest (3001), Workers..."
node apps/api/dist/main.js &
node apps/ingest/dist/main.js &
node apps/workers/dist/apps/workers/src/main.js &

echo "Waiting for services..."
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"x","password":"y"}' 2>/dev/null || echo "000")
  if [ "$code" != "000" ]; then
    echo "API ready (HTTP $code)"
    break
  fi
  sleep 1
done

echo "Backend running. Start web: npm run dev:web"
echo "Run workflows: ./scripts/run-workflow.sh"
echo "Ops note: workers MUST stay up — see docs/OPERATIONS.md"
wait
