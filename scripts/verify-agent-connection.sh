#!/usr/bin/env bash
# Verify ingest API key + endpoint by sending one test edge and completing the run.
# Usage:
#   ./scripts/verify-agent-connection.sh
#   ./scripts/verify-agent-connection.sh samples/agents/.env
#   BLAMR_API_KEY=bk_live_... BLAMR_ENDPOINT=http://localhost:3001/v1 ./scripts/verify-agent-connection.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT/samples/agents/.env}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

API_KEY="${BLAMR_API_KEY:-}"
ENDPOINT="${BLAMR_ENDPOINT:-http://localhost:3001/v1}"
ENDPOINT="${ENDPOINT%/}"
DASHBOARD_URL="${BLAMR_DASHBOARD_URL:-http://localhost:8080}"

if [[ -z "$API_KEY" ]]; then
  echo "Missing BLAMR_API_KEY." >&2
  echo "Set it in $ENV_FILE or pass via environment." >&2
  exit 1
fi

RUN_ID="run_verify_$(date +%s)_$RANDOM"
WORKFLOW_ID="onboarding-test"

EDGE_PAYLOAD=$(cat <<EOF
{
  "run_id": "$RUN_ID",
  "workflow_id": "$WORKFLOW_ID",
  "from_agent": "verify-script",
  "to_agent": "onboarding-agent",
  "hop_index": 0,
  "confidence_in": 1.0,
  "confidence_out": 0.95,
  "intent_delta": 0,
  "influence_score": 0.8,
  "tokens_in": 8,
  "tokens_out": 16,
  "latency_ms": 30,
  "model": "verify-script",
  "call_type": "LLM call",
  "cost_usd": 0,
  "input_preview": "verify-agent-connection.sh",
  "output_preview": "Connection verified."
}
EOF
)

echo "→ POST $ENDPOINT/edges"
EDGE_RESP=$(curl -sf -X POST "$ENDPOINT/edges" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "$EDGE_PAYLOAD") || {
  echo "Failed to ingest test edge. Check BLAMR_ENDPOINT ($ENDPOINT) and BLAMR_API_KEY." >&2
  exit 1
}

RESOLVED_RUN_ID=$(echo "$EDGE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('run_id','$RUN_ID'))" 2>/dev/null || echo "$RUN_ID")

echo "→ POST $ENDPOINT/runs/$RESOLVED_RUN_ID/complete"
curl -sf -X POST "$ENDPOINT/runs/$RESOLVED_RUN_ID/complete" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"status":"success"}' > /dev/null

echo ""
echo "✓ Agent connection verified"
echo "  Run ID:    $RESOLVED_RUN_ID"
echo "  Workflow:  $WORKFLOW_ID"
echo "  Dashboard: $DASHBOARD_URL/#/runs/$RESOLVED_RUN_ID"
echo ""
echo "Runs may take a few seconds to appear while workers process the edge."
