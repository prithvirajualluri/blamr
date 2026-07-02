"""CrewAI adapter for blamr causal tracing."""

from __future__ import annotations

import sys
import time
from functools import wraps
from pathlib import Path
from typing import Type

_SDK = Path(__file__).resolve().parents[2] / "packages" / "sdk-py" / "src"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

from blamr_sdk.client import BlamrEmitter  # noqa: E402


def blamr_crew(
    workflow_id: str,
    api_key: str | None = None,
    endpoint: str | None = None,
    agent_id: str = "crew",
    system_prompt: str | None = None,
):
    """Decorator that wraps a CrewAI Crew.kickoff with blamr run lifecycle."""

    def decorator(cls: Type) -> Type:
        original_kickoff = cls.kickoff

        @wraps(original_kickoff)
        def wrapped_kickoff(self, *args, **kwargs):
            emitter = BlamrEmitter(
                workflow_id,
                agent_id,
                api_key,
                endpoint,
                system_prompt=system_prompt,
            )
            run_id = emitter.start_run(
                options={
                    "systemPrompt": system_prompt,
                }
            )
            start = time.time()
            try:
                result = original_kickoff(self, *args, **kwargs)
                output = str(result)[:500]
                agents = getattr(self, "agents", []) or []
                agent_names = [getattr(a, "role", str(a)) for a in agents]
                emitter.emit_edge(
                    from_agent=agent_id,
                    to_agent=agent_names[0] if agent_names else agent_id,
                    confidence_out=0.85,
                    intent_delta=-0.02,
                    input_preview=str(args[0])[:500] if args else None,
                    output_preview=output,
                    latency_ms=int((time.time() - start) * 1000),
                    model="crewai",
                    call_type="LLM call",
                )
                for i, name in enumerate(agent_names):
                    emitter.mark_handoff(name, 0.85)
                    emitter.emit_edge(
                        from_agent=str(name),
                        to_agent=agent_names[i + 1] if i + 1 < len(agent_names) else str(name),
                        hop_index=i + 1,
                        confidence_out=0.82,
                        intent_delta=-0.02,
                        influence_score=0.7,
                        latency_ms=0,
                        model="crewai-agent",
                    )
                emitter.complete_run("success")
                return result
            except Exception as exc:
                emitter.complete_run("failed", str(exc))
                raise

        cls.kickoff = wrapped_kickoff
        cls._blamr_workflow_id = workflow_id
        cls._blamr_run_id = None
        return cls

    return decorator
