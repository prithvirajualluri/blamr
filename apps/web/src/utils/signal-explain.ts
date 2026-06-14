import type { TraceHop, WorkflowDomainType } from '@blamr/types';
import { hasParseableJsonPreview, categoriesAligned, resolveDomainType } from '@blamr/types';

const INFLATION_THRESHOLD = 0.15;
const HEDGE_RE =
  /\b(might|possibly|uncertain|maybe|perhaps|don't know|don't have access|do not have access|cannot verify|not sure|limited evidence|insufficient)\b/i;

export interface HopMlHint {
  drift_type: string;
  drift_score: number;
}

export interface HopExplainContext {
  priorHop?: TraceHop;
  runGoal?: string;
  allHops?: TraceHop[];
  workflowId?: string;
  domainType?: WorkflowDomainType;
  isSuccess?: boolean;
  contributionPct?: number;
}

function isIncidentContext(ctx: Pick<HopExplainContext, 'workflowId' | 'domainType'>): boolean {
  return resolveDomainType(ctx.workflowId ?? '', ctx.domainType ? { domain_type: ctx.domainType } : undefined) === 'incident';
}

export interface SignalExplanation {
  confidenceSummary: string;
  confidenceFactors: string[];
  intentPct: number;
  intentSummary: string;
  intentFactors: string[];
  contributionNote?: string;
}

