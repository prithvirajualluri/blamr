"""HTTP client for blamr ingest — emit causal edges and complete runs."""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any


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
    ):
        self.workflow_id = workflow_id
        self.agent_id = agent_id
        self.api_key = api_key or os.environ.get("BLAMR_API_KEY", "")
        self.endpoint = (endpoint or os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1")).rstrip("/")
        self._run_id: str | None = None
        self._hop_index = 0
        self._last_confidence_out = 1.0
        self._last_agent = agent_id
        self._prev_hash = ""

    def start_run(self, run_id: str | None = None) -> str:
        self._run_id = run_id or f"run_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
        self._hop_index = 0
        self._last_confidence_out = 1.0
        self._last_agent = self.agent_id
        self._prev_hash = self._run_id
        return self._run_id

    @property
    def run_id(self) -> str | None:
        return self._run_id

    def mark_handoff(self, to: str, confidence: float | None = None) -> None:
        self._last_agent = to
        if confidence is not None:
            self._last_confidence_out = confidence

    def _post(self, path: str, body: dict[str, Any]) -> None:
        if not self.api_key:
            raise RuntimeError("BLAMR_API_KEY is required")
        req = urllib.request.Request(
            f"{self.endpoint}{path}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "X-API-Key": self.api_key},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"blamr ingest HTTP {resp.status}")

    def emit_edge(self, **fields: Any) -> None:
        if not self._run_id:
            self.start_run()

        hop = fields.get("hop_index", self._hop_index)
        edge: dict[str, Any] = {
            "run_id": self._run_id,
            "workflow_id": self.workflow_id,
            "from_agent": fields.get("from_agent", self.agent_id),
            "to_agent": fields.get("to_agent", self._last_agent),
            "hop_index": hop,
            "timestamp_ms": int(time.time() * 1000),
            "confidence_in": fields.get("confidence_in", self._last_confidence_out),
            "confidence_out": fields.get("confidence_out", 1.0),
            "intent_delta": fields.get("intent_delta", -0.02),
            "influence_score": fields.get("influence_score", 0.8),
            "tokens_in": fields.get("tokens_in", 0),
            "tokens_out": fields.get("tokens_out", 0),
            "latency_ms": fields.get("latency_ms", 0),
            "model": fields.get("model", "unknown"),
            "call_type": fields.get("call_type", "LLM call"),
            "cost_usd": fields.get("cost_usd", 0),
            "prev_hash": self._prev_hash,
            "edge_hash": f"pending_{int(time.time() * 1000)}",
        }
        for key in ("input_preview", "output_preview"):
            if fields.get(key):
                edge[key] = _truncate(str(fields[key]))

        self._post("/edges", edge)
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
        body: dict[str, Any] = {"status": status, "error_summary": error_summary}
        if workflow_config:
            if "confidence_accept_level" in workflow_config:
                body["confidence_accept_level"] = workflow_config["confidence_accept_level"]
            if "confidence_gate_mode" in workflow_config:
                body["confidence_gate_mode"] = workflow_config["confidence_gate_mode"]
        self._post(f"/runs/{self._run_id}/complete", body)
        return {"run_id": self._run_id, "status": status}
