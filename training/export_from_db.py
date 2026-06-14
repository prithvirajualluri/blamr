#!/usr/bin/env python3
"""Export hop features + labels from ClickHouse and PostgreSQL for retraining."""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request

import psycopg2

from features import extract_hop_features


def ch_query(sql: str) -> list[dict]:
    url = os.environ.get("CLICKHOUSE_URL", "http://localhost:8123")
    db = os.environ.get("CLICKHOUSE_DATABASE", "blamr")
    parsed = urllib.parse.urlparse(url)
    qurl = f"{parsed.scheme}://{parsed.netloc}/?database={db}&default_format=JSONEachRow"
    req = urllib.request.Request(qurl, data=sql.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode()
    rows = []
    for line in body.strip().split("\n"):
        if line:
            rows.append(json.loads(line))
    return rows


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "postgresql://blamr:blamr_dev@localhost:5432/blamr")
    pg = psycopg2.connect(dsn)
    cur = pg.cursor()
    cur.execute(
        """
        SELECT br.run_id, br.root_cause_agent, wr.status, wr.error_summary
        FROM blame_reports br
        JOIN workflow_runs wr ON wr.id = br.run_id
        WHERE wr.status = 'failed'
        ORDER BY br.computed_at_ms DESC
        LIMIT 5000
        """
    )
    runs = cur.fetchall()
    print(f"Found {len(runs)} failed runs with blame reports")

    export: list[dict] = []
    for run_id, root, status, error in runs:
        edges = ch_query(
            f"""
            SELECT hop_index, from_agent, to_agent, confidence_in, confidence_out,
                   intent_delta, influence_score, tokens_in, tokens_out, latency_ms,
                   cost_usd, call_type, input_preview, output_preview
            FROM causal_edges
            WHERE run_id = '{run_id.replace("'", "''")}'
            ORDER BY hop_index
            """
        )
        if not edges:
            continue
        n = len(edges)
        for idx, edge in enumerate(edges):
            prev = edges[idx - 1] if idx > 0 else None
            feat = extract_hop_features(edge, idx, n, prev)
            export.append(
                {
                    "run_id": run_id,
                    "root_cause_agent": root,
                    "hop_index": edge["hop_index"],
                    "from_agent": edge["from_agent"],
                    "features": feat,
                    "is_root_hop": edge["from_agent"] == root,
                    "error_summary": error,
                }
            )

    out = os.path.join(os.path.dirname(__file__), "data", "export.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(export, f)
    print(f"Exported {len(export)} hop rows to {out}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"export failed: {e}", file=sys.stderr)
        sys.exit(1)
