import type { WorkspaceSettings } from './models';
import { DEFAULT_WORKSPACE_SETTINGS } from './models';

export function resolveIntentDriftThreshold(settings?: Partial<WorkspaceSettings> | null): number {
  const t = settings?.intent_drift_threshold;
  if (typeof t === 'number' && t > 0 && t <= 1) return t;
  return DEFAULT_WORKSPACE_SETTINGS.intent_drift_threshold;
}

export function resolveConfidenceInflationThreshold(settings?: Partial<WorkspaceSettings> | null): number {
  const t = settings?.confidence_inflation_threshold;
  if (typeof t === 'number' && t > 0 && t <= 1) return t;
  return DEFAULT_WORKSPACE_SETTINGS.confidence_inflation_threshold;
}
