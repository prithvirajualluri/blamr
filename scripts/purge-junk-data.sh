#!/usr/bin/env bash
# Wipe all run telemetry (Postgres runs/blame + ClickHouse edges + drift cache).
# Keeps users, workspaces, and API keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Purging all workflow runs and blame reports from Postgres..."
docker compose exec -T postgres psql -U blamr -d blamr <<'SQL'
DELETE FROM blame_reports;
DELETE FROM workflow_runs;
SQL

echo "Truncating causal edges in ClickHouse..."
docker compose exec -T clickhouse clickhouse-client --query "TRUNCATE TABLE blamr.causal_edges"

echo "Clearing semantic drift cache in Valkey..."
docker compose exec -T valkey sh -c 'redis-cli KEYS "run:*" | xargs -r redis-cli DEL; redis-cli KEYS "emb:*" | xargs -r redis-cli DEL' 2>/dev/null || \
docker compose exec -T valkey sh -c 'for k in $(redis-cli KEYS "run:*"); do redis-cli DEL "$k"; done; for k in $(redis-cli KEYS "emb:*"); do redis-cli DEL "$k"; done' 2>/dev/null || true

echo "Done. Remaining runs:"
docker compose exec -T postgres psql -U blamr -d blamr -c \
  "SELECT count(*) AS workflow_runs FROM workflow_runs;"
docker compose exec -T clickhouse clickhouse-client --query \
  "SELECT count() AS causal_edges FROM blamr.causal_edges"
