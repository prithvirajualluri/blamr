# blamr ML training

Production drift classifier + root-cause ranker for `@blamr/ml`.

## Train (synthetic + scenarios)

```bash
pip install -r requirements.txt
python3 train.py
```

Writes `packages/ml/models/blamr-ml-bundle.json` (bundled with workers).

## Retrain on production runs

Requires Postgres + ClickHouse with failed runs and blame reports:

```bash
export DATABASE_URL=postgresql://blamr:blamr_dev@localhost:5432/blamr
export CLICKHOUSE_URL=http://localhost:8123
python3 export_from_db.py   # training/data/export.json
# Extend train.py to merge export.json for fine-tuning
```

## Models

| Model | Type | Input | Output |
|-------|------|-------|--------|
| Drift classifier | Multinomial logistic regression | 24-dim hop features | 7 drift classes + severity |
| Root-cause ranker | Softmax linear ranker | 8-dim agent features | Per-agent fault probability |

## Metrics (last train)

Check `metrics` in `blamr-ml-bundle.json` after `train.py`.
