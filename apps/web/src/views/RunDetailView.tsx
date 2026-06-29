import React, { useState, useEffect, useCallback } from 'react';
import { useRunDetail } from '../hooks/useRuns';
import { CausalGraph } from '../components/CausalGraph';
import { WorkflowTopology, LayoutBadge } from '../components/WorkflowTopology';
import { Badge } from '../components/ui/Badge';
import { BlamrStatusBadge, RunTraceBadge } from '../components/BlamrStatusBadge';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { accCol, fC, fM, fT, sumHopCosts } from '../utils/format';
import { explainConfidenceChange, explainIntentPreserved, contextForHop, resolveDisplayDrift } from '../utils/signal-explain';
import { ExplainText } from '../components/ExplainText';
import { HopReplayPanel } from '../components/HopReplayPanel';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { computeBlamrStatus } from '../utils/blamr-status';
import { IconChart, IconDollar, IconClock, IconTok } from '../components/icons';
import type { TraceHop } from '@blamr/types';
import { blameRoleLabel, failureModeLabel } from '@blamr/types';
import type { RunDetail } from '../types';

interface RunDetailViewProps {
  runId: string;
  tab?: DetailTab;
  onTabChange?: (tab: DetailTab) => void;
  run?: RunDetail | null;
  loading?: boolean;
  error?: string | null;
}

export type DetailTab = 'graph' | 'trace' | 'cost' | 'blame' | 'timeline';

const ALL_TABS: DetailTab[] = ['graph', 'trace', 'cost', 'blame', 'timeline'];

