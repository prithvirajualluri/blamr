# Installation guide

How to install and connect to blamr depending on your setup. For production deployment after install, see [DEPLOYMENT.md](./DEPLOYMENT.md) and [OPERATIONS.md](./OPERATIONS.md).

---

## Choose your path

| I want to… | Section |
|------------|---------|
| Run the full platform (fastest) | [Docker Compose](#1-docker-compose-recommended) |
| Develop with hot reload | [Local development](#2-local-development) |
| Connect TypeScript agents | [TypeScript SDK](#3-typescript-sdk) |
| Connect Python agents | [Python SDK](#4-python-sdk) |
| Wrap MCP tool servers | [MCP proxy](#5-mcp-proxy-no-global-cli) |
| Use LangGraph / CrewAI / AutoGen | [Framework adapters](#6-framework-adapters) |
| Deploy to Kubernetes | [Kubernetes / Helm](#7-kubernetes--helm) |

---

## Prerequisites (all paths)

| Requirement | When needed |
|-------------|-------------|
| **Docker 24+** | Docker Compose stack |
| **Node.js 20+** | Local dev, TypeScript SDK, sample agents |
| **Python 3.10+** | MCP proxy, Python SDK, framework adapters |
| **6+ GB RAM** | Docker stack with Ollama (~3 GB models on first pull) |

Platform LLM features (semantic drift, blame reasons) use **local Ollama only** — `nomic-embed-text` + `llama3.2:3b`. No cloud API keys required.

---

## 1. Docker Compose (recommended)

Runs API, ingest, workers, dashboard, Postgres, ClickHouse, Redpanda, Valkey, and Ollama.

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.docker.example .env
./scripts/docker-up.sh
```

Or manually:

```bash
docker compose up --build -d
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:8080 |
| API | http://localhost:3000 |
| Ingest | http://localhost:3001 |
| Ollama | http://localhost:11434 |

**First run:** register at the dashboard → **Settings → API & keys** → create key with `ingest:write`.

Details: [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 2. Local development

For active development with hot reload (API, ingest, workers, web).

### 2.1 Clone and install

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.example .env
npm install
```

### 2.2 Start infrastructure

```bash
docker compose up -d postgres clickhouse redpanda valkey ollama ollama-init
./scripts/init-clickhouse.sh
```

Wait for `ollama-init` to finish (first run pulls models).

### 2.3 Start platform services

**Terminal A** — backend:

```bash
./scripts/dev-backend.sh
```

**Terminal B** — dashboard:

```bash
npm run dev:web
```

Open http://localhost:8080

> Workers must stay running. See [OPERATIONS.md](./OPERATIONS.md).

### 2.4 Run sample workflows (optional)

```bash
cp samples/agents/.env.example samples/agents/.env
# Set BLAMR_API_KEY from dashboard
./scripts/run-workflow.sh support
```

Details: [samples/agents/README.md](../samples/agents/README.md)

---

## 3. TypeScript SDK

Emit causal edges from any Node/TS agent runtime.

### From the monorepo (development)

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
npm install
npm run build -w @blamr/types -w @blamr/sdk
```

In your agent project, depend on the workspace or link locally:

```json
{
  "dependencies": {
    "@blamr/sdk": "file:../blamr/packages/sdk-ts",
    "@blamr/types": "file:../blamr/packages/types"
  }
}
```

### From npm (when published)

```bash
npm install @blamr/sdk @blamr/types
```

### Minimal usage

```typescript
import { BlamrEmitter } from '@blamr/sdk';

const emitter = new BlamrEmitter(
  { workflowId: 'my-workflow', agentId: 'my_agent' },
  process.env.BLAMR_API_KEY!,
  process.env.BLAMR_ENDPOINT ?? 'http://localhost:3001/v1',
);

emitter.startRun();
await emitter.emitEdge({
  from_agent: 'my_agent',
  to_agent: 'next_agent',
  confidence_in: 1.0,
  confidence_out: 0.9,
  intent_delta: 0.05,
  influence_score: 0.8,
  tokens_in: 100,
  tokens_out: 50,
  latency_ms: 500,
  model: 'llama3.2:3b',
  call_type: 'LLM call',
  input_preview: 'user input…',
  output_preview: 'agent output…',
});
await emitter.completeRun({ businessFailed: false });
```

### Automatic usage telemetry (tokens & cost)

If your agent already sends `model` and I/O previews but omits `tokens_in`, `tokens_out`, or `cost_usd`, the SDK **enriches each `emitEdge` automatically** (default on):

- Estimates tokens from preview text (~4 characters per token)
- Estimates `cost_usd` from built-in model pricing (Claude Sonnet, GPT-4o, etc.)
- Normalizes non-standard `call_type` values (e.g. `tool_call` → `LLM call` when a model is set)

No changes to agent business logic are required — only keep sending previews and model name:

```typescript
await emitter.emitEdge({
  from_agent: 'search_agent',
  to_agent: 'fetch_agent',
  model: 'claude-sonnet-4-6',
  call_type: 'tool_call',
  confidence_out: 0.3,
  input_preview: 'user query…',
  output_preview: 'search results…',
  // tokens_in, tokens_out, cost_usd optional — SDK fills when missing
});
```

For **exact** provider usage (Anthropic/OpenAI), wrap the client once at init. The next `emitEdge` with zero tokens consumes the last LLM call’s usage:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { wrapClient } from '@blamr/sdk';

const anthropic = wrapClient(new Anthropic(), {
  workflowId: 'web-research',
  agentId: 'orchestrator',
  apiKey: process.env.BLAMR_API_KEY!,
  endpoint: process.env.BLAMR_ENDPOINT ?? 'http://localhost:3001/v1',
  telemetry: { enrichMissingUsage: true, attachProviderUsage: true },
});

// anthropic.messages.create() — usage queued for the next emitEdge
// emitter.emitEdge({ ... }) — unchanged
```

Optional emitter config (instead of env):

```typescript
new BlamrEmitter(
  {
    workflowId: 'web-research',
    agentId: 'orchestrator',
    telemetry: {
      enrichMissingUsage: true,
      modelPricing: {
        'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
      },
    },
  },
  process.env.BLAMR_API_KEY!,
  process.env.BLAMR_ENDPOINT!,
);
```

**Dashboard:** **Workflows → Instrumentation** flags missing usage, wrong `from_agent`, intent sign, and other SDK integration issues from recent runs.

Estimates are approximate; re-run the workflow after upgrading `@blamr/sdk` — existing runs are not backfilled.

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BLAMR_API_KEY` | — | Ingest key (`ingest:write`) |
| `BLAMR_ENDPOINT` | `http://localhost:3001/v1` | Ingest base URL |
| `BLAMR_ENRICH_USAGE` | `1` | Estimate tokens/cost from previews when omitted |
| `BLAMR_ATTACH_PROVIDER_USAGE` | `1` | Attach usage from wrapped Anthropic/OpenAI calls |

More examples (confidence gates, platform mode): [CONCEPTS.md](./CONCEPTS.md)

---

## 4. Python SDK

```bash
git clone https://github.com/prithvirajualluri/blamr
pip install ./blamr/packages/sdk-py
```

Or install directly from Git:

```bash
pip install "git+https://github.com/prithvirajualluri/blamr.git#subdirectory=packages/sdk-py"
```

When published to PyPI:

```bash
pip install blamr-sdk
```

### Minimal usage

```python
import os
from blamr_sdk.client import BlamrEmitter

emitter = BlamrEmitter(
    "web-research",
    "orchestrator",
    api_key=os.environ["BLAMR_API_KEY"],
    endpoint=os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1"),
)

run_id = emitter.start_run()
emitter.emit_edge(
    from_agent="search_agent",
    to_agent="fetch_agent",
    model="claude-sonnet-4-6",
    call_type="tool_call",
    confidence_out=0.3,
    input_preview="user query",
    output_preview="search results",
    # tokens_in, tokens_out, cost_usd optional — enriched automatically
)
emitter.complete_run("success")
```

### Automatic usage telemetry

Same behavior as the TypeScript SDK (on by default):

| Variable | Default | Description |
|----------|---------|-------------|
| `BLAMR_ENRICH_USAGE` | on | Estimate tokens/cost from previews |
| `BLAMR_ATTACH_PROVIDER_USAGE` | on | Use recorded provider usage on next `emit_edge` |

Optional — record **exact** Anthropic usage before `emit_edge` (no change to edge fields):

```python
import time
from blamr_sdk.telemetry import ProviderUsage

start = time.time()
message = client.messages.create(...)

emitter.record_provider_usage(
    ProviderUsage(
        model=message.model,
        tokens_in=message.usage.input_tokens,
        tokens_out=message.usage.output_tokens,
        latency_ms=int((time.time() - start) * 1000),
    )
)

emitter.emit_edge(...)  # unchanged — usage attached automatically
```

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BLAMR_API_KEY` | — | Ingest key (`ingest:write`) |
| `BLAMR_ENDPOINT` | `http://localhost:3001/v1` | Ingest base URL |
| `BLAMR_ENRICH_USAGE` | on | Estimate missing tokens/cost |
| `BLAMR_ATTACH_PROVIDER_USAGE` | on | Attach last provider usage |


## 5. MCP proxy (no global CLI)

There is **no** published `blamr` npm/binary CLI yet. MCP integration uses the Python proxy in the repo:

[`adapters/mcp/blamr_proxy.py`](../adapters/mcp/blamr_proxy.py)

### Stdio MCP server (local)

```bash
export BLAMR_API_KEY=bk_live_...
python3 adapters/mcp/blamr_proxy.py run \
  --workflow-id customer-support \
  --api-key "$BLAMR_API_KEY" \
  --endpoint http://localhost:3001/v1 \
  -- npx @modelcontextprotocol/server-filesystem /tmp
```

### HTTP / SSE remote MCP server

```bash
python3 adapters/mcp/blamr_proxy.py proxy \
  --workflow-id customer-support \
  --target https://mcp-server.example.com/mcp \
  --api-key "$BLAMR_API_KEY"
```

Every `tools/call` emits a `CausalEdge` with `call_type: MCP call`.

Full reference: [adapters/mcp/README.md](../adapters/mcp/README.md)

---

## 6. Framework adapters

Copy adapter modules from the repo or install as part of your Python path.

| Framework | Path | Doc |
|-----------|------|-----|
| LangGraph | `adapters/langgraph/` | [README](../adapters/langgraph/README.md) |
| CrewAI | `adapters/crewai/` | [README](../adapters/crewai/README.md) |
| AutoGen | `adapters/autogen/` | [README](../adapters/autogen/README.md) |
| MCP | `adapters/mcp/` | [README](../adapters/mcp/README.md) |

Example (LangGraph):

```python
from blamr.adapters.langgraph import BlamrNode

graph.add_node("blamr_trace", BlamrNode(workflow_id="customer-support"))
```

Adapters require a running blamr ingest endpoint and `BLAMR_API_KEY`.

---

## 7. Kubernetes / Helm

Deploy the full stack with Helm:

```bash
cd deploy/helm
helm dependency update
helm install blamr . -n blamr --create-namespace -f values-local.yaml   # minikube/kind
```

Production install with ingress, custom secrets, and your container registry — see **[deploy/helm/README.md](../deploy/helm/README.md)**.

| Component | Included |
|-----------|----------|
| api, ingest, workers, web | Deployments + Services |
| clickhouse, redpanda, ollama | StatefulSets + PVCs |
| postgres, valkey | Bitnami subcharts |
| Schema + Ollama models | Helm hook Jobs |

**Web image:** rebuild with `VITE_API_BASE_URL` / `VITE_INGEST_URL` matching your ingress hosts before deploying.

```bash
./scripts/helm-lint.sh   # dry-run validate chart
```

---

## 8. Building Docker images (self-hosted registry)

Build from repo root:

```bash
docker compose build
# or individual services:
docker build -f apps/api/Dockerfile -t your-registry/blamr-api:0.1.0 .
docker build -f apps/ingest/Dockerfile -t your-registry/blamr-ingest:0.1.0 .
docker build -f apps/workers/Dockerfile -t your-registry/blamr-workers:0.1.0 .
docker build -f apps/web/Dockerfile -t your-registry/blamr-web:0.1.0 .
```

Push to your registry and point orchestrator env at the same variables as `docker-compose.yml`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Dashboard empty after workflow | Workers not running — `docker compose logs workers` |
| Ingest 401 | Invalid or missing `BLAMR_API_KEY` |
| Semantic drift errors | Ollama not ready — `curl http://localhost:11434/api/tags` |
| Port conflicts | Stop local dev (`dev-backend.sh`, `npm run dev:web`) before Docker |
| Sample agent LLM errors | Set `BLAMR_LLM_BASE_URL=http://localhost:11434/v1` in `samples/agents/.env` |

More: [DEPLOYMENT.md § Troubleshooting](./DEPLOYMENT.md#troubleshooting)

---

## Related docs

| Doc | Purpose |
|-----|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Docker env vars, architecture, production checklist |
| [deploy/helm/README.md](../deploy/helm/README.md) | Kubernetes / Helm install |
| [OPERATIONS.md](./OPERATIONS.md) | Day-2 ops, worker health, restarts |
| [CONCEPTS.md](./CONCEPTS.md) | CausalEdge, drift, blame, confidence gates |
| [PUBLISHING.md](./PUBLISHING.md) | GitHub / npm release checklist |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Dev setup for contributors |