function pctScore(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function humanAgent(id: string): string {
  return id.replace(/_/g, ' ');
}

function tryParseHopJson(preview?: string): Record<string, unknown> | null {
  if (!preview) return null;
  try {
    const match = preview.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fieldFromJson(json: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!json) return undefined;
  for (const key of keys) {
    const v = json[key];
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function quoteSnippet(text?: string, max = 70): string | null {
  if (!text) return null;
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  if (line.length <= max) return `"${line}"`;
  return `"${line.slice(0, max)}…"`;
}

function effectiveConfidenceIn(hop: TraceHop, ctx: HopExplainContext): number {
  if (ctx.priorHop) return ctx.priorHop.confidence_out;
  return hop.confidence_in;
}

/** Drift label safe for UI — suppress format_error when JSON parses. */
export function resolveDisplayDrift(
  hop: TraceHop,
  ctx: Pick<HopExplainContext, 'priorHop' | 'workflowId'>,
  ml?: HopMlHint,
): string | undefined {
  return displayDriftType(hop, ctx as HopExplainContext, ml);
}

function displayDriftType(hop: TraceHop, ctx: HopExplainContext, ml?: HopMlHint): string | undefined {
  const raw = ml?.drift_type ?? hop.drift_type;
  if (!raw || raw === 'none') return undefined;
  if (raw === 'format_error' && hasParseableJsonPreview(hop.output_preview)) return undefined;
  if (!isIncidentContext(ctx) && raw === 'severity_underrate') {
    return outputHasHedging(hop.output_preview) ? 'retrieval_miss' : 'propagation';
  }
  if (
    raw === 'domain_mismatch' &&
    (hop.type === 'Tool call' || hop.type === 'MCP call') &&
    categoriesAligned(hop.input_preview, ctx.priorHop?.output_preview)
  ) {
    return 'retrieval_miss';
  }
  return raw;
}

function outputHasHedging(text?: string): boolean {
  return Boolean(text && HEDGE_RE.test(text));
}

function hedgePhrase(text?: string): string | null {
  if (!text) return null;
  const m = text.match(HEDGE_RE);
  return m ? m[0].toLowerCase() : null;
}

function driftInPlainEnglish(type: string): string {
  const map: Record<string, string> = {
    none: 'no major mismatch detected',
    domain_mismatch: 'the answer seems to be about the wrong topic',
    retrieval_miss: 'the lookup returned general data, not the specific answer requested',
    severity_underrate: 'the incident was rated less serious than it should be',
    severity_overrate: 'the incident was rated more serious than it should be',
    format_error: 'the output was not in the expected format',
    confidence_inflation: 'the model sounded more sure than the evidence supports',
    propagation: 'uncertainty carried forward from an earlier hop',
    goal_drift: 'the output drifted away from the original request',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

function driftJustification(
  type: string,
  hop: TraceHop,
  prior: TraceHop | undefined,
  runGoal: string | undefined,
  ctx: Pick<HopExplainContext, 'workflowId' | 'domainType'>,
): string {
  const priorJson = tryParseHopJson(prior?.output_preview);
  const hopJson = tryParseHopJson(hop.output_preview);
  const category = fieldFromJson(priorJson, 'category', 'intent', 'domain');
  const severity = fieldFromJson(hopJson, 'severity');
  const goal = quoteSnippet(runGoal, 55);
  const incident = isIncidentContext(ctx);

  switch (type) {
    case 'severity_underrate':
      if (!incident) {
        if (outputHasHedging(hop.output_preview)) {
          return `**${humanAgent(hop.agent)}** gave a cautious or partial answer (e.g. could not access personal data) rather than fully answering ${goal ?? 'the request'}.`;
        }
        return `**${humanAgent(hop.agent)}** only partially answered ${goal ?? 'the original request'}.`;
      }
      return category && severity
        ? `The alert was treated as **${category}**, but **${humanAgent(hop.agent)}** rated it **${severity}** — lower than expected for that category, which pulled confidence down.`
        : `**${humanAgent(hop.agent)}** rated the incident less serious than the alert context suggests.`;
    case 'domain_mismatch': {
      const got = fieldFromJson(hopJson, 'category', 'intent', 'domain', 'topic');
      if (
        (hop.type === 'Tool call' || hop.type === 'MCP call') &&
        category &&
        categoriesAligned(hop.input_preview, prior?.output_preview)
      ) {
        return `**${humanAgent(hop.agent)}** returned **${category}** policy data, but not the specific detail the employee asked for in ${goal ?? 'their question'}.`;
      }
      return category && got
        ? `Upstream expected **${category}**, but this hop answered as **${got}** — a topic mismatch.`
        : goal
          ? `The reply did not stay on the topic of the original request ${goal}.`
          : 'The answer topic diverged from what earlier steps expected.';
    }
    case 'retrieval_miss': {
      const service = fieldFromJson(hopJson, 'service', 'runbook', 'policy_id');
      if (goal && (hop.type === 'Tool call' || hop.type === 'MCP call')) {
        return `**${humanAgent(hop.agent)}** returned reference data but not the specific answer to ${goal}.`;
      }
      return service
        ? `The lookup for **${service}** did not return a strong match to the question asked.`
        : 'A tool lookup on this hop did not return what the prior step needed.';
    }
    case 'confidence_inflation':
      return `**${humanAgent(hop.agent)}** sounded more certain in its reply than the evidence from upstream supports.`;
    case 'format_error':
      if (hasParseableJsonPreview(hop.output_preview)) {
        return `**${humanAgent(hop.agent)}** returned structured JSON; confidence reflects the model's self-reported score.`;
      }
      return `The output from **${humanAgent(hop.agent)}** was not valid structured JSON, which limits trust in the hop.`;
    case 'propagation':
      return `Doubt from **${prior ? humanAgent(prior.agent) : 'an earlier step'}** carried forward and capped confidence here.`;
    default:
      return driftInPlainEnglish(type);
  }
}

function resolvedMl(hop: TraceHop, ctx: HopExplainContext, ml?: HopMlHint): HopMlHint | undefined {
  const type = displayDriftType(hop, ctx, ml);
  if (!type) return undefined;
  return { drift_type: type, drift_score: ml?.drift_score ?? hop.drift_score ?? 0 };
}

function buildConfidenceSummary(
  hop: TraceHop,
  ctx: HopExplainContext,
  ml: HopMlHint | undefined,
  drop: number,
  inflation: number,
): string {
  const agent = humanAgent(hop.agent);
  const upstream = ctx.priorHop ? humanAgent(ctx.priorHop.agent) : null;
  const confIn = effectiveConfidenceIn(hop, ctx);
  const hopJson = tryParseHopJson(hop.output_preview);
  const priorJson = tryParseHopJson(ctx.priorHop?.output_preview);
  const selfConfRaw = fieldFromJson(hopJson, 'confidence');
  const selfConfNum = selfConfRaw !== undefined ? Number(selfConfRaw) : NaN;
  const selfConfLabel =
    selfConfRaw !== undefined && !Number.isNaN(selfConfNum) ? pctScore(selfConfNum) : selfConfRaw;
  const category = fieldFromJson(priorJson, 'category', 'intent', 'domain');
  const severity = fieldFromJson(hopJson, 'severity');
  const goal = quoteSnippet(ctx.runGoal, 60);
  const effectiveMl = resolvedMl(hop, ctx, ml);

  if (Math.abs(drop) < 0.02 && inflation <= 0) {
    if (hop.hop_index === 0 && selfConfLabel) {
      return `**${agent}** is the first step. It processed ${goal ?? 'the incoming request'} and reported **${selfConfLabel}** confidence in JSON — stored as **${pctScore(hop.confidence_out)}** going out.`;
    }
    if (upstream) {
      return `**${agent}** kept roughly the same confidence as **${upstream}** passed in (**${pctScore(confIn)}** → **${pctScore(hop.confidence_out)}**).`;
    }
    return `**${agent}** stayed about as confident going out as it was coming in.`;
  }

  if (drop >= 0.05 && effectiveMl && effectiveMl.drift_score >= 0.25) {
    const why = driftJustification(
      effectiveMl.drift_type,
      hop,
      ctx.priorHop,
      ctx.runGoal,
      { workflowId: ctx.workflowId, domainType: ctx.domainType },
    ).replace(/\*\*/g, '');
    return `**${agent}** received **${pctScore(confIn)}** from ${upstream ?? 'upstream'}, but finished at **${pctScore(hop.confidence_out)}** because ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
  }

  if (drop >= 0.05 && hop.intent_delta < -0.08 && category && severity && isIncidentContext(ctx)) {
    return `**${agent}** dropped from **${pctScore(confIn)}** to **${pctScore(hop.confidence_out)}** after rating **${severity}** for an alert classified as **${category}** — that category/severity gap limits how confident this hop can be.`;
  }

  if (drop >= 0.05 && Math.abs(hop.confidence_out - (1 + hop.intent_delta)) < 0.03 && hop.intent_delta < -0.15) {
    return `**${agent}** fell from **${pctScore(confIn)}** to **${pctScore(hop.confidence_out)}** because its output only matched the run goal about **${pctScore(1 + hop.intent_delta)}** — low alignment becomes a confidence ceiling.`;
  }

  if (drop >= 0.05) {
    return `**${agent}** was less sure when it finished (**${pctScore(confIn)}** in → **${pctScore(hop.confidence_out)}** out)${goal ? ` after handling ${goal}` : ''}.`;
  }

  if (inflation > 0) {
    return `**${agent}** ended at **${pctScore(hop.confidence_out)}**, higher than the **${pctScore(confIn)}** it received — flagged as possible overconfidence.`;
  }

  if (selfConfLabel && upstream) {
    return `**${agent}** took **${pctScore(confIn)}** from **${upstream}** and left at **${pctScore(hop.confidence_out)}** after the model reported **${selfConfLabel}** confidence in its reply.`;
  }

  return `**${agent}** confidence moved from **${pctScore(confIn)}** to **${pctScore(hop.confidence_out)}** based on this hop's output and alignment checks.`;
}

function buildConfidenceFactors(
  hop: TraceHop,
  ctx: HopExplainContext,
  ml: HopMlHint | undefined,
  drop: number,
  inflation: number,
): string[] {
  const factors: string[] = [];
  const confIn = effectiveConfidenceIn(hop, ctx);
  const hopJson = tryParseHopJson(hop.output_preview);
  const priorJson = tryParseHopJson(ctx.priorHop?.output_preview);
  const upstream = ctx.priorHop ? humanAgent(ctx.priorHop.agent) : null;
  const selfConfRaw = fieldFromJson(hopJson, 'confidence');
  const selfConfNum = selfConfRaw !== undefined ? Number(selfConfRaw) : NaN;
  const selfConfLabel =
    selfConfRaw !== undefined && !Number.isNaN(selfConfNum) ? pctScore(selfConfNum) : selfConfRaw;
  const category = fieldFromJson(priorJson, 'category', 'intent', 'domain');
  const severity = fieldFromJson(hopJson, 'severity');
  const service = fieldFromJson(priorJson, 'service') ?? fieldFromJson(hopJson, 'service');
  const goal = quoteSnippet(ctx.runGoal, 55);
  const outSnippet = quoteSnippet(hop.output_preview, 55);
  const effectiveMl = resolvedMl(hop, ctx, ml);
  const jsonValid = hasParseableJsonPreview(hop.output_preview);

  if (hop.hop_index === 0) {
    factors.push(
      goal
        ? `Run started with ${goal} — this hop sets the baseline; confidence in is always 100%.`
        : 'First hop in the chain — confidence in is 100% by definition.',
    );
  } else if (upstream) {
    factors.push(
      `**${upstream}** finished at **${pctScore(confIn)}** confidence — that is what **${humanAgent(hop.agent)}** received.`,
    );
    if (ctx.priorHop && Math.abs(ctx.priorHop.confidence_out - hop.confidence_in) > 0.02) {
      factors.push(
        `(Raw stored confidence_in was **${pctScore(hop.confidence_in)}** before the chain was reconciled.)`,
      );
    }
    if (category) {
      factors.push(`Upstream labeled the situation **${category}**${service ? ` (${service})` : ''}.`);
    }
  }

  if (drop >= 0.02) {
    factors.push(
      drop < 0.08
        ? `Small drop on this hop: **${pctScore(confIn)}** → **${pctScore(hop.confidence_out)}**.`
        : `Noticeable drop: **${pctScore(confIn)}** → **${pctScore(hop.confidence_out)}**.`,
    );
  }

  if (selfConfLabel && jsonValid) {
    factors.push(
      `The model stated **${selfConfLabel}** confidence in valid JSON${outSnippet ? ` (${outSnippet})` : ''}.`,
    );
  } else if (selfConfLabel) {
    factors.push(
      `The model stated **${selfConfLabel}** confidence in its reply${outSnippet ? ` (${outSnippet})` : ''}.`,
    );
  }

  if (severity && category && isIncidentContext(ctx)) {
    factors.push(
      `Reply severity **${severity}** vs upstream category **${category}** — mismatch here reduces allowed confidence.`,
    );
  } else if (severity && isIncidentContext(ctx)) {
    factors.push(`This hop rated incident severity **${severity}**.`);
  }

  const hedge = hedgePhrase(hop.output_preview);
  if (hedge) {
    factors.push(`Reply contains cautious wording ("${hedge}"), which lowers the text-based confidence score.`);
  }

  if (hop.intent_delta < -0.08) {
    factors.push(
      `Output alignment scored **${pctScore(Math.max(0, 1 + hop.intent_delta))}**, so confidence cannot exceed that ceiling.`,
    );
  }

  if (effectiveMl) {
    factors.push(
      `${driftJustification(effectiveMl.drift_type, hop, ctx.priorHop, ctx.runGoal, { workflowId: ctx.workflowId, domainType: ctx.domainType })} (automated check: ${Math.round(effectiveMl.drift_score * 100)}% severity).`,
    );
  } else if (goal && hop.hop_index > 0 && drop >= 0.05) {
    factors.push(
      `Compared this hop's output to the original request ${goal} — low similarity lowers confidence.`,
    );
  }

  if (inflation > 0) {
    factors.push('Confidence rose more than allowed vs upstream — possible overconfidence on this hop.');
  }

  if (hop.type === 'Tool call' || hop.type === 'MCP call') {
    factors.push('Tool/lookup hops use stricter scoring than plain LLM replies (max ~96%).');
  }

  if (hop.to_agent) {
    factors.push(`Result handed to **${humanAgent(hop.to_agent)}** at **${pctScore(hop.confidence_out)}** confidence.`);
  }

  return factors;
}

export function explainConfidenceChange(
  hop: TraceHop,
  ml?: HopMlHint,
  ctx: HopExplainContext = {},
): { summary: string; factors: string[] } {
  const confIn = effectiveConfidenceIn(hop, ctx);
  const drop = confIn - hop.confidence_out;
  const inflation = hop.confidence_out - confIn - INFLATION_THRESHOLD;
  return {
    summary: buildConfidenceSummary(hop, ctx, ml, drop, inflation),
    factors: buildConfidenceFactors(hop, ctx, ml, drop, inflation),
  };
}

function buildIntentSummary(
  hop: TraceHop,
  ctx: HopExplainContext,
  ml: HopMlHint | undefined,
  pct: number,
  drift: number,
): string {
  const agent = humanAgent(hop.agent);
  const upstream = ctx.priorHop ? humanAgent(ctx.priorHop.agent) : null;
  const priorJson = tryParseHopJson(ctx.priorHop?.output_preview);
  const hopJson = tryParseHopJson(hop.output_preview);
  const category = fieldFromJson(priorJson, 'category', 'intent', 'domain');
  const severity = fieldFromJson(hopJson, 'severity');
  const goal = quoteSnippet(ctx.runGoal, 55);

  if (drift < 0.05) {
    return `**${agent}** stayed on track${goal ? ` for ${goal}` : ''} — **${pct}%** of the original meaning carried through.`;
  }

  if (ml && ml.drift_type !== 'none') {
    const effectiveMl = resolvedMl(hop, ctx, ml);
    if (effectiveMl) {
      const why = driftJustification(
        effectiveMl.drift_type,
        hop,
        ctx.priorHop,
        ctx.runGoal,
        { workflowId: ctx.workflowId, domainType: ctx.domainType },
      ).replace(/\*\*/g, '');
      return `**${pct}%** intent preserved on **${agent}** — ${why.charAt(0).toLowerCase()}${why.slice(1)}`;
    }
  }

  if (category && severity) {
    return `**${pct}%** preserved — **${agent}** answered with **${severity}** but upstream (**${upstream ?? 'prior step'}**) expected something aligned with **${category}**.`;
  }

  if (goal) {
    return `**${pct}%** preserved — **${agent}**'s reply only partially matched the original request ${goal}.`;
  }

  if (pct >= 65) {
    return `**${pct}%** preserved — **${agent}** mostly matched what earlier steps needed, with some drift.`;
  }

  return `**${pct}%** preserved — **${agent}**'s output diverged meaningfully from the workflow goal${upstream ? ` set by **${upstream}**` : ''}.`;
}

function buildIntentFactors(
  hop: TraceHop,
  ctx: HopExplainContext,
  ml: HopMlHint | undefined,
  pct: number,
  drift: number,
): string[] {
  const factors: string[] = [];
  const hopJson = tryParseHopJson(hop.output_preview);
  const priorJson = tryParseHopJson(ctx.priorHop?.output_preview);
  const category = fieldFromJson(priorJson, 'category', 'intent', 'domain');
  const severity = fieldFromJson(hopJson, 'severity');
  const goal = quoteSnippet(ctx.runGoal, 55);
  const inSnippet = quoteSnippet(hop.input_preview, 50);
  const outSnippet = quoteSnippet(hop.output_preview, 50);

  factors.push(
    `**${pct}%** = how much of the run's goal meaning survived this hop (from intent delta **${hop.intent_delta.toFixed(2)}**).`,
  );

  if (goal && hop.hop_index > 0) {
    factors.push(`Run goal (from first input): ${goal}.`);
  }

  if (inSnippet) {
    factors.push(`This hop received: ${inSnippet}.`);
  }

  if (outSnippet) {
    factors.push(`This hop produced: ${outSnippet}.`);
  }

  if (category) {
    factors.push(`Upstream context: category/intent **${category}**.`);
  }

  if (severity) {
    factors.push(`This hop's severity rating: **${severity}**.`);
  }

  if (drift >= 0.08 && !ml?.drift_type) {
    factors.push(
      `About **${Math.round(drift * 100)}%** of the expected meaning did not carry through to the output.`,
    );
  }

  if (ml && ml.drift_type !== 'none') {
    const effectiveMl = resolvedMl(hop, ctx, ml);
    if (effectiveMl) {
      factors.push(
        driftJustification(
          effectiveMl.drift_type,
          hop,
          ctx.priorHop,
          ctx.runGoal,
          { workflowId: ctx.workflowId, domainType: ctx.domainType },
        ),
      );
    }
  }

  if (hop.to_agent) {
    factors.push(`**${humanAgent(hop.to_agent)}** receives this hop's output with **${pct}%** goal alignment.`);
  }

  return factors;
}

export function explainIntentPreserved(
  hop: TraceHop,
  ml?: HopMlHint,
  ctx: HopExplainContext = {},
): { pct: number; summary: string; factors: string[] } {
  const pct = Math.round(Math.max(0, Math.min(100, (1 + hop.intent_delta) * 100)));
  const drift = Math.max(0, -hop.intent_delta);
  return {
    pct,
    summary: buildIntentSummary(hop, ctx, ml, pct, drift),
    factors: buildIntentFactors(hop, ctx, ml, pct, drift),
  };
}

export function contextForHop(
  allHops: TraceHop[],
  hop: TraceHop,
  workflowId?: string,
  domainType?: WorkflowDomainType,
): Pick<HopExplainContext, 'priorHop' | 'runGoal' | 'allHops' | 'workflowId' | 'domainType'> {
  const sorted = [...allHops].sort((a, b) => a.hop_index - b.hop_index);
  for (let i = 1; i < sorted.length; i++) {
    sorted[i] = { ...sorted[i], confidence_in: sorted[i - 1].confidence_out };
  }
  return {
    priorHop: sorted.find((h) => h.hop_index === hop.hop_index - 1),
    runGoal: sorted[0]?.input_preview,
    allHops: sorted,
    workflowId,
    domainType,
  };
}

export function explainHopSignals(
  hop: TraceHop | undefined,
  ml: HopMlHint | undefined,
  opts: HopExplainContext & { blameReason?: string },
): SignalExplanation | null {
  if (!hop) return null;

  const ctx: HopExplainContext = {
    priorHop: opts.priorHop,
    runGoal: opts.runGoal,
    allHops: opts.allHops,
    workflowId: opts.workflowId,
    isSuccess: opts.isSuccess,
    contributionPct: opts.contributionPct,
  };

  const conf = explainConfidenceChange(hop, ml, ctx);
  const intent = explainIntentPreserved(hop, ml, ctx);

  let contributionNote: string | undefined;
  if (opts.contributionPct != null && opts.contributionPct > 0) {
    contributionNote = opts.isSuccess
      ? `**${humanAgent(hop.agent)}** shaped about **${opts.contributionPct}%** of what happened downstream on this successful run (influence, not fault).`
      : `**${opts.contributionPct}%** of fault on this failed run is attributed to **${humanAgent(hop.agent)}**.`;
    if (opts.blameReason) {
      contributionNote += ` ${opts.blameReason}`;
    }
  }

  return {
    confidenceSummary: conf.summary,
    confidenceFactors: conf.factors,
    intentPct: intent.pct,
    intentSummary: intent.summary,
    intentFactors: intent.factors,
    contributionNote,
  };
}

/** Strip markdown bold markers for plain tooltip text. */
export function plainText(s: string): string {
  return s.replace(/\*\*/g, '');
}

export type ExplainTextPart = string | { bold: string };

export function parseExplainText(text: string): ExplainTextPart[] {
  const parts: ExplainTextPart[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ bold: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
