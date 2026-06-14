#!/usr/bin/env bash
# Add input/output preview columns to existing ClickHouse installs.
set -e
CH="${CLICKHOUSE_URL:-http://localhost:8123}"
curl -sf "$CH/" --data-binary "ALTER TABLE blamr.causal_edges ADD COLUMN IF NOT EXISTS input_preview String DEFAULT ''"
curl -sf "$CH/" --data-binary "ALTER TABLE blamr.causal_edges ADD COLUMN IF NOT EXISTS output_preview String DEFAULT ''"
echo "ClickHouse I/O preview columns ready"
