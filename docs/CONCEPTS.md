# Core concepts

How blamr models multi-agent failures — causal edges, drift signals, and blame attribution.

For the full end-to-end pipeline and dashboard business logic, see **[CAUSAL_MONITORING.md](./CAUSAL_MONITORING.md)**.

For installation and SDK usage, see [INSTALL.md](./INSTALL.md).

---

## CausalEdge

Novel fields not in OpenTelemetry or standard trace specs:

| Field | Range | Purpose |
|-------|-------|---------|
| `confidence_in` / `confidence_out` | 0–1 | Chained certainty; composite from lexical + structured + tool + alignment ceiling |
| `intent_delta` | −1–0 | Goal drift per hop (domain alignment + relevance + semantic merge) |
| `influence_score` | 0–1 | Downstream causal weight |
| `input_preview` / `output_preview` | string | Truncated I/O for trace UI and embeddings |
| `edge_hash` | SHA256 | Merkle-chained audit trail |

Agent-side signals use `@blamr/sdk` helpers: `computeHopSignals()` merges lexical, JSON `confidence`, tool scores, and alignment ceilings before ingest.

---

## Cost and token telemetry

blamr sums `cost_usd` and token counts from ingested edges — it does **not** call OpenAI or Anthropic billing APIs.

| Source | Accuracy | Agent change |
|--------|----------|--------------|
| Explicit `tokens_in` / `tokens_out` / `cost_usd` on each edge | Exact | Pass provider `usage` on `emitEdge` |
| SDK auto-enrich (`BLAMR_ENRICH_USAGE=1`, default on) | Estimated from previews + model pricing | None if previews + model are already sent |
| `record_provider_usage` + `emit_edge` (Python) or `wrapClient` (TS) | Exact from last LLM call | Init/wrapper only |

Python and TypeScript SDKs share the same env flags: `BLAMR_ENRICH_USAGE`, `BLAMR_ATTACH_PROVIDER_USAGE`.

The dashboard **Workflows → Instrumentation** column surfaces integration gaps (missing usage, collapsed `from_agent`, wrong intent sign, etc.) from recent runs.

---

## Confidence accept level

Set a per-workflow minimum confidence. Runs below the threshold are marked **failed** (workers re-check server-side from ingested edges).

```typescript
const emitter = new BlamrEmitter(
  {
    workflowId: 'incident-triage',
    agentId: 'alert_classifier',
    workflowConfig: {
      confidence_accept_level: 0.72,
      confidence_gate_mode: 'final', // or 'min' — every hop must clear threshold
    },
  },
  process.env.BLAMR_API_KEY!,
  process.env.BLAMR_ENDPOINT ?? 'http://localhost:3001/v1',
);

await emitter.completeRun({
  businessFailed: false,
  errorSummary: 'optional message',
});
```

Sample agents define defaults in `samples/agents/src/lib/workflow-config.ts`. Override via env: `BLAMR_ACCEPT_INCIDENT_TRIAGE=0.80`.

Server-side profiles (no agent code change) — **Settings → Workspace → Workflow profiles** or `PATCH /v1/workspace`:

```json
{
  "workflow_configs": {
    "any-workflow-id": {
      "confidence_accept_level": 0.75,
      "confidence_gate_mode": "min",
      "domain_type": "generic",
      "goal_hop_index": 0
    }
  }
}
```

---

## Platform mode (definition-free workflows)

No workflow registry required — emit edges with any `workflow_id` and agent names.

| Env | Default | Meaning |
|-----|---------|---------|
| `BLAMR_MUTATE_EDGES` | off | **Telemetry-first**: agent `confidence_out` / `intent_delta` are authoritative; ML/semantic store hints only |
| `BLAMR_MUTATE_EDGES=1` | — | Legacy: ML/semantic may overwrite edge telemetry |
| `BLAMR_ML_ENABLED` | on | Hop drift classification + blame fusion |
| `BLAMR_SEMANTIC_DRIFT` | on | Embedding similarity hints via local Ollama |

---

## Semantic intent drift (workers)

Ingest returns immediately. Workers enrich edges **asynchronously** before ClickHouse insert:

1. **Tool/MCP hops** — embed `input_preview` vs `output_preview` (e.g. leave intent → payroll policy)
2. **Downstream hops** — embed run goal (first hop input) vs output
3. **Merge** — `intent_delta = min(workflow_value, semantic_value)`; `confidence_out = min(reported, semantic_similarity_ceiling)`

---

## ML drift + root-cause ranker

Production models in `packages/ml/models/` classify hop-level drift and rank root-cause agents. Fused with rule-based blame (`BLAMR_ML_FUSION_ALPHA`, default 55% ML).

| Drift type | Meaning |
|------------|---------|
| `domain_mismatch` | Tool/output wrong domain (e.g. leave → payroll) |
| `retrieval_miss` | KB/tool returned weak or irrelevant results |
| `severity_underrate` | Incident severity too low for alert class |
| `confidence_inflation` | High confidence despite downstream fault |
| `propagation` | Downstream echo of upstream error |

Retrain on synthetic + production data:

```bash
npm run train:ml
# or export real runs: cd training && python3 export_from_db.py && python3 train.py
```

---

## Blame attribution

On run completion, workers compute **fault-weighted blame** from `intent_delta`, confidence drops, and influence — then optionally call an **LLM** to write plain-language reasons citing trace I/O.

| Run status | Dashboard tab | Meaning |
|------------|---------------|---------|
| Failed | **Blame** | Root cause + fault % |
| Success | **Attribution** | Influence distribution (not fault) |

The Rust blame engine (`packages/engine/`) is available for gRPC deployments; local dev uses the TypeScript workers pipeline.

---

## Configuration reference

Copy [`.env.example`](../.env.example). Key variables:

| Variable | Service | Description |
|----------|---------|-------------|
| `BLAMR_LLM_BASE_URL` | workers | Ollama API (default `http://localhost:11434/v1`) |
| `BLAMR_SEMANTIC_DRIFT` | workers | `true` / `false` |
| `BLAMR_SEMANTIC_SETTLE_MS` | workers | Wait before blame (default `2000`) |
| `BLAMR_LLM_BLAME_REASON` | workers | Narrative reasons on failed runs |
| `BLAMR_LLM_REASON_MODEL` | workers | Default `llama3.2:3b` |
| `BLAMR_EMBEDDING_MODEL` | workers | Default `nomic-embed-text` |
| `BLAMR_API_KEY` | agents | Ingest key from dashboard |
| `BLAMR_ENDPOINT` | agents | Default `http://localhost:3001/v1` |
| `BLAMR_ENRICH_USAGE` | agents | Estimate tokens/cost from previews when omitted (default on) |
| `BLAMR_ATTACH_PROVIDER_USAGE` | agents | Attach wrapped LLM provider usage to next edge (default on) |
