import React, { useState } from 'react';
import { apiFetch } from '../api/client';
import type { HopLlmReplayResult, TraceHop } from '@blamr/types';

interface ReplayBlameResult {
  hop_index: number;
  patched_fields: Record<string, unknown>;
  original: { root_cause_agent: string; root_cause_pct: number; agents: Array<{ agent: string; blame_pct: number }> };
  counterfactual: { root_cause_agent: string; root_cause_pct: number; agents: Array<{ agent: string; blame_pct: number }> };
  diff: Array<{ agent: string; before_pct: number; after_pct: number; delta: number }>;
}

interface HopReplayPanelProps {
  runId: string;
  hop: TraceHop;
}

type ReplayTab = 'counterfactual' | 'llm';

const LLM_TYPES = new Set(['LLM call', 'Vision call']);

function statusClass(status: string): string {
  if (status === 'improved') return 'c-grn';
  if (status === 'degraded' || status === 'error') return 'c-red';
  if (status === 'same') return 'c-mu';
  return 'c-amb';
}

function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.0001) return `$${n.toExponential(2)}`;
  return `$${n.toFixed(4)}`;
}

export function HopReplayPanel({ runId, hop }: HopReplayPanelProps) {
  const [tab, setTab] = useState<ReplayTab>('counterfactual');
  const canLlmReplay = LLM_TYPES.has(hop.type) && Boolean(hop.model?.trim() && hop.model !== 'unknown');

  const [output, setOutput] = useState(hop.output_preview ?? '');
  const [cfLoading, setCfLoading] = useState(false);
  const [cfResult, setCfResult] = useState<ReplayBlameResult | null>(null);
  const [cfError, setCfError] = useState<string | null>(null);

  const [input, setInput] = useState(hop.input_preview ?? '');
  const [note, setNote] = useState('');
  const [includeBlame, setIncludeBlame] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmResult, setLlmResult] = useState<HopLlmReplayResult | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  async function simulate() {
    setCfLoading(true);
    setCfError(null);
    try {
      const data = await apiFetch<ReplayBlameResult>(`/v1/runs/${encodeURIComponent(runId)}/replay-blame`, {
        method: 'POST',
        body: JSON.stringify({
          hop_index: hop.hop_index,
          output_preview: output,
        }),
      });
      setCfResult(data);
    } catch (e) {
      setCfError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setCfLoading(false);
    }
  }

  async function replayLlm() {
    setLlmLoading(true);
    setLlmError(null);
    try {
      const data = await apiFetch<HopLlmReplayResult>(
        `/v1/runs/${encodeURIComponent(runId)}/hops/${hop.hop_index}/replay`,
        {
          method: 'POST',
          body: JSON.stringify({
            input,
            note: note.trim() || undefined,
            include_blame: includeBlame,
          }),
        },
      );
      setLlmResult(data);
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : 'LLM replay failed');
    } finally {
      setLlmLoading(false);
    }
  }

  return (
    <div className="hop-replay-panel">
      <div className="hop-replay-tabs">
        <button
          type="button"
          className={`hop-replay-tab${tab === 'counterfactual' ? ' active' : ''}`}
          onClick={() => setTab('counterfactual')}
        >
          Counterfactual blame
        </button>
        {canLlmReplay && (
          <button
            type="button"
            className={`hop-replay-tab${tab === 'llm' ? ' active' : ''}`}
            onClick={() => setTab('llm')}
          >
            LLM replay
          </button>
        )}
      </div>

      {tab === 'counterfactual' && (
        <>
          <div className="hop-replay-lbl">Edit output preview — no LLM call, instant blame shift</div>
          <textarea
            className="hop-replay-input"
            rows={3}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="Edit output preview to simulate a different hop result…"
          />
          <button type="button" className="btn btn-sm" disabled={cfLoading} onClick={() => void simulate()}>
            {cfLoading ? 'Simulating…' : 'Simulate blame shift'}
          </button>
          {cfError && <div className="hop-replay-error">{cfError}</div>}
          {cfResult && (
            <div className="hop-replay-result">
              <div className="hop-replay-row">
                <span>Root cause before</span>
                <strong>{cfResult.original.root_cause_agent} ({cfResult.original.root_cause_pct}%)</strong>
              </div>
              <div className="hop-replay-row">
                <span>Root cause after</span>
                <strong>{cfResult.counterfactual.root_cause_agent} ({cfResult.counterfactual.root_cause_pct}%)</strong>
              </div>
              {cfResult.diff.length > 0 && (
                <div className="hop-replay-diff">
                  {cfResult.diff.slice(0, 5).map((d) => (
                    <div key={d.agent} className="hop-replay-diff-row">
                      <span className="mono">{d.agent}</span>
                      <span>{d.before_pct}% → {d.after_pct}%</span>
                      <span className={d.delta > 0 ? 'c-red' : 'c-grn'}>
                        {d.delta > 0 ? '+' : ''}{d.delta}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'llm' && canLlmReplay && (
        <>
          <div className="hop-replay-lbl">
            Re-run this hop with edited input — real LLM call ({hop.model}). Uses API credits.
          </div>
          <textarea
            className="hop-replay-input"
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Edit the prompt / input sent to the model…"
          />
          <input
            className="hop-replay-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. fixed policy wording)"
          />
          <label className="hop-replay-check">
            <input type="checkbox" checked={includeBlame} onChange={(e) => setIncludeBlame(e.target.checked)} />
            Include blame shift with new output
          </label>
          <button type="button" className="btn btn-sm" disabled={llmLoading || !input.trim()} onClick={() => void replayLlm()}>
            {llmLoading ? 'Calling LLM…' : 'Replay with LLM'}
          </button>
          {llmError && <div className="hop-replay-error">{llmError}</div>}
          {llmResult && (
            <div className="hop-replay-result">
              <div className="hop-replay-row">
                <span>Status</span>
                <strong className={statusClass(llmResult.status)}>{llmResult.status}</strong>
              </div>
              <div className="hop-replay-row">
                <span>Provider</span>
                <strong>{llmResult.provider} · {llmResult.model}</strong>
              </div>
              <div className="hop-replay-metrics">
                <div>
                  <span>Latency</span>
                  <strong>{llmResult.original_latency_ms}ms → {llmResult.new_latency_ms}ms</strong>
                </div>
                <div>
                  <span>Tokens</span>
                  <strong>
                    {llmResult.original_tokens_in}+{llmResult.original_tokens_out} →{' '}
                    {llmResult.new_tokens_in}+{llmResult.new_tokens_out}
                  </strong>
                </div>
                <div>
                  <span>Cost</span>
                  <strong>{fmtUsd(llmResult.original_cost_usd)} → {fmtUsd(llmResult.new_cost_usd)}</strong>
                </div>
              </div>
              {llmResult.error && (
                <div className="hop-replay-error">{llmResult.error.message}</div>
              )}
              <div className="hop-replay-io-grid">
                <div className="hop-replay-io-block">
                  <div className="hop-replay-io-lbl">Original output</div>
                  <pre className="hop-replay-io-pre">{llmResult.original_output ?? '(empty)'}</pre>
                </div>
                <div className="hop-replay-io-block">
                  <div className="hop-replay-io-lbl">New output</div>
                  <pre className="hop-replay-io-pre">{llmResult.new_output ?? '(empty)'}</pre>
                </div>
              </div>
              {llmResult.output_diff.length > 0 && (
                <div className="hop-replay-text-diff">
                  <div className="hop-replay-io-lbl">Diff</div>
                  <pre className="hop-replay-diff-pre">{llmResult.output_diff.join('\n')}</pre>
                </div>
              )}
              {llmResult.blame && (
                <div className="hop-replay-diff">
                  <div className="hop-replay-io-lbl">Blame shift</div>
                  <div className="hop-replay-row">
                    <span>Root cause before</span>
                    <strong>{llmResult.blame.original.root_cause_agent} ({llmResult.blame.original.root_cause_pct}%)</strong>
                  </div>
                  <div className="hop-replay-row">
                    <span>Root cause after</span>
                    <strong>{llmResult.blame.counterfactual.root_cause_agent} ({llmResult.blame.counterfactual.root_cause_pct}%)</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
