# blamr

[![CI](https://github.com/blamr-ai/blamr/actions/workflows/ci.yml/badge.svg)](https://github.com/blamr-ai/blamr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Causal intelligence platform for multi-agent AI systems.**

blamr answers: **which agent caused a failure, and why?**

Existing tools (LangSmith, Langfuse, AgentOps) record what happened — spans, tokens, latency. blamr is a crash investigator. It traces a **causal graph** of agent handoffs, attributes blame from telemetry signals (and semantic I/O drift), and surfaces root cause with human-readable reasons.

---

## Quick start

### Option A — Full stack in Docker (fastest)

Run API, ingest, workers, dashboard, and all data stores in containers:

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.docker.example .env
./scripts/docker-up.sh
```

Open **http://localhost:8080** → register → create an ingest API key → run sample agents from your host.

**Install & connect (all paths):** **[docs/INSTALL.md](docs/INSTALL.md)** — Docker, local dev, SDK, MCP proxy, adapters.

Full deployment guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

### Option B — Local development (hot reload)

#### 1. Infrastructure

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.example .env
npm install

docker compose up -d postgres clickhouse redpanda valkey ollama ollama-init
./scripts/init-clickhouse.sh
```

#### 2. Backend + dashboard

**Terminal A** — API, ingest, workers:

```bash
# Ollama must be running for semantic drift + LLM blame reasons on workers
./scripts/dev-backend.sh
```

**Terminal B** — dashboard:

```bash
npm run dev:web
```

Open **http://localhost:8080** → register a workspace → **Settings → API & keys** → create a key with `ingest:write`.

> **Workers must stay running.** Ingest returns `202` immediately; workers write edges to ClickHouse and finalize runs in Postgres. If the dashboard shows no runs after `completeRun`, check workers — see [docs/OPERATIONS.md](docs/OPERATIONS.md).

#### 3. Run sample agents

```bash
cp samples/agents/.env.example samples/agents/.env
# BLAMR_API_KEY only — Ollama is used for sample LLM calls

./scripts/run-workflow.sh              # all four workflows
./scripts/run-workflow.sh support      # customer-support
./scripts/run-workflow.sh procurement  # vendor-procurement (parallel DAG)
./scripts/run-workflow.sh all --fail   # dev failure harness
```

Open **Runs** in the dashboard. Click a run → **Graph** (causal topology), **Trace** (I/O per hop), **Attribution** (success) or **Blame** (failed).

#### 4. Run tests

```bash
npm run test
```

Runs unit tests in `@blamr/types`, `@blamr/sdk`, and `@blamr/web` (confidence gates, edge chain, graph layout).

---

## Connect your agent

### SDK (3 lines)

```typescript
import { BlamrEmitter } from '@blamr/sdk';

const emitter = new BlamrEmitter(
  { workflowId: 'customer-support', agentId: 'intent_classifier' },
  process.env.BLAMR_API_KEY!,
);

emitter.startRun();
await emitter.emitEdge({
  from_agent: 'intent_classifier',
  to_agent: 'policy_lookup',
  confidence_in: 1.0,
  confidence_out: 0.92,
  intent_delta: 0.05,
  influence_score: 0.85,
  tokens_in: 120,
  tokens_out: 45,
  latency_ms: 800,
  model: 'llama3.2:3b',
  call_type: 'LLM call',
  input_preview: 'User question…',
  output_preview: 'Classified as billing…',
});
await emitter.completeRun({ status: 'success' });
```

Emit full causal edges (with I/O previews for semantic drift):

```typescript
import { BlamrEmitter } from '@blamr/sdk';

const emitter = new BlamrEmitter(
  { workflowId: 'my-workflow', agentId: 'my_agent' },
  process.env.BLAMR_API_KEY!,
);

emitter.startRun();
await emitter.emitEdge({
  from_agent: 'my_agent',
  to_agent: 'next_agent',
  confidence_in: 0.9,
  confidence_out: 0.85,
  intent_delta: -0.02,
  influence_score: 0.7,
  input_preview: 'user question…',
  output_preview: 'agent output…',
  // tokens, latency, model, cost_usd …
});
await emitter.completeRun({ businessFailed: false });
```

### Confidence accept level (pass / fail)

Set a per-workflow minimum confidence. Runs below the threshold are marked **failed** (workers re-check server-side from ingested edges).

```typescript
import { BlamrEmitter } from '@blamr/sdk';

const emitter = new BlamrEmitter(
  {
    workflowId: 'incident-triage',
    agentId: 'alert_classifier',
    workflowConfig: {
      confidence_accept_level: 0.72, // 72% required to pass
      confidence_gate_mode: 'final',   // or 'min' — every hop must clear threshold
    },
  },
  process.env.BLAMR_API_KEY!,
);

// … emit edges …

await emitter.completeRun({
  businessFailed: false,           // your domain rules (wrong severity, etc.)
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

### Platform mode (definition-free workflows)

No workflow registry required — emit edges with any `workflow_id` and agent names.

| Env | Default | Meaning |
|-----|---------|---------|
| `BLAMR_MUTATE_EDGES` | off | **Telemetry-first**: agent `confidence_out` / `intent_delta` are authoritative; ML/semantic store hints only |
| `BLAMR_MUTATE_EDGES=1` | — | Legacy: ML/semantic may overwrite edge telemetry |
| `BLAMR_ML_ENABLED` | on | Hop drift classification + blame fusion |
| `BLAMR_SEMANTIC_DRIFT` | on | Embedding similarity hints via local Ollama |

Use **`BlamrEmitter`** from `@blamr/sdk` to emit causal edges from any agent runtime (see sample agents in `samples/agents/`).

**Python SDK** (`packages/sdk-py`):

```python
from blamr_sdk.client import BlamrEmitter

emitter = BlamrEmitter("invoice-flow", "parser")
emitter.start_run()
emitter.emit_edge(confidence_out=0.88, input_preview="...", output_preview="...")
emitter.complete_run("success")
```

**Framework adapters:** `adapters/langgraph`, `adapters/crewai`, `adapters/autogen`, `adapters/mcp` (stdio proxy for MCP tool calls).

### MCP middleware

```bash
python adapters/mcp/blamr_proxy.py run --workflow-id my-workflow -- npx @modelcontextprotocol/server-filesystem /data
```

See `adapters/` for LangGraph, CrewAI, AutoGen, and MCP integrations.

---

## Architecture

```
Agents (SDK) ──POST /v1/edges──► Ingest ──► Redpanda (edges.raw)
                    │                              │
                    │ fast 202                     ▼
                    │                    Workers: ClickHouse writer
                    │                              │ semantic drift (embeddings)
                    │                              ▼
                    │                         ClickHouse (causal_edges)
                    │
                    └──POST /runs/:id/complete──► runs.completed
                                                       │
                                                       ▼
                                              Workers: blame processor
                                                       │
                                    ┌──────────────────┴──────────────────┐
                                    ▼                                     ▼
                            PostgreSQL                           LLM reasons
                         (runs, blame_reports)                  (failed runs)
                                    │
                                    ▼
                              API + React dashboard
```

| Service | Role | Port |
|---------|------|------|
| **API** | Auth, runs, blame, SSE | 3000 |
| **Ingest** | Edge ingest → Kafka | 3001 |
| **Workers** | CH writer, blame, semantic drift | — |
| **Web** | Dashboard | 8080 |
| **PostgreSQL** | Runs, users, blame reports | 5432 |
| **ClickHouse** | Causal edges | 8123 |
| **Redpanda** | Event bus | 19092 |
| **Valkey** | Cache, drift embeddings | 6379 |

The Rust blame engine (`packages/engine/`) is available for gRPC deployments; local dev uses the TypeScript workers pipeline.

---

## Sample agents

Four real multi-agent workflows in `samples/agents/` — actual Ollama LLM calls, not mock data:

| Workflow | Topology | Pipeline |
|----------|----------|----------|
| `customer-support` | Linear | intent_classifier → policy_lookup → response_writer |
| `research-assistant` | Linear | query_planner → kb_retriever → summarizer → synthesizer |
| `incident-triage` | Linear | alert_classifier → impact_assessor → runbook_selector → action_planner |
| `vendor-procurement` | **Parallel / DAG** | intake → parallel security/finance/legal review → synthesis → compliance → decision |

```bash
./scripts/run-workflow.sh                    # all workflows
./scripts/run-workflow.sh support            # customer-support
./scripts/run-workflow.sh research           # research-assistant
./scripts/run-workflow.sh incident           # incident-triage
./scripts/run-workflow.sh procurement        # vendor-procurement (parallel)
./scripts/run-workflow.sh all --fail         # dev failure harness
```

The dashboard shows **workflow topology** (linear / parallel / DAG), hop layers, and a **causal execution graph** per run.

Details: [`samples/agents/README.md`](samples/agents/README.md).

**Reset telemetry** (keeps users, API keys):

```bash
./scripts/purge-junk-data.sh
```

---

## CausalEdge

Novel fields not in OpenTelemetry or trace standards:

| Field | Range | Purpose |
|-------|-------|---------|
| `confidence_in` / `confidence_out` | 0–1 | Chained certainty; composite from lexical + structured + tool + alignment ceiling |
| `intent_delta` | −1–0 | Goal drift per hop (domain alignment + relevance + semantic merge) |
| `influence_score` | 0–1 | Downstream causal weight |
| `input_preview` / `output_preview` | string | Truncated I/O for trace UI and embeddings |
| `edge_hash` | SHA256 | Merkle-chained audit trail |

### ML drift + root-cause ranker (workers)

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

### Semantic intent drift (workers)

Ingest returns immediately. Workers enrich edges **asynchronously** before ClickHouse insert:

1. **Tool/MCP hops** — embed `input_preview` vs `output_preview` (e.g. leave intent → payroll policy)
2. **Downstream hops** — embed run goal (first hop input) vs output
3. **Merge** — `intent_delta = min(workflow_value, semantic_value)`; `confidence_out = min(reported, semantic_similarity_ceiling)`

Agent-side signals use `@blamr/sdk` helpers: `computeHopSignals()` merges lexical, JSON `confidence`, tool scores, and alignment ceilings before ingest.

### Blame attribution

On run completion, workers compute **fault-weighted blame** from `intent_delta`, confidence drops, and influence — then optionally call an **LLM** to write plain-language reasons citing trace I/O.

| Run status | Dashboard tab | Meaning |
|------------|---------------|---------|
| Failed | **Blame** | Root cause + fault % |
| Success | **Attribution** | Influence distribution (not fault) |

---

## Configuration

Copy [`.env.example`](.env.example). Key variables:

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

---

## Development

```bash
npm install

# Infrastructure
docker compose up -d postgres clickhouse redpanda valkey ollama ollama-init

# Hot reload (separate terminals — workers required)
npm run dev:api
npm run dev:ingest
npm run dev:workers
npm run dev:web

# Or compiled backend in one shot (local dev only)
./scripts/dev-backend.sh
```

Build and test:

```bash
npm run build
npm run test
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), and [docs/PUBLISHING.md](docs/PUBLISHING.md) (maintainers).

---

## Project structure

```
blamr/
├── apps/
│   ├── api/            # REST + SSE API
│   ├── ingest/         # Edge ingest (fast 202)
│   ├── workers/        # Kafka consumers, blame, semantic drift
│   └── web/            # React dashboard
├── packages/
│   ├── types/          # Shared types
│   ├── semantic/       # Embeddings, drift, LLM reasons
│   ├── ml/             # Drift classifier + root-cause ranker (production)
│   ├── sdk-ts/         # @blamr/sdk
│   └── engine/         # Rust blame engine (optional gRPC)
├── samples/agents/     # Real Ollama multi-agent test workflows
├── adapters/           # LangGraph, CrewAI, AutoGen, MCP
├── scripts/            # docker-up, init-clickhouse, dev-backend, run-workflow
├── docs/               # INSTALL, DEPLOYMENT, OPERATIONS, PUBLISHING
└── deploy/helm/          # Kubernetes Helm chart (full templates)
```

---

## Production

**Self-hosted alpha.** Run API, ingest, and **workers** as separate supervised processes with restart policies. `./scripts/dev-backend.sh` is for local development only — not a production process manager.

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for the full ops checklist (Kafka consumer groups, env vars, health checks).

**Kubernetes:**

```bash
cd deploy/helm && helm dependency update
helm install blamr . -n blamr --create-namespace
```

Full guide: [deploy/helm/README.md](deploy/helm/README.md)

---

## License

[MIT](LICENSE) — SDK (`@blamr/sdk`, `@blamr/types`), adapters, samples, and self-hosted deployment.

The monorepo root and `apps/*` services are private workspace packages (not published to npm). See [CONTRIBUTING.md](CONTRIBUTING.md).

---

blamr.ai · [github.com/blamr-ai](https://github.com/blamr-ai) · prithvi@blamr.ai
