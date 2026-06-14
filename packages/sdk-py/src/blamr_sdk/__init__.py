"""blamr Python SDK — causal edge emission for multi-agent workflows."""

from __future__ import annotations

import os
import time
from typing import Any

from blamr_sdk.client import BlamrEmitter, _truncate

__all__ = ["BlamrEmitter", "wrap_client", "BlamrWrappedClient"]


def wrap_client(
    client: Any,
    workflow_id: str,
    agent_id: str,
    api_key: str | None = None,
    endpoint: str | None = None,
) -> "BlamrWrappedClient":
    return BlamrWrappedClient(
        client=client,
        workflow_id=workflow_id,
        agent_id=agent_id,
        api_key=api_key or os.environ.get("BLAMR_API_KEY", ""),
        endpoint=endpoint or os.environ.get("BLAMR_ENDPOINT", "http://localhost:3001/v1"),
    )


class BlamrWrappedClient:
    """Passthrough wrapper exposing `.blamr` emitter alongside the underlying client."""

    def __init__(
        self,
        client: Any,
        workflow_id: str,
        agent_id: str,
        api_key: str,
        endpoint: str,
    ):
        self._client = client
        self.blamr = BlamrEmitter(workflow_id, agent_id, api_key, endpoint)

    def start_run(self, run_id: str | None = None) -> str:
        return self.blamr.start_run(run_id)

    def end_run(self, status: str = "success", error: str | None = None) -> dict | None:
        return self.blamr.complete_run(status, error)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)