export function RunDetailView({ runId, tab: controlledTab, onTabChange, run: runProp, loading: loadingProp, error: errorProp }: RunDetailViewProps) {
  const internal = useRunDetail(runProp === undefined ? runId : null);
  const run = runProp !== undefined ? runProp : internal.run;
  const loading = loadingProp ?? internal.loading;
  const error = errorProp ?? (runProp !== undefined ? null : internal.error);
  const [internalTab, setInternalTab] = useState<DetailTab>('graph');
  const tab = controlledTab ?? internalTab;

  const setTab = useCallback((t: DetailTab) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  }, [onTabChange]);

  useEffect(() => {
    setInternalTab('graph');
  }, [runId]);

  if (loading && !run) {
    return <div className="page-enter" style={{ color: 'var(--muL)', padding: 24 }}>Loading run…</div>;
  }

  if (error || !run) {
    return (
      <div className="page-enter">
        <ApiBanner error={error ?? 'Run not found'} />
        <EmptyState title="Run unavailable" subtitle="The run may not exist or the API key may lack access." />
      </div>
    );
  }

  const root = run.blame.find((b) => b.root) ?? run.blame[0];
  const topInfluence = run.status === 'success' && run.blame.length
    ? [...run.blame].sort((a, b) => b.pct - a.pct)[0]
    : null;
  const li = run.intent_trace[run.intent_trace.length - 1]?.pct ?? 0;
  const hasInfl = run.confidence_trace.some((c) => c.inflated);
  const accV = run.accuracy;
  const tracedAgents = new Set(run.trace_hops.map((h) => h.agent));
  const workflowBlamrStatus = computeBlamrStatus(run.started_at);
  const isComplete = run.status === 'success' || run.status === 'failed';

  const availTabs = ALL_TABS.filter((t) => t !== 'blame' || isComplete);

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 13 }}>
        <Badge variant={run.status === 'failed' ? 'red' : 'grn'}>{run.status === 'failed' ? 'Failed' : run.status === 'running' ? 'Running' : 'Success'}</Badge>
        <Badge variant="mu">{run.complexity}</Badge>
        <LayoutBadge layout={run.layout} />
        <span className="bdg" style={{ background: 'var(--bg3)', border: `1px solid ${accV >= 0.75 ? 'rgba(5,150,105,.3)' : accV >= 0.6 ? 'rgba(215,119,6,.3)' : 'rgba(220,38,38,.3)'}`, color: accCol(accV) }}>
          accuracy: {Math.round(accV * 100)}%
        </span>
        {hasInfl && <Badge variant="amb">Confidence inflation</Badge>}
      </div>

      {run.status === 'success' ? (
        <div className="success-hero">
          <div className="success-hero-icon">✅</div>
          <div>
            <div className="success-hero-title">Workflow completed successfully</div>
            <div className="success-hero-sub">All {run.agents.length} agents executed · {li}% intent preserved · {fC(run.total_cost_usd)} cost</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <div className="wf-chip">{run.workflow_id}</div>
              <BlamrStatusBadge status={workflowBlamrStatus} compact />
            </div>
          </div>
        </div>
      ) : (
        <div className="wf-chip" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {run.workflow_id}
          <BlamrStatusBadge status={workflowBlamrStatus} compact />
        </div>
      )}

      {run.ml_fusion && (
        <div style={{ fontSize: 11, color: 'var(--muL)', marginBottom: 10 }}>
          ML fusion v{run.ml_fusion.model_version} · rules {(run.ml_fusion.rule_weight * 100).toFixed(0)}% · ML {(run.ml_fusion.ml_weight * 100).toFixed(0)}%
        </div>
      )}

      {run.error && <div className="err-box"><strong>Failure: </strong>{run.error}</div>}

      {run.confidence_gate && (
        <div
          className="panel"
          style={{
            marginBottom: 12,
            borderColor: run.confidence_gate.passed ? 'rgba(5,150,105,.35)' : 'rgba(220,38,38,.35)',
            background: run.confidence_gate.passed ? 'rgba(5,150,105,.06)' : 'rgba(220,38,38,.06)',
          }}
        >
          <div className="panel-hdr" style={{ marginBottom: 6 }}>
            Confidence accept gate · {run.confidence_gate.passed ? 'Pass' : 'Fail'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muL)', lineHeight: 1.65 }}>
            Threshold <strong style={{ color: 'var(--wh)' }}>{Math.round(run.confidence_gate.accept_level * 100)}%</strong>
            {' '}({run.confidence_gate.mode === 'min' ? 'weakest hop' : 'final hop'}) · measured{' '}
            <strong style={{ color: 'var(--wh)' }}>{Math.round(run.confidence_gate.measured_confidence * 100)}%</strong>
            {run.confidence_gate.failing_hop && !run.confidence_gate.passed && (
              <> · failing hop: <span className="mono">{run.confidence_gate.failing_hop.agent}</span></>
            )}
            <div style={{ marginTop: 6, fontSize: 11.5 }}>{run.confidence_gate.reason}</div>
          </div>
        </div>
      )}

      {run.agents.length > 0 && (
        <WorkflowTopology run={run} variant="full" />
      )}

      {run.agents.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-hdr">Agents · blamr tracing</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {run.agents.map((agent) => (
              <div key={agent} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--b0)' }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--wh)' }}>{agent}</span>
                <RunTraceBadge tracing={tracedAgents.has(agent)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-row">
        <div className={`stat-card${run.status === 'failed' && root ? ' root-cause' : ''}${run.status === 'success' && topInfluence ? ' top-influence' : ''}`}>
          <div className="stat-lbl">{run.status === 'success' ? 'Top influence' : 'Root cause'}</div>
          {run.status === 'failed' && root ? (
            <>
              <div className="stat-val c-red" style={{ fontSize: 13 }}>{root.agent}</div>
              <div className="stat-sub">{root.pct}% blame</div>
              {root.reason && <div className="stat-reason">{root.reason}</div>}
            </>
          ) : run.status === 'success' && topInfluence ? (
            <>
              <div className="stat-val c-grn" style={{ fontSize: 13 }}>{topInfluence.agent}</div>
              <div className="stat-sub">{topInfluence.pct}% contribution</div>
              {topInfluence.reason && <div className="stat-reason stat-reason-success">{topInfluence.reason}</div>}
            </>
          ) : (
            <><div className="stat-val c-grn" style={{ fontSize: 13 }}>None</div><div className="stat-sub">all agents healthy</div></>
          )}
        </div>
        <div className="stat-card"><div className="stat-lbl">Accuracy</div><div className="stat-val" style={{ color: accCol(accV) }}>{Math.round(accV * 100)}%</div></div>
        <div className="stat-card"><div className="stat-lbl">Cost</div><div className="stat-val c-amb">{fC(run.total_cost_usd)}</div></div>
        <div className="stat-card"><div className="stat-lbl">Latency</div><div className="stat-val c-vi">{fM(run.total_ms)}</div></div>
      </div>

      <div className="tabs">
        {availTabs.map((t) => (
          <button key={t} type="button" className={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {t === 'graph' && <><IconChart /> Graph</>}
            {t === 'trace' && <>⏱ Trace</>}
            {t === 'cost' && <><IconDollar /> Cost</>}
            {t === 'blame' && <>{run.status === 'failed' ? 'Blame' : 'Attribution'}</>}
            {t === 'timeline' && <><IconChart /> Timeline</>}
          </button>
        ))}
      </div>

      {tab === 'graph' && <CausalGraph run={run} />}
      {tab === 'trace' && <TraceTab run={run} />}
      {tab === 'cost' && <CostTab run={run} />}
      {tab === 'blame' && <AttributionTab run={run} />}
      {tab === 'timeline' && <TimelineTab run={run} />}
    </div>
  );
}

