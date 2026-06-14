#!/usr/bin/env bash
# Build and start the full blamr stack in Docker (includes Ollama SLM).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "No .env found — copying .env.docker.example → .env"
  cp .env.docker.example .env
fi

echo "Building and starting blamr stack (Ollama models pull on first run, ~3 GB)..."
docker compose up --build -d

echo ""
echo "Waiting for Ollama model pull (ollama-init)..."
deadline=$((SECONDS + 900))
while [[ $SECONDS -lt $deadline ]]; do
  status="$(docker compose ps ollama-init --format '{{.State}}' 2>/dev/null || true)"
  if [[ "$status" == "exited" ]]; then
    if docker compose logs ollama-init 2>&1 | grep -q 'Ollama models ready'; then
      echo "Ollama models ready."
      break
    fi
    echo "Warning: ollama-init may have failed. Check: docker compose logs ollama-init"
    break
  fi
  sleep 5
  printf '.'
done
echo ""

echo "Waiting for API..."
deadline=$((SECONDS + 180))
until curl -sf http://localhost:3000/v1/auth/login -o /dev/null -w '' 2>/dev/null || [[ $SECONDS -ge $deadline ]]; do
  sleep 3
  printf '.'
done
echo ""

code="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"health@check.local","password":"x"}' || echo '000')"
if [[ "$code" =~ ^(400|401|422|500)$ ]]; then
  echo "API is responding (HTTP $code)."
else
  echo "Warning: API may not be ready yet (HTTP $code). Check: docker compose logs api"
fi

echo ""
docker compose ps
cat <<'EOF'

blamr is running:
  Dashboard   http://localhost:8080
  API         http://localhost:3000
  Ingest      http://localhost:3001
  Ollama      http://localhost:11434

Next steps:
  1. Open http://localhost:8080 → register workspace → Settings → API & keys
  2. cp samples/agents/.env.example samples/agents/.env
     Set BLAMR_API_KEY and BLAMR_ENDPOINT=http://localhost:3001/v1
  3. ./scripts/run-workflow.sh support

Logs:  docker compose logs -f api ingest workers ollama
Stop:  docker compose down

See docs/DEPLOYMENT.md for production notes.
EOF
