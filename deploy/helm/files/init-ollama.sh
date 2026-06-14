#!/usr/bin/env sh
set -eu
OLLAMA_URL="${OLLAMA_URL:-http://ollama:11434}"
pull_model() {
  name="$1"
  echo "Pulling Ollama model: ${name}..."
  curl -sfN "${OLLAMA_URL}/api/pull" -d "{\"name\":\"${name}\"}"
  echo
}
echo "Waiting for Ollama at ${OLLAMA_URL}..."
until curl -sf "${OLLAMA_URL}/api/tags" >/dev/null; do sleep 2; done
pull_model "${BLAMR_OLLAMA_EMBED_MODEL:-nomic-embed-text}"
pull_model "${BLAMR_OLLAMA_CHAT_MODEL:-llama3.2:3b}"
echo "Ollama models ready"
