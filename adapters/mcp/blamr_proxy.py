#!/usr/bin/env python3
"""MCP middleware proxy — bidirectional stdio/SSE relay with blamr causal edges."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

_SDK = Path(__file__).resolve().parents[2] / "packages" / "sdk-py" / "src"
if str(_SDK) not in sys.path:
    sys.path.insert(0, str(_SDK))

from blamr_sdk.client import BlamrEmitter  # noqa: E402


@dataclass
class PendingCall:
    tool_name: str
    arguments: dict[str, Any]
    started_at: float
    hop_index: int


@dataclass
class ProxySession:
    emitter: BlamrEmitter
    pending: dict[int | str, PendingCall] = field(default_factory=dict)
    hop_index: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)
    failed: bool = False

    def next_hop(self) -> int:
        with self.lock:
            hop = self.hop_index
            self.hop_index += 1
            return hop


def _truncate(text: str, max_len: int = 500) -> str:
    line = " ".join(str(text).split())
    return line if len(line) <= max_len else f"{line[:max_len]}…"


def _parse_json_line(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def _tool_result_preview(result: dict[str, Any]) -> str:
    if "result" in result:
        payload = result["result"]
        if isinstance(payload, dict):
            content = payload.get("content")
            if isinstance(content, list) and content:
                first = content[0]
                if isinstance(first, dict) and "text" in first:
                    return _truncate(str(first["text"]))
            return _truncate(json.dumps(payload))
    if "error" in result:
        return _truncate(json.dumps(result["error"]))
    return _truncate(json.dumps(result))


def _is_tool_error(result: dict[str, Any]) -> bool:
    if result.get("error"):
        return True
    payload = result.get("result")
    if isinstance(payload, dict) and payload.get("isError"):
        return True
    return False


def _score_tool_result(result: dict[str, Any], latency_ms: int) -> tuple[float, float]:
    """Return (confidence_out, intent_delta)."""
    if _is_tool_error(result):
        return 0.35, -0.25
    if latency_ms > 5000:
        return 0.65, -0.08
    return 0.9, -0.02


def _emit_tool_edge(session: ProxySession, req_id: int | str, result: dict[str, Any]) -> None:
    pending = session.pending.pop(req_id, None)
    if not pending:
        return
    latency_ms = int((time.time() - pending.started_at) * 1000)
    conf_out, intent_delta = _score_tool_result(result, latency_ms)
    preview = _tool_result_preview(result)
    session.emitter.emit_edge(
        hop_index=pending.hop_index,
        from_agent=f"mcp_{pending.tool_name}",
        to_agent=session.emitter.agent_id,
        confidence_out=conf_out,
        intent_delta=intent_delta,
        call_type="MCP call",
        model="mcp-tool",
        input_preview=_truncate(json.dumps(pending.arguments)),
        output_preview=preview,
        latency_ms=latency_ms,
    )
    if _is_tool_error(result):
        session.failed = True


def _handle_client_line(session: ProxySession, line: str, server_stdin) -> None:
    msg = _parse_json_line(line)
    if msg is None:
        server_stdin.write(line if line.endswith("\n") else line + "\n")
        server_stdin.flush()
        return

    method = msg.get("method", "")
    req_id = msg.get("id")

    if method == "tools/call" and req_id is not None:
        params = msg.get("params") or {}
        tool = str(params.get("name", "tool"))
        args = params.get("arguments") or {}
        if not isinstance(args, dict):
            args = {"value": args}
        hop = session.next_hop()
        session.pending[req_id] = PendingCall(tool, args, time.time(), hop)

    server_stdin.write(json.dumps(msg) + "\n")
    server_stdin.flush()


def _handle_server_line(session: ProxySession, line: str, client_stdout) -> None:
    msg = _parse_json_line(line)
    if msg is not None and "id" in msg and msg["id"] in session.pending:
        _emit_tool_edge(session, msg["id"], msg)

    client_stdout.write(line if line.endswith("\n") else line + "\n")
    client_stdout.flush()


def run_stdio_proxy(cmd: list[str], workflow_id: str, api_key: str | None, agent_id: str) -> int:
    """Bidirectional stdio MCP relay with blamr telemetry on tools/call."""
    emitter = BlamrEmitter(workflow_id, agent_id, api_key)
    emitter.start_run()
    session = ProxySession(emitter=emitter)

    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=sys.stderr,
        text=True,
        bufsize=1,
    )
    assert proc.stdin and proc.stdout

    def pump_client_to_server() -> None:
        try:
            for line in sys.stdin:
                _handle_client_line(session, line, proc.stdin)
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass

    def pump_server_to_client() -> None:
        try:
            for line in proc.stdout:
                _handle_server_line(session, line, sys.stdout)
        except (BrokenPipeError, OSError):
            pass

    t_in = threading.Thread(target=pump_client_to_server, daemon=True)
    t_out = threading.Thread(target=pump_server_to_client, daemon=True)
    t_in.start()
    t_out.start()

    try:
        t_in.join()
        t_out.join()
    except KeyboardInterrupt:
        proc.terminate()
    finally:
        status = "failed" if session.failed else "success"
        emitter.complete_run(status)
        proc.wait(timeout=5)

    return proc.returncode or 0


def run_sse_proxy(
    target_url: str,
    workflow_id: str,
    api_key: str | None,
    agent_id: str,
    message: dict[str, Any],
) -> int:
    """Single JSON-RPC POST to an HTTP/SSE MCP endpoint with blamr edge emission."""
    emitter = BlamrEmitter(workflow_id, agent_id, api_key)
    emitter.start_run()
    session = ProxySession(emitter=emitter)

    body = json.dumps(message).encode()
    req = urllib.request.Request(
        target_url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
        method="POST",
    )
    if api_key:
        req.add_header("X-API-Key", api_key)

    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        session.failed = True

    latency_ms = int((time.time() - started) * 1000)
    result: dict[str, Any] | None = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            line = line[5:].strip()
        parsed = _parse_json_line(line)
        if parsed:
            result = parsed

    if result is None:
        result = {"error": {"message": raw[:500] or "empty response"}}
        session.failed = True

    method = message.get("method", "")
    if method == "tools/call":
        params = message.get("params") or {}
        tool = str(params.get("name", "tool"))
        args = params.get("arguments") or {}
        hop = session.next_hop()
        session.pending[message.get("id", 1)] = PendingCall(tool, args if isinstance(args, dict) else {}, started, hop)
        _emit_tool_edge(session, message.get("id", 1), result)

    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()
    status = "failed" if session.failed else "success"
    emitter.complete_run(status)
    return 1 if session.failed else 0


def main() -> None:
    parser = argparse.ArgumentParser(description="blamr MCP proxy — stdio and HTTP/SSE relay with causal edges")
    parser.add_argument("--workflow-id", required=True)
    parser.add_argument("--api-key", default=os.environ.get("BLAMR_API_KEY"))
    parser.add_argument("--agent-id", default="mcp_proxy")
    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser("run", help="Run MCP server through bidirectional stdio proxy")
    run_parser.add_argument("cmd", nargs=argparse.REMAINDER, help="MCP server command")

    proxy_parser = sub.add_parser("proxy", help="POST a JSON-RPC message to an HTTP MCP endpoint")
    proxy_parser.add_argument("--target", required=True, help="MCP HTTP/SSE endpoint URL")
    proxy_parser.add_argument("--message", default=None, help="JSON-RPC message (default: tools/list)")

    args = parser.parse_args()

    if args.command == "run":
        if not args.cmd:
            parser.error("run requires a command, e.g. run -- npx @modelcontextprotocol/server-filesystem /data")
        code = run_stdio_proxy(args.cmd, args.workflow_id, args.api_key, args.agent_id)
        sys.exit(code)

    if args.command == "proxy":
        default_msg = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
        message = json.loads(args.message) if args.message else default_msg
        code = run_sse_proxy(args.target, args.workflow_id, args.api_key, args.agent_id, message)
        sys.exit(code)


if __name__ == "__main__":
    main()
