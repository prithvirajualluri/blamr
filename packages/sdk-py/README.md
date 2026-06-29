# blamr Python SDK

Emit causal edges from Python agents to a self-hosted blamr ingest endpoint.

## Install

From the monorepo (development):

```bash
pip install /path/to/blamr/packages/sdk-py
```

From Git:

```bash
pip install "git+https://github.com/prithvirajualluri/blamr.git#subdirectory=packages/sdk-py"
```

When published to PyPI:

```bash
pip install blamr-sdk
```

## Usage

```python
import os
from blamr_sdk.client import BlamrEmitter

emitter = BlamrEmitter(
    "web-research",
    "orchestrator",
    api_key=os.environ["BLAMR_API_KEY"],
    endpoint=os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1"),
)

run_id = emitter.start_run()
emitter.emit_edge(
    from_agent="search_agent",
    to_agent="fetch_agent",
    model="claude-sonnet-4-6",
    confidence_out=0.85,
    input_preview="How much PTO do I have?",
    output_preview='{"results": []}',
)
emitter.complete_run("success")
```

## Non-blocking ingest

`emit_edge` returns immediately by default. Failed POSTs are queued under `~/.blamr/queue` and retried. `complete_run()` flushes before run completion.

| Variable | Default | Description |
|----------|---------|-------------|
| `BLAMR_SYNC_INGEST` | off | Block on each POST (tests) |
| `BLAMR_QUEUE_DIR` | `~/.blamr/queue` | Offline queue directory |

## `@blamr_trace` decorator

Auto-emits edges with previews and `source_hop_ids` lineage:

```python
from blamr_sdk import BlamrEmitter, blamr_trace

emitter = BlamrEmitter("web-research", "orchestrator", api_key=os.environ["BLAMR_API_KEY"])

@blamr_trace(emitter, agent="researcher")
def research(query: str) -> str:
    return do_search(query)

emitter.start_run()
research("How much PTO?")
emitter.complete_run("success")
```

## Automatic usage telemetry

When `tokens_in`, `tokens_out`, or `cost_usd` are omitted, the SDK enriches each `emit_edge` automatically (default on):

- Estimates tokens from `input_preview` / `output_preview`
- Estimates cost from built-in model pricing
- Normalizes `call_type` (e.g. `tool_call` → `LLM call` when a model is set)

### Exact Anthropic usage (optional)

Record provider usage once per LLM call; the next `emit_edge` picks it up:

```python
import time
from blamr_sdk.telemetry import ProviderUsage

start = time.time()
message = client.messages.create(...)

emitter.record_provider_usage(
    ProviderUsage(
        model=message.model,
        tokens_in=message.usage.input_tokens,
        tokens_out=message.usage.output_tokens,
        latency_ms=int((time.time() - start) * 1000),
    )
)

emitter.emit_edge(...)  # same fields as before
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `BLAMR_API_KEY` | — | Ingest key with `ingest:write` |
| `BLAMR_ENDPOINT` | `http://localhost:3001/v1` | Ingest base URL |
| `BLAMR_ENRICH_USAGE` | on | Estimate tokens/cost from previews |
| `BLAMR_ATTACH_PROVIDER_USAGE` | on | Attach last `record_provider_usage` |

See [docs/INSTALL.md](../../docs/INSTALL.md) for platform setup and TypeScript equivalents.
