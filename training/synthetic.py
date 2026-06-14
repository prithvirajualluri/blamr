"""Synthetic multi-agent runs aligned with samples/agents failure scenarios."""
from __future__ import annotations

import random
from typing import Any

from features import DRIFT_CLASSES


def _edge(
    hop: int,
    from_agent: str,
    to_agent: str,
    *,
    ci: float,
    co: float,
    intent_delta: float,
    influence: float,
    call_type: str = "LLM call",
    cos_in_out: float = 0.85,
    cos_goal_out: float = 0.88,
    has_io: bool = True,
) -> dict[str, Any]:
    return {
        "hop_index": hop,
        "from_agent": from_agent,
        "to_agent": to_agent,
        "confidence_in": ci,
        "confidence_out": co,
        "intent_delta": intent_delta,
        "influence_score": influence,
        "tokens_in": random.randint(80, 400),
        "tokens_out": random.randint(40, 200),
        "latency_ms": random.randint(200, 1200),
        "cost_usd": random.uniform(0.0001, 0.002),
        "call_type": call_type,
        "cos_in_out": cos_in_out,
        "cos_goal_out": cos_goal_out,
        "input_preview": "sample input" if has_io else "",
        "output_preview": "sample output" if has_io else "",
    }


def support_success() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "intent_classifier", "policy_lookup", ci=1.0, co=0.91, intent_delta=-0.02, influence=0.85),
        _edge(1, "policy_lookup", "response_writer", ci=0.91, co=0.92, intent_delta=-0.02, influence=0.55, call_type="Tool call"),
        _edge(2, "response_writer", "response_writer", ci=0.92, co=0.89, intent_delta=-0.02, influence=0.25),
    ]
    return edges, "none", "intent_classifier"


def support_misroute() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "intent_classifier", "policy_lookup", ci=1.0, co=0.9, intent_delta=-0.02, influence=0.85, cos_goal_out=0.9),
        _edge(
            1,
            "policy_lookup",
            "response_writer",
            ci=0.9,
            co=0.65,
            intent_delta=-0.35,
            influence=0.55,
            call_type="Tool call",
            cos_in_out=0.42,
            cos_goal_out=0.38,
        ),
        _edge(2, "response_writer", "response_writer", ci=0.65, co=0.58, intent_delta=-0.18, influence=0.25, cos_goal_out=0.45),
    ]
    return edges, "domain_mismatch", "policy_lookup"


def research_success() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "query_planner", "kb_retriever", ci=1.0, co=0.88, intent_delta=-0.03, influence=0.8),
        _edge(1, "kb_retriever", "summarizer", ci=0.88, co=0.82, intent_delta=-0.05, influence=0.6, call_type="Tool call"),
        _edge(2, "summarizer", "synthesizer", ci=0.82, co=0.85, intent_delta=-0.04, influence=0.45),
        _edge(3, "synthesizer", "synthesizer", ci=0.85, co=0.87, intent_delta=-0.02, influence=0.3),
    ]
    return edges, "none", "query_planner"


def research_kb_miss() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "query_planner", "kb_retriever", ci=1.0, co=0.86, intent_delta=-0.03, influence=0.8),
        _edge(
            1,
            "kb_retriever",
            "summarizer",
            ci=0.86,
            co=0.28,
            intent_delta=-0.35,
            influence=0.6,
            call_type="Tool call",
            cos_in_out=0.22,
            cos_goal_out=0.25,
        ),
        _edge(2, "summarizer", "synthesizer", ci=0.28, co=0.35, intent_delta=-0.15, influence=0.45),
        _edge(3, "synthesizer", "synthesizer", ci=0.35, co=0.4, intent_delta=-0.08, influence=0.3),
    ]
    return edges, "retrieval_miss", "kb_retriever"


def incident_success() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "alert_classifier", "impact_assessor", ci=1.0, co=0.87, intent_delta=-0.04, influence=0.82),
        _edge(1, "impact_assessor", "runbook_selector", ci=0.87, co=0.84, intent_delta=-0.03, influence=0.65),
        _edge(2, "runbook_selector", "action_planner", ci=0.84, co=0.88, intent_delta=-0.02, influence=0.5, call_type="Tool call"),
        _edge(3, "action_planner", "action_planner", ci=0.88, co=0.86, intent_delta=-0.02, influence=0.28),
    ]
    return edges, "none", "alert_classifier"


def incident_under_severity() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "alert_classifier", "impact_assessor", ci=1.0, co=0.88, intent_delta=-0.04, influence=0.82),
        _edge(
            1,
            "impact_assessor",
            "runbook_selector",
            ci=0.88,
            co=0.72,
            intent_delta=-0.28,
            influence=0.65,
            cos_in_out=0.55,
            cos_goal_out=0.48,
        ),
        _edge(2, "runbook_selector", "action_planner", ci=0.72, co=0.8, intent_delta=-0.05, influence=0.5, call_type="Tool call"),
        _edge(3, "action_planner", "action_planner", ci=0.8, co=0.78, intent_delta=-0.04, influence=0.28),
    ]
    return edges, "severity_underrate", "impact_assessor"


def inflation_run() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "intent_classifier", "policy_lookup", ci=1.0, co=0.95, intent_delta=-0.02, influence=0.85),
        _edge(
            1,
            "policy_lookup",
            "response_writer",
            ci=0.95,
            co=0.96,
            intent_delta=-0.32,
            influence=0.55,
            call_type="Tool call",
            cos_in_out=0.4,
        ),
        _edge(2, "response_writer", "response_writer", ci=0.96, co=0.94, intent_delta=-0.12, influence=0.25),
    ]
    return edges, "confidence_inflation", "policy_lookup"


