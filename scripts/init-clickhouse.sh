#!/usr/bin/env bash
# Initialize ClickHouse schema for local dev
set -e
CH="${CLICKHOUSE_URL:-http://localhost:8123}"
run_query() {
  curl -sf "$CH/" --data-binary "$1"
  echo
}

run_query "CREATE DATABASE IF NOT EXISTS blamr"
run_query "CREATE TABLE IF NOT EXISTS blamr.causal_edges (
    id String, run_id String, workflow_id String, workspace_id String,
    from_agent String, to_agent String, hop_index Int32, timestamp_ms Int64,
    confidence_in Float64, confidence_out Float64, intent_delta Float64,
    influence_score Float64, tokens_in Int32, tokens_out Int32, latency_ms Int32,
    model String, call_type String, cost_usd Float64, prev_hash String, edge_hash String,
    input_preview String DEFAULT '', output_preview String DEFAULT '',
    ingested_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree() ORDER BY (workspace_id, run_id, hop_index)"
echo "ClickHouse schema ready"
