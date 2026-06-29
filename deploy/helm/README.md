# blamr Helm chart

Deploy the full blamr platform on Kubernetes: API, ingest, workers, web, Postgres, ClickHouse, Redpanda, Valkey, and Ollama.

## Prerequisites

- Kubernetes 1.26+
- Helm 3.10+
- `kubectl` configured for your cluster
- Container images built and pushed (see [Build images](#build-images))
- Default storage class for PVCs (ClickHouse, Redpanda, Ollama, Postgres)

## Quick install

```bash
# From repo root
cd deploy/helm

helm dependency update

helm install blamr . \
  --namespace blamr \
  --create-namespace \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.ingestSecret="$(openssl rand -hex 24)" \
  --set ingress.hosts.web=app.example.com \
  --set ingress.hosts.api=api.example.com \
  --set ingress.hosts.ingest=ingest.example.com \
  --set web.publicUrls.api=https://api.example.com \
  --set web.publicUrls.ingest=https://ingest.example.com
```

Local cluster (minikube / kind):

```bash
helm install blamr . -f values-local.yaml --namespace blamr --create-namespace
kubectl port-forward svc/blamr-web 8080:8080 -n blamr
```

## Build images

Build and push from the **repository root**:

```bash
REGISTRY=ghcr.io/your-org
TAG=0.1.0

docker build -f apps/api/Dockerfile -t $REGISTRY/blamr-api:$TAG .
docker build -f apps/ingest/Dockerfile -t $REGISTRY/blamr-ingest:$TAG .
docker build -f apps/workers/Dockerfile -t $REGISTRY/blamr-workers:$TAG .
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://api.example.com \
  --build-arg VITE_INGEST_URL=https://ingest.example.com \
  -t $REGISTRY/blamr-web:$TAG .

docker push $REGISTRY/blamr-api:$TAG
docker push $REGISTRY/blamr-ingest:$TAG
docker push $REGISTRY/blamr-workers:$TAG
docker push $REGISTRY/blamr-web:$TAG
```

Install with your registry:

```bash
helm upgrade --install blamr . \
  --set global.imageRegistry=ghcr.io/your-org \
  --set api.image.repository=blamr-api \
  --set ingest.image.repository=blamr-ingest \
  --set workers.image.repository=blamr-workers \
  --set web.image.repository=blamr-web \
  ...
```

## What gets deployed

| Component | Kind | Notes |
|-----------|------|-------|
| **api** | Deployment + Service | REST API :3000 |
| **ingest** | Deployment + Service | Edge ingest :3001 |
| **workers** | Deployment | Kafka consumers — **must run** |
| **web** | Deployment + Service | Dashboard :8080 |
| **clickhouse** | StatefulSet | Causal edge storage |
| **redpanda** | StatefulSet | Kafka |
| **ollama** | StatefulSet | Local SLM |
| **postgresql** | Subchart (Bitnami) | Runs metadata |
| **valkey** | Subchart | Redis cache |
| Init jobs | Job (hooks) | ClickHouse schema + Ollama models |

## Configuration

Key values in `values.yaml`:

| Value | Description |
|-------|-------------|
| `secrets.jwtSecret` | API session signing (**rotate in prod**) |
| `secrets.ingestSecret` | Merkle chain signing |
| `ingress.hosts.*` | Public hostnames |
| `web.publicUrls.*` | Must match Vite build args for web image — drives connection wizard, Connect page, and Settings ingest URL snippets (`VITE_INGEST_URL` → `apps/web/src/config.ts`) |
| `ollama.resources` | Ollama needs ~4Gi RAM minimum |
| `workers.replicaCount` | Keep at 1 unless you understand Kafka consumer groups |
| `postgresql.enabled` | Set `false` + `external.postgresql.*` for managed DB |

External services example:

```yaml
postgresql:
  enabled: false
external:
  postgresql:
    host: mydb.example.com
    port: 5432
clickhouse:
  enabled: false
external:
  clickhouse:
    url: https://clickhouse.example.com:8443
```

## Upgrade / uninstall

```bash
helm upgrade blamr . -n blamr -f values.yaml
helm uninstall blamr -n blamr
```

Ollama model pull runs on upgrade via hook job — may take several minutes.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Dashboard empty | `kubectl logs deploy/blamr-workers -n blamr` |
| Init job failed | `kubectl logs job/blamr-clickhouse-init -n blamr` |
| Ollama OOM | Increase `ollama.resources.limits.memory` |
| Web wrong API URL | Rebuild web image with correct `VITE_*` build args |

See also [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) and [docs/OPERATIONS.md](../../docs/OPERATIONS.md).

## Validate chart (dry run)

```bash
helm dependency update
helm template blamr . -f values-local.yaml > /tmp/blamr.yaml
helm lint .
```
