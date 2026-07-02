"""AutoGen adapter for blamr causal tracing."""

from __future__ import annotations

import sys
import time
from pathlib import Path

_SDK = Path(__file__).resolve().parents[2] / "packages" / "sdk-py" / "src"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

from blamr_sdk.client import BlamrEmitter  # noqa: E402


class BlamrCallbacks:
    """AutoGen-style callback handler that emits CausalEdges on agent messages."""

    def __init__(
        self,
        workflow_id: str,
        api_key: str | None = None,
        endpoint: str | None = None,
        default_agent: str = "autogen",
        system_prompt: str | None = None,
    ):
        self.emitter = BlamrEmitter(
            workflow_id,
            default_agent,
            api_key,
            endpoint,
            system_prompt=system_prompt,
        )
        self._hop = 0

    def on_agent_message(self, agent_name: str, message: str, metadata: dict | None = None) -> None:
        if not self.emitter.run_id:
            self.emitter.start_run(options={"systemPrompt": self.emitter._system_prompt})
        meta = metadata or {}
        self.emitter.emit_edge(
            from_agent=agent_name,
            to_agent=agent_name,
            hop_index=self._hop,
            confidence_out=float(meta.get("confidence", 0.88)),
            intent_delta=float(meta.get("intent_delta", -0.02)),
            tokens_in=int(meta.get("tokens_in", meta.get("prompt_tokens", 0))),
            tokens_out=int(meta.get("tokens_out", meta.get("completion_tokens", 0))),
            latency_ms=int(meta.get("latency_ms", 0)),
            model=str(meta.get("model", "autogen")),
            input_preview=str(meta.get("input_preview", ""))[:500] or None,
            output_preview=str(message)[:500],
        )
        self._hop += 1

    def on_handoff(self, from_agent: str, to_agent: str, confidence: float = 0.9) -> None:
        self.emitter.mark_handoff(to_agent, confidence)

    def start_run(self, run_id: str | None = None) -> str:
        self._hop = 0
        return self.emitter.start_run(run_id, {"systemPrompt": self.emitter._system_prompt})

    def end_run(self, status: str = "success", error: str | None = None) -> dict | None:
        return self.emitter.complete_run(status, error)
