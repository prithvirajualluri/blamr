# GitHub publishing checklist

Use this before the first public push to [github.com/blamr-ai/blamr](https://github.com/blamr-ai/blamr).

## 1. Repository setup

blamr should be its **own Git repository** (not nested under a personal `Documents/` monorepo):

```bash
cd blamr
git init
git remote add origin git@github.com:blamr-ai/blamr.git
```

## 2. Pre-push verification

Run locally (matches CI):

```bash
npm ci
npm run build
npm run test
```

Expected: **23 tests** pass (`@blamr/types` 15, `@blamr/sdk` 4, `@blamr/web` 4).

Optional Docker smoke test:

```bash
cp .env.docker.example .env
./scripts/docker-up.sh
# Open http://localhost:8080, register, run ./scripts/run-workflow.sh support
docker compose down
```

## 3. Secrets audit

Must **not** be committed:

| Path | Notes |
|------|-------|
| `.env` | Root secrets |
| `samples/agents/.env` | API keys + local config |
| Any `*.pem`, `*.key`, real API keys | — |

Verify:

```bash
git status
git grep -E 'sk-(proj|ant)|AKIA[0-9A-Z]{16}' || echo "No obvious secrets in tracked files"
```

`.env.example` and `.env.docker.example` use placeholders only.

## 4. What ships publicly

| Included | MIT licensed |
|----------|--------------|
| Full platform (API, ingest, workers, web) | yes |
| Docker Compose + Ollama stack | yes |
| `@blamr/types`, `@blamr/sdk` | yes (npm-ready) |
| Sample agents, adapters | yes |
| ML bundle (`packages/ml/models/`) | yes |

| Not on npm | Stays in repo |
|------------|---------------|
| `apps/*` | private workspace packages |
| Monorepo root | `"private": true` |

## 5. GitHub repository settings

After creating the repo:

1. **Description:** Causal intelligence platform for multi-agent AI systems
2. **Topics:** `multi-agent`, `observability`, `causal-inference`, `llm`, `self-hosted`, `ollama`
3. **Default branch:** `main`
4. **Security:** enable Dependabot alerts (optional)
5. **Actions:** CI runs on push/PR to `main` (`.github/workflows/ci.yml`)

## 6. First push

```bash
git add .
git commit -m "feat: initial public release v0.1.0"
git branch -M main
git push -u origin main
```

## 7. Post-push

- [ ] Confirm GitHub Actions CI is green
- [ ] Create `v0.1.0` GitHub Release with notes from [README](../README.md) quick start
- [ ] (Optional) `npm publish --access public` for `@blamr/types` and `@blamr/sdk` from their package directories after version bump

## npm publish (optional)

Only `@blamr/types` and `@blamr/sdk` are intended for npm. From repo root:

```bash
npm run build -w @blamr/types -w @blamr/sdk
cd packages/types && npm publish --access public
cd ../sdk-ts && npm publish --access public
```

Requires npm org access to `@blamr` scope.
