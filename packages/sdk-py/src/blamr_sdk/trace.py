"""@blamr_trace decorator — auto-emit causal edges with previews and lineage."""

from __future__ import annotations

import functools
import time
from contextvars import ContextVar
from typing import Any, Callable, TypeVar

from blamr_sdk.client import BlamrEmitter, _truncate
from blamr_sdk.lineage import HopLineageRegistry, preview_from_value

F = TypeVar("F", bound=Callable[..., Any])

_trace_stack: ContextVar[list[dict[str, Any]]] = ContextVar("blamr_trace_stack", default=[])


def _parent_agent(emitter: BlamrEmitter, agent: str, from_agent: str | None) -> str:
  stack = _trace_stack.get()
  if from_agent:
    return from_agent
  if stack:
    return stack[-1]["agent"]
  return emitter.agent_id


def blamr_trace(
  emitter: BlamrEmitter,
  *,
  agent: str | None = None,
  from_agent: str | None = None,
  call_type: str = "Tool call",
  model: str = "unknown",
) -> Callable[[F], F]:
  """
  Decorator that wraps a function and emits one CausalEdge per invocation.

  Nested decorated calls build parent→child topology automatically.
  """

  def decorator(fn: F) -> F:
    hop_agent = agent or emitter.agent_id

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
      if not emitter.run_id:
        emitter.start_run()

      stack = _trace_stack.get()
      registry: HopLineageRegistry = stack[-1]["registry"] if stack else HopLineageRegistry()
      source_hop_ids = registry.detect_sources(args, kwargs)
      parent = _parent_agent(emitter, hop_agent, from_agent)

      frame = {"agent": hop_agent, "registry": registry}
      _trace_stack.set(stack + [frame])

      start = time.time()
      input_preview = preview_from_value(args[0] if len(args) == 1 and not kwargs else (args, kwargs))

      try:
        result = fn(*args, **kwargs)
        output_preview = preview_from_value(result)
        edge_id = f"edge_{int(time.time() * 1000)}_{id(result) & 0xFFFF:x}"
        fields: dict[str, Any] = {
          "id": edge_id,
          "from_agent": parent,
          "to_agent": hop_agent,
          "call_type": call_type,
          "model": model,
          "latency_ms": int((time.time() - start) * 1000),
          "confidence_out": 0.85 if output_preview else 0.5,
        }
        if input_preview:
          fields["input_preview"] = _truncate(input_preview)
        if output_preview:
          fields["output_preview"] = _truncate(output_preview)
        if source_hop_ids:
          fields["source_hop_ids"] = source_hop_ids
        emitter.emit_edge(**fields)
        registry.register(result, edge_id)
        return result
      except Exception as exc:
        emitter.emit_edge(
          from_agent=parent,
          to_agent=hop_agent,
          call_type=call_type,
          model=model,
          latency_ms=int((time.time() - start) * 1000),
          confidence_out=0.2,
          intent_delta=-0.5,
          output_preview=_truncate(f"error: {exc}"),
          source_hop_ids=source_hop_ids or None,
        )
        raise
      finally:
        _trace_stack.set(stack)

    return wrapper  # type: ignore[return-value]

  return decorator
