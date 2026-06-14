"""Feature extraction mirroring packages/ml/src/features.ts (HOP_FEATURE_DIM=24)."""
from __future__ import annotations

import math
from typing import Any

HOP_FEATURE_DIM = 24
AGENT_FEATURE_DIM = 8
INFLATION_THRESHOLD = 0.15

DRIFT_CLASSES = [
    "none",
    "domain_mismatch",
    "retrieval_miss",
    "severity_underrate",
    "confidence_inflation",
    "propagation",
    "format_error",
]


def call_type_one_hot(call_type: str) -> list[float]:
    t = call_type.lower()
    if "tool" in t:
        return [0.0, 1.0, 0.0, 0.0]
    if "mcp" in t:
        return [0.0, 0.0, 1.0, 0.0]
    if "vision" in t:
        return [0.0, 0.0, 0.0, 1.0]
    return [1.0, 0.0, 0.0, 0.0]


def log_norm(value: float, scale: float) -> float:
    return math.log1p(max(0.0, value)) / scale


def extract_hop_features(edge: dict[str, Any], idx: int, n: int, prev: dict[str, Any] | None) -> list[float]:
    ci = float(edge["confidence_in"])
    co = float(edge["confidence_out"])
    intent_delta = float(edge["intent_delta"])
    influence = float(edge["influence_score"])
    conf_drop = max(0.0, ci - co)
    inflation = max(0.0, co - ci - INFLATION_THRESHOLD)
    intent_harm = max(0.0, -intent_delta)
    tokens = int(edge.get("tokens_in", 0)) + int(edge.get("tokens_out", 0))
    prev_intent = max(0.0, -float(prev["intent_delta"])) if prev else 0.0
    prev_drop = max(0.0, float(prev["confidence_in"]) - float(prev["confidence_out"])) if prev else 0.0
    llm, tool, mcp, vision = call_type_one_hot(str(edge.get("call_type", "LLM call")))
    cos_in_out = float(edge.get("cos_in_out", 0.5))
    cos_goal_out = float(edge.get("cos_goal_out", 0.5))

    return [
        ci,
        co,
        intent_delta,
        influence,
        conf_drop,
        inflation,
        intent_harm,
        idx / (n - 1) if n > 1 else 0.0,
        log_norm(tokens, 10),
        log_norm(float(edge.get("latency_ms", 0)), 10),
        log_norm(float(edge.get("cost_usd", 0)) * 1000, 5),
        llm,
        tool,
        mcp,
        vision,
        cos_in_out,
        cos_goal_out,
        1.0 if edge.get("input_preview") else 0.0,
        1.0 if edge.get("output_preview") else 0.0,
        1.0 if idx == 0 else 0.0,
        1.0 if idx == n - 1 else 0.0,
        prev_intent,
        prev_drop,
        co * influence,
    ]


def extract_agent_features(
    agent: str,
    edges: list[dict[str, Any]],
    hop_drift: dict[int, float],
) -> list[float]:
    from_hops = [e for e in edges if e["from_agent"] == agent]
    if not from_hops:
        return [0.0] * AGENT_FEATURE_DIM

    max_drift = max(hop_drift.get(e["hop_index"], 0.0) for e in from_hops)
    sum_drift_inf = sum(hop_drift.get(e["hop_index"], 0.0) * e["influence_score"] for e in from_hops)
    max_harm = max(max(0.0, -e["intent_delta"]) for e in from_hops)
    max_drop = max(max(0.0, e["confidence_in"] - e["confidence_out"]) for e in from_hops)
    inflation = 1.0 if any(e["confidence_out"] - e["confidence_in"] > INFLATION_THRESHOLD for e in from_hops) else 0.0
    sum_inf = sum(e["influence_score"] for e in from_hops)
    min_hop = min(e["hop_index"] for e in edges)

    return [
        max_drift,
        sum_drift_inf,
        max_harm,
        max_drop,
        inflation,
        len(from_hops) / max(len(edges), 1),
        sum_inf / len(from_hops),
        1.0 if from_hops[0]["hop_index"] == min_hop else 0.0,
    ]