export function nextDetailTab(run: RunDetail, current: DetailTab, dir: 1 | -1): DetailTab {
  const isComplete = run.status === 'success' || run.status === 'failed';
  const avail = ALL_TABS.filter((t) => t !== 'blame' || isComplete);
  const i = avail.indexOf(current);
  return avail[(i + dir + avail.length) % avail.length];
}

function TraceTab({ run }: { run: RunDetail }) {
  const hops = run.trace_hops;
  const maxMs = Math.max(...hops.map((h) => h.ms), 1);
  const rootA = run.blame.find((b) => b.root)?.agent;
  const hopCostSum = sumHopCosts(hops);

  if (!hops.length) {
    return <EmptyState title="No trace hops" subtitle="Edge data has not been ingested for this run yet." />;
  }

  return (
    <>
      <div className="panel">
        <div className="panel-hdr">
          <IconChart /> Execution trace
          <LayoutBadge layout={run.layout} />
          <span className="panel-sub">{hops.length} hops · {fM(run.total_ms)} wall · {fC(hopCostSum)} LLM cost · click a hop to expand</span>
        </div>
        {hops.map((hop) => (
          <TraceHopCard
            key={`${hop.hop_index}-${hop.agent}`}
            runId={run.id}
            runComplete={run.status !== 'running'}
            hop={hop}
            allHops={hops}
            workflowId={run.workflow_id}
            domainType={run.workflow_profile?.domain_type}
            maxMs={maxMs}
            isRoot={run.status === 'failed' && hop.agent === rootA}
          />
        ))}
      </div>
    </>
  );
}

function roleTagClass(role?: string): string {
  switch (role) {
    case 'originator': return 'blame-role-tag originator';
    case 'manifestor': return 'blame-role-tag manifestor';
    case 'propagator': return 'blame-role-tag propagator';
    default: return 'blame-role-tag clean';
  }
}

function driftLabel(type?: string): string {
  if (!type || type === 'none') return '';
  return type.replace(/_/g, ' ');
}

function driftBadgeVariant(type?: string): 'red' | 'amb' | 'mu' {
  if (!type || type === 'none') return 'mu';
  if (type === 'domain_mismatch' || type === 'retrieval_miss' || type === 'severity_underrate') return 'red';
  return 'amb';
}