def propagation_run() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "query_planner", "kb_retriever", ci=1.0, co=0.9, intent_delta=-0.02, influence=0.8),
        _edge(1, "kb_retriever", "summarizer", ci=0.9, co=0.55, intent_delta=-0.22, influence=0.6, call_type="Tool call"),
        _edge(2, "summarizer", "synthesizer", ci=0.55, co=0.48, intent_delta=-0.18, influence=0.45),
        _edge(3, "synthesizer", "synthesizer", ci=0.48, co=0.42, intent_delta=-0.12, influence=0.3),
    ]
    return edges, "propagation", "summarizer"


def invoice_plain_text() -> tuple[list[dict], str, str]:
    """Plain-text workflow — no JSON previews (platform generic)."""
    edges = [
        _edge(
            0,
            "parser",
            "matcher",
            ci=1.0,
            co=0.88,
            intent_delta=-0.05,
            influence=0.85,
            cos_goal_out=0.86,
        ),
        _edge(
            1,
            "matcher",
            "notifier",
            ci=0.88,
            co=0.55,
            intent_delta=-0.28,
            influence=0.9,
            call_type="Tool call",
            cos_in_out=0.38,
            cos_goal_out=0.42,
        ),
        _edge(2, "notifier", "notifier", ci=0.55, co=0.62, intent_delta=-0.12, influence=0.75, cos_goal_out=0.58),
    ]
    return edges, "retrieval_miss", "matcher"


def code_review_parallel() -> tuple[list[dict], str, str]:
    """Parallel fan-out at same hop_index."""
    edges = [
        _edge(0, "orchestrator", "security_scan", ci=1.0, co=0.9, intent_delta=-0.02, influence=0.7),
        _edge(0, "orchestrator", "style_check", ci=1.0, co=0.92, intent_delta=-0.02, influence=0.65),
        _edge(1, "security_scan", "merger", ci=0.9, co=0.85, intent_delta=-0.04, influence=0.55, call_type="Tool call"),
        _edge(1, "style_check", "merger", ci=0.92, co=0.88, intent_delta=-0.03, influence=0.5, call_type="Tool call"),
        _edge(2, "merger", "merger", ci=0.86, co=0.84, intent_delta=-0.02, influence=0.4),
    ]
    return edges, "none", "orchestrator"


def data_pipeline_dag() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "extractor", "transform_a", ci=1.0, co=0.91, intent_delta=-0.02, influence=0.8),
        _edge(1, "transform_a", "joiner", ci=0.91, co=0.88, intent_delta=-0.03, influence=0.6),
        _edge(1, "extractor", "transform_b", ci=1.0, co=0.72, intent_delta=-0.18, influence=0.75),
        _edge(2, "transform_b", "joiner", ci=0.72, co=0.65, intent_delta=-0.22, influence=0.55, call_type="Tool call"),
        _edge(3, "joiner", "loader", ci=0.76, co=0.7, intent_delta=-0.1, influence=0.45),
    ]
    return edges, "propagation", "transform_b"


def generic_prose_success() -> tuple[list[dict], str, str]:
    edges = [
        _edge(0, "agent_alpha", "agent_beta", ci=1.0, co=0.9, intent_delta=-0.02, influence=0.8, cos_goal_out=0.9),
        _edge(1, "agent_beta", "agent_gamma", ci=0.9, co=0.87, intent_delta=-0.03, influence=0.65, cos_goal_out=0.88),
        _edge(2, "agent_gamma", "agent_gamma", ci=0.87, co=0.86, intent_delta=-0.02, influence=0.4),
    ]
    return edges, "none", "agent_alpha"


SCENARIOS = [
    support_success,
    support_misroute,
    research_success,
    research_kb_miss,
    incident_success,
    incident_under_severity,
    inflation_run,
    propagation_run,
    invoice_plain_text,
    code_review_parallel,
    data_pipeline_dag,
    generic_prose_success,
]


def hop_label(edge: dict, scenario_label: str, idx: int, root_agent: str) -> str:
    if edge["from_agent"] == root_agent and scenario_label != "none":
        return scenario_label
    if scenario_label == "propagation" and idx > 1:
        return "propagation"
    if scenario_label == "confidence_inflation" and edge["confidence_out"] - edge["confidence_in"] > 0.15:
        return "confidence_inflation"
    harm = max(0.0, -edge["intent_delta"])
    if harm < 0.08 and scenario_label == "none":
        return "none"
    if harm >= 0.08 and scenario_label not in ("none", edge["from_agent"]):
        return "propagation"
    return "none"


def generate_dataset(samples_per_scenario: int = 120) -> tuple[list[list[float]], list[str], list[tuple[list[dict], str]]]:
    """Returns X_hop, y_hop, runs for ranker."""
    X_hop: list[list[float]] = []
    y_hop: list[str] = []
    runs: list[tuple[list[dict], str]] = []

    for factory in SCENARIOS:
        for _ in range(samples_per_scenario):
            edges, scenario_label, root = factory()
            # jitter
            for e in edges:
                e["confidence_out"] = max(0.1, min(1.0, e["confidence_out"] + random.uniform(-0.04, 0.04)))
                e["intent_delta"] = max(-0.95, min(-0.01, e["intent_delta"] + random.uniform(-0.03, 0.03)))
                e["influence_score"] = max(0.1, min(1.0, e["influence_score"] + random.uniform(-0.05, 0.05)))

            runs.append((edges, root))
            n = len(edges)
            for idx, edge in enumerate(edges):
                from features import extract_hop_features

                prev = edges[idx - 1] if idx > 0 else None
                feat = extract_hop_features(edge, idx, n, prev)
                label = hop_label(edge, scenario_label, idx, root)
                X_hop.append(feat)
                y_hop.append(label)

    return X_hop, y_hop, runs
