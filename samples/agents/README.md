# blamr sample agents

**Real multi-agent workflows** using **local Ollama** (`llama3.2:3b`). Each agent makes actual LLM calls or tool lookups; blamr records live tokens, latency, confidence, and causal handoffs.

## Workflows

| Workflow | Topology | Agents | Notes |
|----------|----------|--------|-------|
| `customer-support` | Linear | 3 | LLM → tool → LLM |
| `research-assistant` | Linear | 4 | LLM → tool → LLM → LLM |
| `incident-triage` | Linear | 4 | LLM → LLM → tool → LLM |
| `vendor-procurement` | **Parallel / DAG** | 7 | Parallel review at hop 1 |

## Prerequisites

1. **blamr backend** running — API, ingest, **workers**, and **Ollama** (`./scripts/docker-up.sh` or `./scripts/dev-backend.sh` + `docker compose up -d ollama ollama-init`)
2. **BLAMR_API_KEY** with `ingest:write` (dashboard → Settings → API & keys)
3. **Ollama** reachable at `BLAMR_LLM_BASE_URL` (default `http://localhost:11434/v1`)

## Setup

```bash
cp .env.example .env
# Add BLAMR_API_KEY
npm install   # from repo root after workspace install
```

## Run

```bash
npm run real              # all workflows
npm run real:support
npm run real:procurement  # parallel DAG
```

Or from repo root: `./scripts/run-workflow.sh procurement`

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `BLAMR_API_KEY` | yes | Ingest key from dashboard |
| `BLAMR_LLM_BASE_URL` | no | Default `http://localhost:11434/v1` |
| `BLAMR_LLM_CHAT_MODEL` | no | Default `llama3.2:3b` |

See main [README](../README.md) for confidence gates and failure test harness.
