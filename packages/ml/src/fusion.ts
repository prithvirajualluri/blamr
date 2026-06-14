import type { AgentBlame, CausalEdge } from '@blamr/types';
import type { RunMlAnalysis } from './types';
import { mlFusionAlpha } from './config';

/** Fuse rule-based blame percentages with ML agent fault scores. */
export function fuseBlameScores(
  ruleBlames: AgentBlame[],
  ml: RunMlAnalysis | null,
  failed: boolean,
): { agents: AgentBlame[]; method: string } {
  if (!ml || !failed || ruleBlames.length === 0) {
    return { agents: ruleBlames, method: 'backward_bfs_shapley' };
  }

  const alpha = mlFusionAlpha();
  const agents = ruleBlames.map((b) => {
    const mlPct = (ml.agent_fault_scores[b.agent] ?? 0) * 100;
    const fused = (1 - alpha) * b.blame_pct + alpha * mlPct;
    const hop = ml.hop_analysis
      .filter((h) => h.drift_type !== 'none')
      .sort((a, b) => b.drift_score - a.drift_score)
      .find((h) => h.agent === b.agent);
    const driftLabel = hop?.drift_type ?? 'none';
    const driftNote =
      hop && hop.drift_score >= 0.35
        ? ` [ML: ${formatDriftType(driftLabel)} ${(hop.drift_score * 100).toFixed(0)}%]`
        : '';

    return {
      ...b,
      blame_pct: Math.round(fused * 10) / 10,
      ml_blame_pct: Math.round(mlPct * 10) / 10,
      drift_component: hop && hop.drift_type !== 'none' ? hop.drift_type : undefined,
      reason: b.reason + driftNote,
    };
  });

  agents.sort((a, b) => b.blame_pct - a.blame_pct);
  agents.forEach((a, i) => {
    a.is_root = i === 0;
  });

  return {
    agents,
    method: `ml_fusion_v${ml.fusion.model_version}`,
  };
}

export function attachHopAnalysisToReport(
  report: { agents: AgentBlame[]; method: string; root_cause_agent: string; root_cause_pct: number },
  ml: RunMlAnalysis | null,
  fused: AgentBlame[],
): {
  agents: AgentBlame[];
  method: string;
  root_cause_agent: string;
  root_cause_pct: number;
  hop_analysis: RunMlAnalysis['hop_analysis'];
  ml_fusion: RunMlAnalysis['fusion'] | null;
} {
  const root = fused[0];
  return {
    ...report,
    agents: fused,
    method: fused.length ? (ml ? `ml_fusion_v${ml.fusion.model_version}` : report.method) : report.method,
    root_cause_agent: root?.agent ?? report.root_cause_agent,
    root_cause_pct: root?.blame_pct ?? report.root_cause_pct,
    hop_analysis: ml?.hop_analysis ?? [],
    ml_fusion: ml?.fusion ?? null,
  };
}

function formatDriftType(t: string): string {
  return t.replace(/_/g, ' ');
}

/** Re-rank edges influence using ML drift severity (optional boost). */
export function boostInfluenceFromMl(edges: CausalEdge[], ml: RunMlAnalysis | null): void {
  if (!ml) return;
  for (const hop of ml.hop_analysis) {
    if (hop.drift_type === 'none' || hop.drift_score < 0.3) continue;
    const edge = edges.find((e) => e.hop_index === hop.hop_index);
    if (edge) {
      edge.influence_score = Math.min(1, edge.influence_score * (1 + hop.drift_score * 0.25));
    }
  }
}
