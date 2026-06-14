# blamr Python SDK

Emit causal edges from Python agents to a self-hosted blamr ingest endpoint.

## Install

From the monorepo (development):

```bash
pip install /path/to/blamr/packages/sdk-py
```

From Git (when repo is public):

```bash
pip install "git+https://github.com/blamr-ai/blamr.git#subdirectory=packages/sdk-py"
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
    "customer-support",
    "intent_classifier",
    api_key=os.environ["BLAMR_API_KEY"],
    endpoint=os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1"),
)

run_id = emitter.start_run()
emitter.emit_edge(
    from_agent="intent_classifier",
    to_agent="policy_lookup",
    confidence_in=1.0,
    confidence_out=0.92,
    intent_delta=0.05,
    influence_score=0.85,
    input_preview="How much PTO do I have?",
    output_preview='{"category":"hr_policy"}',
)
emitter.complete_run("success")
```

## Environment

| Variable | Description |
|----------|-------------|
| `BLAMR_API_KEY` | Ingest key with `ingest:write` |
| `BLAMR_ENDPOINT` | Default `http://localhost:3001/v1` |

See [docs/INSTALL.md](../../docs/INSTALL.md) for platform setup.
