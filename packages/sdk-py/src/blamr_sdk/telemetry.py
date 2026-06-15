"""Estimate tokens/cost when agents omit usage on emit_edge."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

DEFAULT_CHARS_PER_TOKEN = 4

DEFAULT_MODEL_PRICING: dict[str, tuple[float, float]] = {
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-3-5-sonnet-latest": (3.0, 15.0),
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
}

CALL_TYPE_ALIASES = {
    "tool_call": "Tool call",
    "llm_call": "LLM call",
    "mcp_call": "MCP call",
    "vision_call": "Vision call",
}


@dataclass
class ProviderUsage:
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: int


def _env_on(name: str, default: bool = True) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val not in ("0", "false", "False")


def estimate_tokens(text: str | None, chars_per_token: int = DEFAULT_CHARS_PER_TOKEN) -> int:
    if not text or not str(text).strip():
        return 0
    return max(1, (len(str(text).strip()) + chars_per_token - 1) // chars_per_token)


def _resolve_pricing(model: str, overrides: dict[str, tuple[float, float]] | None = None) -> tuple[float, float] | None:
    pricing = {**DEFAULT_MODEL_PRICING, **(overrides or {})}
    if model in pricing:
        return pricing[model]
    lower = model.lower()
    for key, rates in pricing.items():
        if key.lower() in lower or lower in key.lower():
            return rates
    if "sonnet" in lower:
        return (3.0, 15.0)
    if "haiku" in lower:
        return (0.8, 4.0)
    if "opus" in lower:
        return (15.0, 75.0)
    return None


def estimate_cost_usd(model: str, tokens_in: int, tokens_out: int, overrides: dict[str, tuple[float, float]] | None = None) -> float:
    rates = _resolve_pricing(model, overrides)
    if not rates:
        return 0.0
    inp, out = rates
    return round((tokens_in * inp + tokens_out * out) / 1_000_000, 6)


def normalize_call_type(call_type: str | None, model: str) -> str:
    raw = (call_type or "LLM call").strip()
    lower = raw.lower()
    if lower in ("tool_call", "llm_call") and model and model != "unknown":
        return "LLM call"
    aliased = CALL_TYPE_ALIASES.get(raw) or CALL_TYPE_ALIASES.get(lower)
    if aliased:
        return aliased
    if raw in ("LLM call", "Tool call", "Vision call", "MCP call"):
        return raw
    return "LLM call" if model and model != "unknown" else raw


def enrich_edge_fields(
    fields: dict[str, Any],
    provider_usage: ProviderUsage | None = None,
    *,
    enrich_missing: bool | None = None,
    attach_provider: bool | None = None,
    model_pricing: dict[str, tuple[float, float]] | None = None,
) -> dict[str, Any]:
    enrich = enrich_missing if enrich_missing is not None else _env_on("BLAMR_ENRICH_USAGE")
    attach = attach_provider if attach_provider is not None else _env_on("BLAMR_ATTACH_PROVIDER_USAGE")

    out = dict(fields)
    model = str(out.get("model") or "unknown")
    out["call_type"] = normalize_call_type(out.get("call_type"), model)

    tokens_in = int(out.get("tokens_in") or 0)
    tokens_out = int(out.get("tokens_out") or 0)
    latency_ms = int(out.get("latency_ms") or 0)
    cost_usd = float(out.get("cost_usd") or 0)

    missing = tokens_in == 0 and tokens_out == 0 and cost_usd == 0
    if missing and attach and provider_usage:
        tokens_in = provider_usage.tokens_in
        tokens_out = provider_usage.tokens_out
        latency_ms = latency_ms or provider_usage.latency_ms
        if model in ("unknown", ""):
            model = provider_usage.model

    if enrich:
        if tokens_in == 0:
            tokens_in = estimate_tokens(out.get("input_preview"))
        if tokens_out == 0:
            tokens_out = estimate_tokens(out.get("output_preview"))

    out["tokens_in"] = tokens_in
    out["tokens_out"] = tokens_out
    out["latency_ms"] = latency_ms
    out["model"] = model

    if cost_usd == 0 and (tokens_in > 0 or tokens_out > 0):
        out["cost_usd"] = estimate_cost_usd(model, tokens_in, tokens_out, model_pricing)

    return out
