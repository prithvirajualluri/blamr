"""HTTP client for blamr ingest — emit causal edges and complete runs."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from blamr_sdk.telemetry import ProviderUsage, enrich_edge_fields
from blamr_sdk.transport import BlamrTransport


def _truncate(text: str, max_len: int = 500) -> str:
    line = " ".join(str(text).split())
    return line if len(line) <= max_len else f"{line[:max_len]}…"


class BlamrEmitter:
    """Emit CausalEdges to blamr ingest without a registered workflow definition."""

    def __init__(
        self,
        workflow_id: str,
        agent_id: str,
        api_key: str | None = None,
        endpoint: str | None = None,
        *,
        sync_ingest: bool | None = None,
        system_prompt: str | None = None,
    ):
        self.workflow_id = workflow_id
        self.agent_id = agent_id
        self.api_key = api_key or os.environ.get("BLAMR_API_KEY", "")
        self.endpoint = (endpoint or os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1")).rstrip("/")
        self._transport = BlamrTransport(
            self.api_key,
            self.endpoint,
            sync=sync_ingest,
        )
        self._run_id: str | None = None
        self._hop_index = 0
        self._last_confidence_out = 1.0
        self._last_agent = agent_id
        self._prev_hash = ""
        self._provider_usage_queue: list[ProviderUsage] = []
        self._system_prompt = system_prompt.strip() if system_prompt and system_prompt.strip() else None
        self._goal_snapshot: str | None = None
        self._metadata_sync_key: str | None = None

    def record_provider_usage(self, usage: ProviderUsage) -> None:
        self._provider_usage_queue.append(usage)

    def _consume_provider_usage(self) -> ProviderUsage | None:
        if not self._provider_usage_queue:
            return None
        return self._provider_usage_queue.pop(0)

    def _queue_run_metadata(self) -> None:
        if not self._run_id:
            return
        if not self._system_prompt and not self._goal_snapshot:
            return
        sync_key = json.dumps(
            {
                "system_prompt": self._system_prompt,
                "goal_snapshot": self._goal_snapshot,
            },
            sort_keys=True,
        )
        if self._metadata_sync_key == sync_key:
            return
        self._metadata_sync_key = sync_key
        self._transport.send_with_method(
            "PUT",
            f"/runs/{self._run_id}/metadata",
            {
                "workflow_id": self.workflow_id,
                "system_prompt": self._system_prompt,
                "goal_snapshot": self._goal_snapshot,
                "system_prompt_agent_id": self.agent_id,
            },
        )

    def set_system_prompt(self, system_prompt: str | None) -> None:
        value = system_prompt.strip() if system_prompt and system_prompt.strip() else None
        if value == self._system_prompt:
            return
        self._system_prompt = value
        self._queue_run_metadata()

    def set_goal_snapshot(self, goal_snapshot: str) -> None:
        if not self._run_id:
            return
        value = goal_snapshot.strip()
        if not value:
            return
        self._goal_snapshot = value
        self._transport.send_with_method(
            "PUT",
            f"/runs/{self._run_id}/goal-snapshot",
            {"goal_snapshot": value},
        )
        self._queue_run_metadata()

    def start_run(
        self,
        run_id: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> str:
        self._run_id = run_id or f"run_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
        self._hop_index = 0
        self._last_confidence_out = 1.0
        self._last_agent = self.agent_id
        self._prev_hash = self._run_id
        self._goal_snapshot = None
        self._metadata_sync_key = None
        if options:
            if "systemPrompt" in options:
                self._system_prompt = (
                    str(options["systemPrompt"]).strip() if options["systemPrompt"] else None
                )
            if "goal_snapshot" in options and options["goal_snapshot"]:
                self._goal_snapshot = str(options["goal_snapshot"]).strip()
        self._queue_run_metadata()
        return self._run_id

    @property
    def run_id(self) -> str | None:
        return self._run_id

    def mark_handoff(self, to: str, confidence: float | None = None) -> None:
        self._last_agent = to
        if confidence is not None:
            self._last_confidence_out = confidence

    def flush(self) -> None:
        self._transport.flush()

    def emit_edge(self, **fields: Any) -> None:
        if not self._run_id:
            self.start_run()

        provider = None
        if (fields.get("tokens_in") or 0) == 0 and (fields.get("tokens_out") or 0) == 0:
            provider = self._consume_provider_usage()

        enriched = enrich_edge_fields(fields, provider)

        hop = enriched.get("hop_index", self._hop_index)
        edge: dict[str, Any] = {
            "id": enriched.get("id", f"edge_{int(time.time() * 1000)}"),
            "run_id": self._run_id,
            "workflow_id": self.workflow_id,
            "from_agent": enriched.get("from_agent", self.agent_id),
            "to_agent": enriched.get("to_agent", self._last_agent),
            "hop_index": hop,
            "timestamp_ms": int(time.time() * 1000),
            "confidence_in": enriched.get("confidence_in", self._last_confidence_out),
            "confidence_out": enriched.get("confidence_out", 1.0),
            "intent_delta": enriched.get("intent_delta", -0.02),
            "influence_score": enriched.get("influence_score", 0.8),
            "tokens_in": enriched.get("tokens_in", 0),
            "tokens_out": enriched.get("tokens_out", 0),
            "latency_ms": enriched.get("latency_ms", 0),
            "model": enriched.get("model", "unknown"),
            "call_type": enriched.get("call_type", "LLM call"),
            "cost_usd": enriched.get("cost_usd", 0),
            "prev_hash": self._prev_hash,
            "edge_hash": f"pending_{int(time.time() * 1000)}",
        }
        for key in ("input_preview", "output_preview"):
            if enriched.get(key):
                edge[key] = _truncate(str(enriched[key]))
        if enriched.get("source_hop_ids"):
            edge["source_hop_ids"] = list(enriched["source_hop_ids"])
        for key in ("reasoning_trace", "reasoning_trace_id"):
            if enriched.get(key):
                edge[key] = enriched[key]

        self._transport.send("/edges", edge)
        self._hop_index = max(self._hop_index, hop + 1)
        self._last_confidence_out = float(edge["confidence_out"])
        self._prev_hash = edge["edge_hash"]

    def complete_run(
        self,
        status: str = "success",
        error_summary: str | None = None,
        workflow_config: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        if not self._run_id:
            return None
        self.flush()
        body: dict[str, Any] = {"status": status, "error_summary": error_summary}
        if workflow_config:
            if "confidence_accept_level" in workflow_config:
                body["confidence_accept_level"] = workflow_config["confidence_accept_level"]
            if "confidence_gate_mode" in workflow_config:
                body["confidence_gate_mode"] = workflow_config["confidence_gate_mode"]
        self._transport.send(f"/runs/{self._run_id}/complete", body)
        return {"run_id": self._run_id, "status": status}
