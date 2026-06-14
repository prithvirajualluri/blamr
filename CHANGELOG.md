# Changelog

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - 2026-06-14

### Added

- Self-hosted causal intelligence platform: API, ingest, workers, React dashboard
- Docker Compose stack with Postgres, ClickHouse, Redpanda, Valkey, and **Ollama** (local SLM)
- **Helm chart** (`deploy/helm/`) for Kubernetes deployments
- Telemetry-first blame propagation with optional ML ranker and semantic drift
- `@blamr/types` and `@blamr/sdk` (MIT, npm-ready)
- Sample multi-agent workflows (`samples/agents/`) using local Ollama
- LangGraph, CrewAI, and MCP adapters
- CI workflow (build + 23 unit tests)
- Deployment and operations guides

### Notes

- **Self-hosted alpha** — not a managed cloud product
- Platform LLM features require Ollama (`nomic-embed-text`, `llama3.2:3b`)
- No OpenAI/Anthropic dependency in the framework

[0.1.0]: https://github.com/blamr-ai/blamr/releases/tag/v0.1.0
