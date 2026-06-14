export function isMlEnabled(): boolean {
  const flag = process.env.BLAMR_ML_ENABLED?.trim().toLowerCase();
  if (flag === '0' || flag === 'false') return false;
  if (flag === '1' || flag === 'true') return true;
  return true;
}

/** Weight on ML ranker vs rule-based blame (0 = rules only, 1 = ML only). */
export function mlFusionAlpha(): number {
  const raw = process.env.BLAMR_ML_FUSION_ALPHA?.trim();
  const parsed = raw ? parseFloat(raw) : 0.55;
  if (!Number.isFinite(parsed)) return 0.55;
  return Math.max(0, Math.min(1, parsed));
}

export function mlMinDriftConfidence(): number {
  const raw = process.env.BLAMR_ML_MIN_DRIFT_CONF?.trim();
  const parsed = raw ? parseFloat(raw) : 0.42;
  return Number.isFinite(parsed) ? parsed : 0.42;
}
