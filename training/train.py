#!/usr/bin/env python3
"""Train production drift classifier + root-cause ranker; export JSON bundle for @blamr/ml."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from features import AGENT_FEATURE_DIM, DRIFT_CLASSES, extract_agent_features, extract_hop_features
from synthetic import generate_dataset


def train_drift_classifier(X: np.ndarray, y: list[str]) -> dict:
    le = LabelEncoder()
    le.fit(DRIFT_CLASSES)
    y_enc = le.transform(y)

    X_train, X_test, y_train, y_test = train_test_split(X, y_enc, test_size=0.2, random_state=42, stratify=y_enc)

    clf = LogisticRegression(
        max_iter=2000,
        multi_class="multinomial",
        solver="lbfgs",
        C=1.2,
        class_weight="balanced",
    )
    clf.fit(X_train, y_train)

    acc = accuracy_score(y_test, clf.predict(X_test))
    print(f"Drift classifier accuracy: {acc:.3f}")

    classes = [str(c) for c in le.classes_]
    return {
        "classes": classes,
        "weights": clf.coef_.tolist(),
        "bias": clf.intercept_.tolist(),
        "_accuracy": acc,
    }


def softmax_vec(x: np.ndarray) -> np.ndarray:
    x = x - np.max(x)
    e = np.exp(x)
    return e / (e.sum() + 1e-12)


def train_ranker(runs: list[tuple[list[dict], str]]) -> dict:
    rng = np.random.default_rng(42)
    w = rng.normal(0, 0.15, AGENT_FEATURE_DIM)
    b = 0.0
    lr = 0.08
    epochs = 400

    for epoch in range(epochs):
        total_loss = 0.0
        for edges, root in runs:
            agents = list(dict.fromkeys(e["from_agent"] for e in edges))
            if root not in agents:
                continue
            hop_drift = {
                e["hop_index"]: min(1.0, max(0.0, -e["intent_delta"]) * 1.3 + max(0.0, e["confidence_in"] - e["confidence_out"]))
                for e in edges
            }
            feats = np.array([extract_agent_features(a, edges, hop_drift) for a in agents])
            logits = feats @ w + b
            probs = softmax_vec(logits)
            target = agents.index(root)
            total_loss -= np.log(probs[target] + 1e-12)
            grad_logits = probs.copy()
            grad_logits[target] -= 1.0
            grad_w = feats.T @ grad_logits / len(agents)
            grad_b = float(np.mean(grad_logits))
            w -= lr * grad_w
            b -= lr * grad_b
        lr *= 0.998

    # Evaluate top-1
    hits = 0
    for edges, root in runs:
        agents = list(dict.fromkeys(e["from_agent"] for e in edges))
        hop_drift = {
            e["hop_index"]: min(1.0, max(0.0, -e["intent_delta"]) * 1.3 + max(0.0, e["confidence_in"] - e["confidence_out"]))
            for e in edges
        }
        feats = np.array([extract_agent_features(a, edges, hop_drift) for a in agents])
        logits = feats @ w + b
        pred = agents[int(np.argmax(logits))]
        if pred == root:
            hits += 1
    top1 = hits / len(runs) if runs else 0.0
    print(f"Ranker top-1 root cause: {top1:.3f}")

    return {
        "weights": w.tolist(),
        "bias": float(b),
        "_top1": top1,
    }


def main() -> None:
    print("Generating synthetic training data…")
    X_hop, y_hop, runs = generate_dataset(samples_per_scenario=150)
    X = np.array(X_hop, dtype=np.float64)

    drift = train_drift_classifier(X, y_hop)
    ranker = train_ranker(runs)

    bundle = {
        "version": "1.1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "drift_classifier": {
            "classes": drift["classes"],
            "weights": drift["weights"],
            "bias": drift["bias"],
        },
        "ranker": {
            "weights": ranker["weights"],
            "bias": ranker["bias"],
        },
        "metrics": {
            "drift_accuracy": drift["_accuracy"],
            "ranker_top1": ranker["_top1"],
        },
    }

    out_dir = os.path.join(os.path.dirname(__file__), "..", "packages", "ml", "models")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "blamr-ml-bundle.json")
    with open(out_path, "w") as f:
        json.dump(bundle, f, indent=2)

    print(f"Wrote {out_path}")
    print(f"  drift accuracy: {bundle['metrics']['drift_accuracy']:.3f}")
    print(f"  ranker top-1:   {bundle['metrics']['ranker_top1']:.3f}")


if __name__ == "__main__":
    main()
