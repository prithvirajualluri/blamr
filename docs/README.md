# blamr documentation

Index for operator, integrator, and maintainer guides.

---

## Start here

| I want to… | Read |
|------------|------|
| Install and run the stack | [INSTALL.md](./INSTALL.md) |
| Connect agents in under 5 minutes | [INSTALL.md § Connect agents in 5 minutes](./INSTALL.md#connect-agents-in-5-minutes) |
| Deploy to Docker or Kubernetes | [DEPLOYMENT.md](./DEPLOYMENT.md) · [Helm](../deploy/helm/README.md) |
| Understand causal monitoring | [CAUSAL_MONITORING.md](./CAUSAL_MONITORING.md) |
| Run sample workflows | [samples/agents/README.md](../samples/agents/README.md) |

---

## By role

### Operators (dashboard users)

- [DEPLOYMENT.md § First-run setup](./DEPLOYMENT.md#first-run-setup) — connection wizard walkthrough
- [OPERATIONS.md § Agent connection verification](./OPERATIONS.md#agent-connection-verification) — CLI and dashboard checks
- [CAUSAL_MONITORING.md § Dashboard business logic](./CAUSAL_MONITORING.md#dashboard-business-logic) — KPIs, live feed, health bands

### Agent integrators (SDK / MCP / adapters)

- [INSTALL.md § TypeScript SDK](./INSTALL.md#3-typescript-sdk) — `BlamrEmitter`, `blamrTrace`, live feed API
- [INSTALL.md § Python SDK](./INSTALL.md#4-python-sdk)
- [INSTALL.md § MCP proxy](./INSTALL.md#5-mcp-proxy-no-global-cli)
- [INSTALL.md § Framework adapters](./INSTALL.md#6-framework-adapters)
- [CONCEPTS.md § CausalEdge](./CONCEPTS.md#causaledge) — required fields and signals

### Platform maintainers

- [DEPLOYMENT.md](./DEPLOYMENT.md) — env vars, web build args (`VITE_INGEST_URL`), services
- [OPERATIONS.md](./OPERATIONS.md) — workers, Kafka consumer groups, restart
- [PUBLISHING.md](./PUBLISHING.md) — release checklist
- [CONTRIBUTING.md](../CONTRIBUTING.md) — dev setup, tests, packages

---

## Key concepts

| Topic | Doc |
|-------|-----|
| CausalEdge fields | [CONCEPTS.md](./CONCEPTS.md#causaledge) |
| Blame roles & MAST failure modes | [CONCEPTS.md](./CONCEPTS.md#blame-roles-failed-runs) |
| Confidence gates | [CONCEPTS.md](./CONCEPTS.md#confidence-accept-level) |
| Hop replay (counterfactual + LLM) | [CONCEPTS.md](./CONCEPTS.md#hop-replay) · [INSTALL.md](./INSTALL.md#full-llm-hop-replay) |
| End-to-end pipeline | [CAUSAL_MONITORING.md](./CAUSAL_MONITORING.md#end-to-end-pipeline) |
| Agent onboarding flow | [CAUSAL_MONITORING.md](./CAUSAL_MONITORING.md#agent-onboarding-flow-dashboard) |

---

## Scripts

| Script | Doc reference |
|--------|---------------|
| `./scripts/docker-up.sh` | [INSTALL.md § Docker Compose](./INSTALL.md#1-docker-compose-recommended) |
| `./scripts/verify-agent-connection.sh` | [INSTALL.md § CLI verify](./INSTALL.md#connect-agents-in-5-minutes) |
| `./scripts/run-workflow.sh` | [samples/agents/README.md](../samples/agents/README.md) |
| `./scripts/dev-backend.sh` | [INSTALL.md § Local development](./INSTALL.md#2-local-development) |

---

## Repository layout

See [README.md § Project structure](../README.md#project-structure) for the monorepo map (`apps/`, `packages/`, `adapters/`, `samples/`).
