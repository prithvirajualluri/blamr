# Contributing

Thanks for helping improve blamr.

## Development setup

**Docker (recommended):**

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.docker.example .env
./scripts/docker-up.sh
```

**Local hot reload:**

```bash
git clone https://github.com/blamr-ai/blamr && cd blamr
cp .env.example .env
npm install
docker compose up -d postgres clickhouse redpanda valkey ollama ollama-init
./scripts/init-clickhouse.sh
./scripts/dev-backend.sh   # terminal A
npm run dev:web            # terminal B
```

Platform LLM features use **local Ollama only** (`nomic-embed-text` + `llama3.2:3b`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/INSTALL.md](docs/INSTALL.md).

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for why workers must stay running.

## Tests

```bash
npm run test
npm run build
```

After the stack is up and `samples/agents/.env` has a key:

```bash
./scripts/verify-agent-connection.sh samples/agents/.env
```

Runs unit tests in `@blamr/types`, `@blamr/sdk`, `@blamr/blame`, `@blamr/replay`, and `@blamr/web`.

## Monorepo packages

| Package | Path | Published | Role |
|---------|------|-----------|------|
| `@blamr/types` | `packages/types` | npm (planned) | Shared types, causal helpers |
| `@blamr/sdk` | `packages/sdk-ts` | npm (planned) | TypeScript ingest SDK, `blamrTrace` |
| `@blamr/blame` | `packages/blame` | private | Blame computation (API + workers) |
| `@blamr/replay` | `packages/replay` | private | LLM hop replay engine (API) |
| `@blamr/api` | `apps/api` | private | REST API |
| `@blamr/ingest` | `apps/ingest` | private | Edge ingest |
| `@blamr/workers` | `apps/workers` | private | Kafka consumers |
| `@blamr/web` | `apps/web` | private | Operator dashboard |

Apps (`apps/*`) and internal packages remain private monorepo workspaces and are not published to npm.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Publishable packages

These workspaces are intended for npm publish (MIT):

- `@blamr/types` — shared types and causal helpers
- `@blamr/sdk` — TypeScript ingest SDK

## Publishing to GitHub

Maintainers: see [docs/PUBLISHING.md](docs/PUBLISHING.md) for the pre-push checklist and first-release steps.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
