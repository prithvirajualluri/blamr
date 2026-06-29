# Operations guide

blamr is **self-hosted**. Ingest returns fast `202` responses; **workers** do the heavy lifting (semantic drift, blame, ClickHouse writes). If workers are down, edges may land in Kafka but runs never finalize in Postgres and the dashboard stays empty.

## Required processes

| Process | Port | Required for |
|---------|------|--------------|
| **PostgreSQL** | 5432 | Users, runs, blame reports |
| **ClickHouse** | 8123 | Causal edge storage |
| **Redpanda (Kafka)** | 19092 | Edge + run completion events |
| **Valkey (Redis)** | 6379 | API key cache, drift embedding cache |
| **API** | 3000 | Dashboard auth, run queries |
| **Ingest** | 3001 | Agent edge ingest |
| **Workers** | — | **Critical** — CH writer, blame processor, semantic drift |
| **Web** | 8080 | Dashboard (dev: Vite; prod: static build) |

## Local development

```bash
docker compose up -d postgres clickhouse redpanda valkey
./scripts/init-clickhouse.sh
./scripts/dev-backend.sh   # API + ingest + workers (foreground — Ctrl+C stops all)
npm run dev:web            # separate terminal
```

For the **full stack in Docker** (no local Node for the platform), see [DEPLOYMENT.md](./DEPLOYMENT.md).

`dev-backend.sh` is for **local dev only**. It builds once and runs three Node processes in the foreground. Do not use it as a production process manager.

## Production checklist

1. Run **API**, **ingest**, and **workers** as separate supervised services (systemd, Kubernetes, ECS — each with restart policy).
2. Set worker env:
   - `BLAMR_ML_ENABLED=true`
   - `BLAMR_SEMANTIC_DRIFT=true` (requires Ollama at `BLAMR_LLM_BASE_URL`)
   - `DATABASE_URL`, `CLICKHOUSE_URL`, `KAFKA_BROKERS`, `REDIS_URL`
3. Confirm workers joined Kafka consumer groups: `clickhouse-writer`, `blame-processor`, `run-aggregator`.
4. Health: API responds on `/v1/auth/login` (401 without creds is OK). Ingest returns 401/400 on unauthenticated `POST /v1/edges`.
5. After deploy, verify agent connectivity:
   ```bash
   ./scripts/verify-agent-connection.sh samples/agents/.env
   ```
   Or use **Settings → Test connection** / the dashboard connection wizard (browser POST to ingest).
6. Confirm a run appears in Postgres within ~10s of `completeRun` or a successful test connection.

## Agent connection verification

Use these checks after deploy or when onboarding a new workspace:

| Method | Command / action | What it proves |
|--------|------------------|----------------|
| **CLI script** | `./scripts/verify-agent-connection.sh [path/to/.env]` | Key + ingest URL accept edges and complete runs |
| **Dashboard wizard** | Overview → connection wizard → **Send test connection** | Same test edge from browser (ingest CORS) |
| **Settings modal** | Create key → **Test connection** | Key reveal + ingest path after key creation |
| **Live feed** | Overview → Live feed shows `edge.ingested` | Workers writing edges; SSE stream connected |

The test edge uses `workflow_id: onboarding-test`. It requires **workers** running — ingest alone returns `202` but runs stay invisible until workers process Kafka.

## What breaks when workers stop

| Symptom | Cause |
|---------|--------|
| Test connection succeeds but Overview empty | Workers not writing to Postgres |
| Runs stuck / missing in dashboard | Blame processor not writing to Postgres |
| Edges missing in trace | ClickHouse writer not flushing |
| No ML / semantic hints | Blame processor not running |
| `confidence_in` chain wrong on old runs | Reconcile runs on next blame pass after worker upgrade |

## Restart workers (compiled build)

```bash
export BLAMR_ML_ENABLED=true BLAMR_SEMANTIC_DRIFT=true
node apps/workers/dist/apps/workers/src/main.js
```

Rebuild after code changes:

```bash
npm run build -w @blamr/workers
```

## Helm

See [deploy/helm/](../deploy/helm/) for Kubernetes deployment. Ensure the workers deployment has the same env as API/ingest and at least one replica always running.
