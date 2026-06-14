# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `0.1.x` | yes |

## Reporting a vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

Email **security@blamr.ai** (or **prithvi@blamr.ai** if the security alias is unavailable) with:

- Description of the issue and impact
- Steps to reproduce
- Affected component (API, ingest, workers, dashboard, SDK)
- Your suggested fix (optional)

We aim to acknowledge reports within **3 business days** and will coordinate disclosure once a fix is available.

## Scope

In scope:

- Authentication and authorization bypass in the self-hosted API
- Ingest API key validation or merkle-chain bypass
- Remote code execution in platform services or official Docker images
- Cross-tenant data leakage in Postgres / ClickHouse queries

Out of scope:

- Misconfiguration of default dev secrets (`JWT_SECRET`, `BLAMR_INGEST_SECRET`) in non-production deployments
- Vulnerabilities in third-party dependencies without a blamr-specific exploit path
- Sample agent workflows under `samples/agents/` (demonstration code)

## Safe defaults

Before production deployment, rotate all secrets in `.env` — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