function TraceHopCard({
  runId,
  runComplete,
  hop,
  allHops,
  workflowId,
  domainType,
  maxMs,
  isRoot,
}: {
  runId: string;
  runComplete: boolean;
  hop: TraceHop;
  allHops: TraceHop[];
  workflowId?: string;
  domainType?: import('@blamr/types').WorkflowDomainType;
  maxMs: number;
  isRoot: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bc = isRoot ? '#DC2626' : '#0891B2';
  const hopCtx = contextForHop(allHops, hop, workflowId, domainType);
  const mlHint =
    hop.drift_type && hop.drift_type !== 'none'
      ? { drift_type: hop.drift_type, drift_score: hop.drift_score ?? 0 }
      : undefined;
  const displayDrift = resolveDisplayDrift(hop, hopCtx, mlHint);
  const confExplain = explainConfidenceChange(hop, mlHint, hopCtx);
  const intentExplain = explainIntentPreserved(hop, mlHint, hopCtx);
  const reconciledHop = hopCtx.allHops?.find((h) => h.hop_index === hop.hop_index) ?? hop;
  const hasDetail =
    confExplain.factors.length > 0
    || confExplain.summary
    || intentExplain.factors.length > 0
    || hop.input_preview
    || hop.output_preview;

  return (
    <div className={`trace-hop-card${open ? ' open' : ''}`}>
      <button
        type="button"
        className="trace-hop-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="trace-hop-hdr">
          <div className="trace-dot" style={{ background: isRoot ? 'var(--re)' : 'var(--cy)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="trace-agent">{hop.agent}</span>
              <span className="trace-type">{hop.type}</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--mu)' }}>hop {hop.hop_index}</span>
              {displayDrift && (
                <Badge variant={driftBadgeVariant(displayDrift)}>
                  {driftLabel(displayDrift)}
                  {hop.drift_score != null ? ` ${Math.round(hop.drift_score * 100)}%` : ''}
                </Badge>
              )}
              <RunTraceBadge tracing />
            </div>
            <div className="trace-meta" style={{ marginTop: 4 }}>
              <span>→ {hop.to_agent}</span>
              <span><IconClock />{fM(hop.ms)}</span>
              <span>conf {reconciledHop.confidence_in.toFixed(2)} → {hop.confidence_out.toFixed(2)}</span>
              <span>intent preserved {intentExplain.pct}%</span>
            </div>
            {!open && (
              <div className="trace-meta trace-meta-compact" style={{ marginTop: 2 }}>
                <span><IconTok />{fT(hop.tokens_in)} in / {fT(hop.tokens_out)} out</span>
                <span><IconDollar />{fC(hop.cost)}</span>
                {hasDetail && <span className="trace-expand-hint">Click to expand</span>}
              </div>
            )}
          </div>
          <span className="trace-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
        </div>
      </button>

      {open && (
        <div className="trace-hop-body">
          <div className="trace-meta" style={{ marginTop: 4, paddingLeft: 18 }}>
            <span><IconTok />{fT(hop.tokens_in)} in / {fT(hop.tokens_out)} out</span>
            <span><IconDollar />{fC(hop.cost)}</span>
            <span className="mono">{hop.model}</span>
          </div>
          <div className="trace-meta" style={{ marginTop: 2, paddingLeft: 18 }}>
            <span>influence {hop.influence_score.toFixed(2)}</span>
            <span>intent Δ {hop.intent_delta.toFixed(2)}</span>
          </div>
          {(confExplain.factors.length > 0 || confExplain.summary) && (
            <div className="trace-justify" style={{ marginTop: 6 }}>
              <CollapsibleSection title="Why confidence changed">
                <div><ExplainText text={confExplain.summary} /></div>
                {confExplain.factors.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {confExplain.factors.map((f) => (
                      <li key={f}><ExplainText text={f} /></li>
                    ))}
                  </ul>
                )}
              </CollapsibleSection>
              <CollapsibleSection
                title={`Why intent is ${intentExplain.pct}%`}
                className="trace-justify-nested"
              >
                <div><ExplainText text={intentExplain.summary} /></div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {intentExplain.factors.map((f) => (
                    <li key={f}><ExplainText text={f} /></li>
                  ))}
                </ul>
              </CollapsibleSection>
            </div>
          )}
          <div className="trace-bar-wrap" style={{ marginTop: 8, paddingLeft: 18 }}>
            <div className="trace-bar-bg"><div className="trace-bar-fill" style={{ width: `${Math.round((hop.ms / maxMs) * 100)}%`, background: bc }} /></div>
            <span className="trace-dur">{fM(hop.ms)}</span>
          </div>
          {(hop.input_preview || hop.output_preview) ? (
            <div className="trace-io-grid">
              {hop.input_preview && (
                <div className="trace-io-block">
                  <div className="trace-io-lbl">Input</div>
                  <pre className="trace-io-pre">{hop.input_preview}</pre>
                </div>
              )}
              {hop.output_preview && (
                <div className="trace-io-block">
                  <div className="trace-io-lbl">Output</div>
                  <pre className="trace-io-pre">{hop.output_preview}</pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 8, paddingLeft: 18 }}>
              No input/output captured for this hop. Re-run with an updated SDK agent to record I/O previews.
            </div>
          )}
          {runComplete && (
            <div style={{ paddingLeft: 18, marginTop: 10 }}>
              <HopReplayPanel runId={runId} hop={hop} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CostTab({ run }: { run: RunDetail }) {
  const hops = run.trace_hops;
  const hopSum = sumHopCosts(hops);
  const maxC = Math.max(...hops.map((h) => h.cost), 0.0000001);

  if (!hops.length) {
    return <EmptyState title="No cost data" subtitle="Token and cost metrics appear once edges are ingested." />;
  }

  const costMatch = Math.abs(hopSum - run.total_cost_usd) < 0.0001;

  return (
    <div className="panel">
      <div className="panel-hdr">
        <IconDollar /> Cost by hop
        <span className="panel-sub">sum of edge cost_usd fields</span>
      </div>
      {[...hops].sort((a, b) => b.cost - a.cost).map((hop) => (
        <div key={`${hop.hop_index}-${hop.agent}`} className="cost-row">
          <span className="cost-name">{hop.agent} <span style={{ color: 'var(--mu)', fontWeight: 400 }}>(hop {hop.hop_index})</span></span>
          <div className="cost-track"><div className="cost-fill" style={{ width: `${Math.round((hop.cost / maxC) * 100)}%`, background: hop.cost > 0 ? '#D97706' : 'var(--b1)' }} /></div>
          <span className="cost-val c-amb">{fC(hop.cost)}</span>
        </div>
      ))}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--b0)', fontSize: 12, color: 'var(--muL)', lineHeight: 1.7 }}>
        <div><strong style={{ color: 'var(--wh)' }}>Hop total:</strong> {fC(hopSum)}</div>
        <div><strong style={{ color: 'var(--wh)' }}>Run total:</strong> {fC(run.total_cost_usd)} {costMatch ? '✓' : '(may differ on older runs)'}</div>
        <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 6 }}>
          LLM hops use provider token pricing at ingest time. Tool hops are $0. Token counts include prompt + completion tokens per hop.
        </div>
      </div>
    </div>
  );
}

function AttributionTab({ run }: { run: RunDetail }) {
  const failed = run.status === 'failed';
  if (!run.blame.length) {
    return (
      <EmptyState
        title={failed ? 'No blame report' : 'No attribution report'}
        subtitle="Computed after run completion."
      />
    );
  }

  const sorted = [...run.blame].sort((a, b) => b.pct - a.pct);
  const mx = Math.max(...sorted.map((b) => b.pct), 1);
  const leadAgent = !failed ? sorted[0]?.agent : null;
  const contributing = sorted.filter((b) => b.pct > 0);
  const minimal = sorted.filter((b) => b.pct === 0);

  return (
    <div className="panel">
      <div className="panel-hdr">
        {failed ? 'Causal blame' : 'Causal attribution'}
        {!failed && (
          <span className="panel-sub">influence distribution — not fault assignment</span>
        )}
        {failed && run.blame_confidence && (
          <span className={`blame-confidence-tag ${run.blame_confidence}`}>
            {run.blame_confidence} confidence
          </span>
        )}
        {run.ml_fusion && (
          <span className="panel-sub">ml_fusion v{run.ml_fusion.model_version}</span>
        )}
      </div>
      {failed && run.propagation_chain && run.propagation_chain.length > 0 && (
        <div className="blame-propagation-chain">
          {run.propagation_chain.map((step, i) => (
            <div key={i} className="blame-chain-step">{step}</div>
          ))}
        </div>
      )}
      {contributing.map((b) => {
        const isRoot = failed && b.root;
        const isLead = !failed && b.agent === leadAgent;
        const barColor = isRoot ? '#DC2626' : isLead ? '#0891B2' : failed ? '#D97706' : '#059669';
        return (
          <div key={b.agent} className={`blame-item${isRoot ? ' root' : ''}${isLead ? ' lead' : ''}`}>
            <div className="blame-row">
              <span className="blame-agent">{b.agent}</span>
              {isRoot && <span className="blame-root-tag">root</span>}
              {isLead && <span className="blame-lead-tag">lead</span>}
              {b.role && b.role !== 'clean' && (
                <span className={roleTagClass(b.role)}>{blameRoleLabel(b.role)}</span>
              )}
              {b.failure_mode && (
                <span className="blame-failure-tag" title={b.failure_mode}>
                  {failureModeLabel(b.failure_mode)}
                </span>
              )}
              {b.drift_component && b.drift_component !== 'none' && (
                <span className="blame-drift-tag">{driftLabel(b.drift_component)}</span>
              )}
              <div className="blame-track">
                <div className="blame-fill" style={{ width: `${(b.pct / mx) * 100}%`, background: barColor }} />
              </div>
              <span className="blame-pct">{b.pct}%</span>
              {b.ml_pct != null && run.ml_fusion && (
                <span className="mono" style={{ fontSize: 10, color: 'var(--mu)', minWidth: 52 }}>
                  ml {b.ml_pct}%
                </span>
              )}
            </div>
            {b.reason && <div className="blame-reason">{b.reason}</div>}
          </div>
        );
      })}
      {minimal.length > 0 && (
        <div className="blame-minimal">
          {minimal.map((b) => b.agent).join(', ')} — {failed ? 'minimal causal contribution' : 'minimal influence'}
        </div>
      )}
    </div>
  );
}

function TimelineTab({ run }: { run: RunDetail }) {
  if (!run.confidence_trace.length && !run.intent_trace.length) {
    return <EmptyState title="No timeline data" subtitle="Confidence and intent traces are derived from ingested edges." />;
  }
  return (
    <>
      {run.confidence_trace.length > 0 && (
        <div className="panel">
          <div className="panel-hdr">Confidence per hop</div>
          {run.confidence_trace.map((c) => (
            <div key={c.agent} className="hop">
              <span className="hop-name">{c.agent}</span>
              <div className="hop-track">
                <div className="conf-bg" style={{ width: `${c.ci * 100}%`, background: c.inflated ? '#DC2626' : '#B5D4F4' }} />
                <div className="conf-fg" style={{ width: `${c.co * 100}%`, background: c.inflated ? '#DC2626' : '#378ADD' }} />
              </div>
              <span className="hop-val">{c.ci.toFixed(2)} → {c.co.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {run.intent_trace.length > 0 && (
        <div className="panel">
          <div className="panel-hdr">Intent preservation</div>
          {run.intent_trace.map((h) => (
            <div key={h.agent} className="hop">
              <span className="hop-name">{h.agent}</span>
              <div className="hop-track"><div className="hop-fill" style={{ width: `${h.pct}%`, background: h.pct < 50 ? '#DC2626' : h.pct < 75 ? '#D97706' : '#059669' }} /></div>
              <span className="hop-val">{h.pct}%</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
