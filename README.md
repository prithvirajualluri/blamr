# blamr

<p align="center">
  <img src="blamr_logo.svg" alt="blamr — causal intelligence for multi-agent AI" width="320" />
</p>

[![CI](https://github.com/prithvirajualluri/blamr/actions/workflows/ci.yml/badge.svg)](https://github.com/prithvirajualluri/blamr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Causal intelligence for multi-agent AI — self-hosted, open source.**

Span tools log *what happened*. blamr answers **which agent caused the failure, and why** — by tracing handoffs, building a causal graph, and ranking root cause from telemetry and semantic drift.

---

## Documentation

| Guide | What's inside |
|-------|----------------|
| **[Installation](docs/INSTALL.md)** | Docker Compose, local dev, TypeScript/Python SDK, MCP proxy, adapters, Helm |
| **[Deployment](docs/DEPLOYMENT.md)** | Full Docker stack, env vars, production checklist |
| **[Operations](docs/OPERATIONS.md)** | Workers, health checks, day-2 ops |
| **[Concepts](docs/CONCEPTS.md)** | CausalEdge fields, confidence gates, drift, blame attribution |
| **[Causal monitoring](docs/CAUSAL_MONITORING.md)** | End-to-end pipeline, business logic, dashboard KPIs |
| **[Sample agents](samples/agents/README.md)** | Four Ollama-powered multi-agent workflows |
| **[Contributing](CONTRIBUTING.md)** | Dev setup, tests, release notes |
| **[Publishing](docs/PUBLISHING.md)** | Maintainer release checklist |

Static marketing site: [`marketing-site/`](marketing-site/) — [install guide](marketing-site/docs.html) · [causal monitoring](marketing-site/causal-monitoring.html) (or `/docs.html` and `/causal-monitoring.html` on the deployed dashboard host).

---

## Quick start

```bash
git clone https://github.com/prithvirajualluri/blamr && cd blamr
cp .env.docker.example .env
./scripts/docker-up.sh
```

1. Open **http://localhost:8080** → register a workspace  
2. Follow the **connection wizard** (or **Settings → API & keys**): create key → copy `.env` → **Test connection**  
3. Optional CLI check: `./scripts/verify-agent-connection.sh samples/agents/.env`  
4. Run a sample workflow: `./scripts/run-workflow.sh support`

→ Step-by-step install, SDK, and MCP: **[docs/INSTALL.md](docs/INSTALL.md)** · [5-minute connect](docs/INSTALL.md#connect-agents-in-5-minutes)

---

## How it works

| Step | What blamr does |
|------|-----------------|
| **1. Instrument** | SDK, MCP proxy, or adapter emits a `CausalEdge` at every agent handoff |
| **2. Graph** | Ingest → Kafka → workers store edges, compute semantic drift and ML signals |
| **3. Attribute** | On run completion, blame propagates backward; dashboard shows root cause + reasons |

→ Full business logic: **[docs/CAUSAL_MONITORING.md](docs/CAUSAL_MONITORING.md)** · [marketing site guide](marketing-site/causal-monitoring.html)

---

## Connect an agent

Point at **ingest** (`http://localhost:3001/v1`), not the dashboard API (`:3000`). The dashboard **Connect agents** page and connection wizard show the correct URL for your deployment (`VITE_INGEST_URL` at web build time).

**Quick path** — wrap any async function with `blamrTrace` (auto edges + previews):

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

**Manual path** — full control per hop:

```typescript
await emitter.emitEdge({
  /* model, confidence, intent_delta, input_preview, output_preview — tokens/cost auto-filled when omitted */
});
```

Set `BLAMR_ENRICH_USAGE=1` (default) to estimate tokens and cost from previews without changing agent logic. `emitEdge` is **non-blocking** by default (disk queue on failure). Use `blamrTrace()` / `@blamr_trace` for auto edges with lineage. See **[docs/INSTALL.md](docs/INSTALL.md#automatic-usage-telemetry-tokens--cost)**.

Python SDK, MCP middleware, LangGraph/CrewAI/AutoGen adapters → **[docs/INSTALL.md](docs/INSTALL.md)**

---

## Architecture

```
Agents ──► Ingest (:3001) ──► Redpanda ──► Workers ──► ClickHouse + Postgres
                                              │
                                              └── blame + LLM reasons ──► API + Dashboard (:8080)
Dashboard (browser) ──► Ingest (:3001)   # connection wizard / test edge (CORS enabled)
Dashboard (browser) ──► API (:3000)      # auth, runs, blame, live SSE feed
```

| Service | Port | Role |
|---------|------|------|
| API | 3000 | Auth, runs, blame reports, live workspace stream |
| Ingest | 3001 | Agent telemetry (+ browser test edges from dashboard) |
| Web | 8080 | Operator dashboard (connection wizard, Connect page, Overview) |
| Workers | — | Edge writer, semantic drift, blame |

Full diagram and Docker network → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#architecture-docker-network)**

---

## Sample workflows

| Workflow | Topology |
|----------|----------|
| `customer-support` | Linear — intent → policy → response |
| `research-assistant` | Linear — plan → retrieve → summarize → synthesize |
| `incident-triage` | Linear — classify → assess → runbook → plan |
| `vendor-procurement` | Parallel DAG — intake → parallel reviews → decision |

```bash
./scripts/run-workflow.sh              # all
./scripts/run-workflow.sh support      # one workflow
./scripts/run-workflow.sh all --fail   # failure harness
```

Details → **[samples/agents/README.md](samples/agents/README.md)**

---

## Project structure

```
blamr/
├── apps/           api · ingest · workers · web
├── packages/       types · sdk-ts · sdk-py · semantic · ml · engine (Rust)
├── samples/agents/ multi-agent test workflows (Ollama)
├── adapters/       LangGraph · CrewAI · AutoGen · MCP
├── docs/           INSTALL · DEPLOYMENT · OPERATIONS · CONCEPTS
├── marketing-site/ static landing + documentation
├── scripts/        docker-up · dev-backend · run-workflow · verify-agent-connection
└── deploy/helm/    Kubernetes chart
```

---

## Production

Self-hosted alpha — run **API**, **ingest**, and **workers** as separate supervised processes with restart policies. `./scripts/dev-backend.sh` is for local dev only.

- **Docker:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Kubernetes:** [deploy/helm/README.md](deploy/helm/README.md)
- **Ops:** [docs/OPERATIONS.md](docs/OPERATIONS.md)

---

## License

[MIT](LICENSE) — SDK, adapters, samples, and self-hosted deployment. Monorepo `apps/*` are private workspace packages (not published to npm). See [CONTRIBUTING.md](CONTRIBUTING.md).
