#!/usr/bin/env bash
# Add source_hop_ids column for data-flow lineage on causal edges.
set -euo pipefail
CH="${CLICKHOUSE_URL:-http://localhost:8123}"
curl -sf "$CH/" --data-binary "ALTER TABLE blamr.causal_edges ADD COLUMN IF NOT EXISTS source_hop_ids Array(String) DEFAULT []"
echo "OK: source_hop_ids column on blamr.causal_edges"
