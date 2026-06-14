"""LangGraph adapter for blamr causal tracing."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, Dict

# Allow running without pip install from monorepo root
_SDK = Path(__file__).resolve().parents[2] / "packages" / "sdk-py" / "src"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

from blamr_sdk.client import BlamrEmitter  # noqa: E402


class BlamrNode:
    """Wrap a LangGraph node: emit a CausalEdge on each invocation."""

    def __init__(
        self,
        workflow_id: str,
        agent_id: str,
        node_fn: Callable[[Dict[str, Any]], Dict[str, Any]],
        *,
        api_key: str | None = None,
        endpoint: str | None = None,
        to_agent: str | None = None,
        call_type: str = "LLM call",
    ):
        self.emitter = BlamrEmitter(workflow_id, agent_id, api_key, endpoint)
        self.node_fn = node_fn
        self.to_agent = to_agent or agent_id
        self.call_type = call_type

    def start_run(self, run_id: str | None = None) -> str:
        return self.emitter.start_run(run_id)

    def complete_run(self, status: str = "success", error_summary: str | None = None) -> None:
        self.emitter.complete_run(status, error_summary)

    def __call__(self, state: Dict[str, Any]) -> Dict[str, Any]:
        if not self.emitter.run_id:
            self.emitter.start_run(state.get("blamr_run_id"))
        import time

        start = time.time()
        input_preview = str(state.get("input") or state.get("query") or state)[:500]
        result = self.node_fn(state)
        output_preview = str(result.get("output") or result.get("response") or result)[:500]
        self.emitter.emit_edge(
            to_agent=self.to_agent,
            confidence_out=float(result.get("confidence", 0.9)),
            intent_delta=float(result.get("intent_delta", -0.02)),
            input_preview=input_preview,
            output_preview=output_preview,
            latency_ms=int((time.time() - start) * 1000),
            model=str(result.get("model", "langgraph-node")),
            call_type=self.call_type,
        )
        return result

    async def ainvoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        return self(state)


def blamr_node(
    workflow_id: str,
    agent_id: str,
    *,
    api_key: str | None = None,
    endpoint: str | None = None,
    to_agent: str | None = None,
) -> Callable[[Callable], BlamrNode]:
    """Decorator: `@blamr_node('my-workflow', 'my-agent') def my_node(state): ...`"""

    def decorator(fn: Callable[[Dict[str, Any]], Dict[str, Any]]) -> BlamrNode:
        return BlamrNode(workflow_id, agent_id, fn, api_key=api_key, endpoint=endpoint, to_agent=to_agent)

    return decorator
