#!/usr/bin/env bash
# Lint and dry-render the blamr Helm chart.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHART="$ROOT/deploy/helm"
cd "$CHART"
echo "Updating Helm dependencies..."
helm dependency update
echo "Linting chart..."
helm lint .
echo "Rendering template (values-local.yaml)..."
helm template blamr . -f values-local.yaml > /dev/null
echo "Helm chart OK"
