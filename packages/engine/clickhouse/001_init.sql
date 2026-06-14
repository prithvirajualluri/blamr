CREATE DATABASE IF NOT EXISTS blamr;

CREATE TABLE IF NOT EXISTS blamr.causal_edges (
    id String,
    run_id String,
    workflow_id String,
    workspace_id String,
    from_agent String,
    to_agent String,
    hop_index Int32,
    timestamp_ms Int64,
    confidence_in Float64,
    confidence_out Float64,
    intent_delta Float64,
    influence_score Float64,
    tokens_in Int32,
    tokens_out Int32,
    latency_ms Int32,
    model String,
    call_type String,
    cost_usd Float64,
    prev_hash String,
    edge_hash String,
    input_preview String DEFAULT '',
    output_preview String DEFAULT '',
    ingested_at DateTime64(3) DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (workspace_id, run_id, hop_index)
TTL ingested_at + INTERVAL 30 DAY;

CREATE TABLE IF NOT EXISTS blamr.run_summaries (
    run_id String,
    workflow_id String,
    workspace_id String,
    status String,
    accuracy_score Float64,
    total_tokens Int64,
    total_cost_usd Float64,
    duration_ms Int64,
    agent_count Int32,
    started_at Int64,
    ended_at Int64,
    updated_at DateTime64(3) DEFAULT now64(3)
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (workspace_id, workflow_id, run_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS blamr.run_summaries_mv
TO blamr.run_summaries
AS SELECT
    run_id,
    workflow_id,
    workspace_id,
    'running' AS status,
    0.0 AS accuracy_score,
    sum(tokens_in + tokens_out) AS total_tokens,
    sum(cost_usd) AS total_cost_usd,
    sum(latency_ms) AS duration_ms,
    uniqExact(from_agent) + uniqExact(to_agent) AS agent_count,
    min(timestamp_ms) AS started_at,
    max(timestamp_ms) AS ended_at,
    now64(3) AS updated_at
FROM blamr.causal_edges
GROUP BY run_id, workflow_id, workspace_id;
