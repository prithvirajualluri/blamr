# blamr

<p align="center">
  <img src="blamr_logo.svg" alt="blamr — causal intelligence for multi-agent AI" width="320" />
</p>

[![CI](https://github.com/prithvirajualluri/blamr/actions/workflows/ci.yml/badge.svg)](https://github.com/prithvirajualluri/blamr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Causal intelligence for multi-agent AI — self-hosted, open source.**

Span tools log *what happened*. blamr answers **which agent caused the failure, and why** — by tracing handoffs, building a causal graph, and ranking root cause from telemetry and semantic drift.

---

## Features

| Capability | What you get |
|------------|--------------|
| **Causal edges** | Per-hop `confidence`, `intent_delta`, `influence_score`, I/O previews, Merkle audit chain |
| **Blame attribution** | Backward propagation + optional ML fusion; MAST failure modes and blame roles |
| **Semantic drift** | Embedding-based intent drift via local Ollama (no cloud API required for core platform) |
| **Connection wizard** | In-dashboard onboarding: create key → copy `.env` → browser test edge → first run on Overview |
| **Live feed** | Workspace SSE stream (`edge.ingested`, `run.completed`, `blame.completed`) on Overview |
| **Hop replay** | Counterfactual blame simulation + full LLM re-execution with diff, tokens, and cost |
| **SDK ergonomics** | `blamrTrace()` auto-emits edges; auto token/cost enrichment from previews |
| **Integrations** | TypeScript/Python SDK, MCP proxy, LangGraph / CrewAI / AutoGen adapters |

---

## Documentation

| Guide | What's inside |
|-------|----------------|
| **[Installation](docs/INSTALL.md)** | Docker Compose, 5-minute connect, SDK, MCP, adapters, Helm |
| **[Deployment](docs/DEPLOYMENT.md)** | Full Docker stack, env vars, architecture, production checklist |
| **[Operations](docs/OPERATIONS.md)** | Workers, connection verification, health checks, day-2 ops |
| **[Concepts](docs/CONCEPTS.md)** | CausalEdge fields, blame roles, MAST modes, hop replay |
| **[Causal monitoring](docs/CAUSAL_MONITORING.md)** | End-to-end pipeline, dashboard KPIs, live feed, onboarding flow |
| **[Docs index](docs/README.md)** | Full documentation map by role |
| **[Sample agents](samples/agents/README.md)** | Four Ollama-powered multi-agent workflows |
| **[Contributing](CONTRIBUTING.md)** | Dev setup, tests, packages |
| **[Publishing](docs/PUBLISHING.md)** | Maintainer release checklist |
| **[Helm](deploy/helm/README.md)** | Kubernetes deployment |

Static marketing site: [`marketing-site/`](marketing-site/) — [install guide](marketing-site/docs.html) · [causal monitoring](marketing-site/causal-monitoring.html)

---

## Quick start

```bash
git clone https://github.com/prithvirajualluri/blamr.git && cd blamr
cp .env.docker.example .env
./scripts/docker-up.sh
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:8080 |
| API | http://localhost:3000 |
| Ingest | http://localhost:3001 |

**First run (under 2 minutes, no external docs):**

1. Open **http://localhost:8080** → register a workspace  
2. **Connection wizard** opens automatically → create ingest key → copy `.env` → **Send test connection**  
3. Optional CLI: `./scripts/verify-agent-connection.sh samples/agents/.env`  
4. Connect a real agent via **Connect agents** (`#/connect`) or run `./scripts/run-workflow.sh support` (needs Ollama)

→ Full guide: **[docs/INSTALL.md](docs/INSTALL.md)** · [Connect in 5 minutes](docs/INSTALL.md#connect-agents-in-5-minutes)

---

## How it works

| Step | What blamr does |
|------|-----------------|
| **1. Instrument** | SDK, MCP proxy, or adapter emits a `CausalEdge` at every agent handoff |
| **2. Graph** | Ingest → Kafka → workers store edges, compute semantic drift and ML signals |
| **3. Attribute** | On run completion, blame propagates backward; dashboard shows root cause + reasons |
| **4. Investigate** | Live feed, counterfactual blame, or LLM hop replay on the run Trace tab |

→ Pipeline detail: **[docs/CAUSAL_MONITORING.md](docs/CAUSAL_MONITORING.md)**

---

## Connect an agent

Point agents at **ingest** (`http://localhost:3001/v1`), **not** the dashboard API (`:3000`). The connection wizard, Settings key reveal, and **Connect agents** page show the correct URL for your deployment (`VITE_INGEST_URL` at web build time).

```bash
BLAMR_API_KEY=bk_live_…your_key
BLAMR_ENDPOINT=http://localhost:3001/v1
```

**Quick path** — `blamrTrace` wraps any async function and auto-emits edges with previews and lineage:

```typescript
import { BlamrEmitter, blamrTrace } from '@blamr/sdk';

const emitter = new BlamrEmitter(
  { workflowId: 'my-workflow', agentId: 'my_agent' },
  process.env.BLAMR_API_KEY!,
  process.env.BLAMR_ENDPOINT ?? 'http://localhost:3001/v1',
);

const research = blamrTrace(emitter, { agent: 'researcher' }, async (q) => callLlm(q));
emitter.startRun();
await research('What is our refund policy?');
await emitter.completeRun({ businessFailed: false });
```

**Manual path** — call `emitEdge()` per hop when you need full field control. Set `BLAMR_ENRICH_USAGE=1` (default) to estimate tokens/cost from previews. `emitEdge` is **non-blocking** by default (disk queue on failure).

Python SDK, MCP middleware, LangGraph/CrewAI/AutoGen → **[docs/INSTALL.md](docs/INSTALL.md)**

---

## Dashboard

| Area | Route | Purpose |
|------|-------|---------|
| **Overview** | `#/` | KPIs, workflow health, live feed, connection wizard CTA when empty |
| **Executions** | `#/runs` | Run list, filters, drill-down |
| **Run detail** | `#/runs/:id` | Causal graph, trace, blame, cost, hop replay panel |
| **Connect agents** | `#/connect` | MCP / SDK / adapter snippets with your ingest URL |
| **API & keys** | `#/settings` | Key management, `.env` copy, test connection |

**Live feed** — `GET /v1/live/stream` pushes `edge.ingested`, `run.completed`, and `blame.completed` events to Overview.

**Hop replay** (Trace tab on LLM hops) — counterfactual blame (no LLM call) or full LLM re-execution with line diff. See [docs/INSTALL.md § Hop replay](docs/INSTALL.md#full-llm-hop-replay).

---

## Architecture

```
Agents ──► Ingest (:3001) ──► Redpanda ──► Workers ──► ClickHouse + Postgres
                                              │
                                              └── blame + LLM reasons ──► API (:3000) ──► Dashboard (:8080)
Dashboard (browser) ──► Ingest (:3001)   # connection wizard test edge (CORS)
Dashboard (browser) ──► API (:3000)      # auth, runs, blame, live SSE
```

| Service | Port | Role |
|---------|------|------|
| **API** | 3000 | Auth, runs, blame, hop replay, live workspace stream |
| **Ingest** | 3001 | Agent telemetry; browser test edges from dashboard |
| **Web** | 8080 | Operator dashboard (nginx + SPA) |
| **Workers** | — | ClickHouse writer, semantic drift, blame processor |
| **Ollama** | 11434 | Local embeddings + chat (drift, blame reasons, replay fallback) |

Full diagram → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#architecture-docker-network)**

---

## Sample workflows

| Workflow | CLI alias | Topology |
|----------|-----------|----------|
| `customer-support` | `support` | Linear — intent → policy → response |
| `research-assistant` | `research` | Linear — plan → retrieve → summarize → synthesize |
| `incident-triage` | `incident` | Linear — classify → assess → runbook → plan |
| `vendor-procurement` | `procurement` | Parallel DAG — intake → parallel reviews → decision |

```bash
cp samples/agents/.env.example samples/agents/.env   # add BLAMR_API_KEY
./scripts/run-workflow.sh support      # one workflow
./scripts/run-workflow.sh all          # all four
./scripts/run-workflow.sh all --fail   # failure harness
```

Details → **[samples/agents/README.md](samples/agents/README.md)**

---

## Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/docker-up.sh` | Build and start full Docker stack |
| `./scripts/dev-backend.sh` | Local dev: API + ingest + workers (foreground) |
| `./scripts/run-workflow.sh` | Run sample agent workflows |
| `./scripts/verify-agent-connection.sh` | Send test edge + complete (CLI onboarding check) |
| `./scripts/init-clickhouse.sh` | Apply ClickHouse schema (local infra) |
| `./scripts/helm-lint.sh` | Validate Helm chart |

---

## Project structure

```
blamr/
├── apps/
│   ├── api/        REST API, auth, runs, blame, hop replay, live SSE
│   ├── ingest/     Agent edge ingest (CORS for dashboard test)
│   ├── workers/    Kafka consumers — drift, blame, ClickHouse writer
│   └── web/        Operator dashboard (connection wizard, live feed)
├── packages/
│   ├── types/      Shared TypeScript types and causal helpers
│   ├── sdk-ts/     @blamr/sdk — TypeScript ingest SDK + blamrTrace
│   ├── sdk-py/     Python ingest SDK
│   ├── blame/      @blamr/blame — shared blame computation
│   ├── replay/     @blamr/replay — LLM hop replay engine
│   ├── semantic/   Embedding-based drift
│   ├── ml/         Drift classification + blame fusion models
│   └── engine/     Rust blame engine (gRPC, optional)
├── samples/agents/ Ollama multi-agent test workflows
├── adapters/       LangGraph · CrewAI · AutoGen · MCP
├── docs/           INSTALL · DEPLOYMENT · OPERATIONS · CONCEPTS · CAUSAL_MONITORING
├── marketing-site/ Static landing + documentation
├── scripts/        docker-up · dev-backend · run-workflow · verify-agent-connection
└── deploy/helm/    Kubernetes chart
```

---

## Environment (agents)

| Variable | Required | Description |
|----------|----------|-------------|
| `BLAMR_API_KEY` | yes | Ingest key from dashboard (`ingest:write`) |
| `BLAMR_ENDPOINT` | yes | Ingest URL, e.g. `http://localhost:3001/v1` — **not** API `:3000` |
| `BLAMR_ENRICH_USAGE` | no | Auto-estimate tokens/cost from previews (default on) |

Full reference → **[docs/CONCEPTS.md](docs/CONCEPTS.md)** · **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

---

## Production

Self-hosted alpha — run **API**, **ingest**, and **workers** as separate supervised processes with restart policies. `./scripts/dev-backend.sh` is for local dev only.

- **Docker:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Kubernetes:** [deploy/helm/README.md](deploy/helm/README.md)
- **Ops:** [docs/OPERATIONS.md](docs/OPERATIONS.md)

---

## License

[MIT](LICENSE) — SDK, adapters, samples, and self-hosted deployment. Monorepo `apps/*` and internal packages (`@blamr/blame`, `@blamr/replay`) are private workspace packages (not published to npm). See [CONTRIBUTING.md](CONTRIBUTING.md).
