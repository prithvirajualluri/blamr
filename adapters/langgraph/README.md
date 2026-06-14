# LangGraph Adapter

Wrap any LangGraph workflow with causal tracing.

## Usage

Requires blamr ingest running and `BLAMR_API_KEY`. See [docs/INSTALL.md](../../docs/INSTALL.md).

```python
from blamr.adapters.langgraph import BlamrNode

node = BlamrNode(workflow_id="customer-support", api_key=None)

# Add as a passthrough node in your graph
graph.add_node("blamr_trace", node)
```

## How it works

`BlamrNode` intercepts state transitions and emits a `CausalEdge` for each hop, capturing:
- `confidence_in` / `confidence_out` from state metadata
- `intent_delta` via cosine similarity of goal embeddings
- `influence_score` based on state field propagation

No changes to your existing agent logic required.
