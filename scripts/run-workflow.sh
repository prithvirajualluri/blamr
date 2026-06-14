#!/usr/bin/env bash
# Run blamr sample agent workflows from the repo root.
#
# Usage:
#   ./scripts/run-workflow.sh                    # all success workflows
#   ./scripts/run-workflow.sh support            # customer-support only
#   ./scripts/run-workflow.sh research           # research-assistant only
#   ./scripts/run-workflow.sh incident           # incident-triage only
#   ./scripts/run-workflow.sh procurement        # vendor-procurement (parallel DAG)
#   ./scripts/run-workflow.sh all --fail         # all failure scenarios (dev)
#   ./scripts/run-workflow.sh support --fail     # one failure scenario
#
# Aliases: customer-support, research-assistant, incident-triage
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$ROOT/samples/agents"
ENV_FILE="$AGENTS/.env"

usage() {
  cat <<'EOF'
Run blamr sample agent workflows.

Usage:
  ./scripts/run-workflow.sh [workflow] [--fail]

Workflows:
  all (default)   Run all workflows (includes vendor-procurement)
  support       customer-support
  research      research-assistant
  incident      incident-triage
  procurement   vendor-procurement (parallel review DAG)

Options:
  --fail        Dev-only failure harness (sets BLAMR_FAILURE_TESTS=1)
  -h, --help    Show this help

Setup:
  cp samples/agents/.env.example samples/agents/.env
  # Add BLAMR_API_KEY (Ollama must be running at BLAMR_LLM_BASE_URL)

Prerequisites:
  ./scripts/dev-backend.sh   (or dev:api + dev:ingest + dev:workers)
  npm run dev:web
EOF
}

WORKFLOW="all"
MODE="real"

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --fail)
      MODE="fail"
      ;;
    all|support|research|incident|procurement|customer-support|research-assistant|incident-triage|vendor-procurement)
      WORKFLOW="$arg"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cd "$ROOT"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  echo "Run: cp samples/agents/.env.example samples/agents/.env" >&2
  echo "Then add BLAMR_API_KEY (and ensure Ollama is running)" >&2
  exit 1
fi

# Quick ingest health check (non-fatal warning)
ingest_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://127.0.0.1:3001/v1/edges \
  -H 'Content-Type: application/json' \
  -d '{}' 2>/dev/null || echo "000")
if [ "$ingest_code" = "000" ]; then
  echo "Warning: ingest not reachable at http://127.0.0.1:3001 — start ./scripts/dev-backend.sh" >&2
elif [ "$ingest_code" != "401" ] && [ "$ingest_code" != "400" ] && [ "$ingest_code" != "422" ]; then
  echo "Warning: ingest returned HTTP $ingest_code (expected 401/400 without auth)" >&2
fi

case "$WORKFLOW" in
  customer-support) WORKFLOW="support" ;;
  research-assistant) WORKFLOW="research" ;;
  incident-triage) WORKFLOW="incident" ;;
  vendor-procurement) WORKFLOW="procurement" ;;
esac

if [ "$MODE" = "fail" ]; then
  export BLAMR_FAILURE_TESTS=1
  npm run "fail:$WORKFLOW" --prefix "$AGENTS"
else
  if [ "$WORKFLOW" = "all" ]; then
    npm run real --prefix "$AGENTS"
  else
    npm run "real:$WORKFLOW" --prefix "$AGENTS"
  fi
fi
