import React from 'react';
import { BlamrLogo } from '../components/BlamrLogo';
import { AppShell } from '../components/AppShell';
import './landing.css';

const GITHUB = 'https://github.com/prithvirajualluri/blamr';
const DOCS = '/docs.html';
const CAUSAL_MONITORING = '/causal-monitoring.html';

const HOW_IT_WORKS = [
  {
    step: 'STEP 01',
    title: 'Instrument handoffs',
    body: 'SDK, MCP proxy, or framework adapter emits CausalEdges at runtime — not reconstructed from logs later.',
  },
  {
    step: 'STEP 02',
    title: 'Build causal graph',
    body: 'Ingest stores edges; workers compute semantic drift, Shapley blame scores, and confidence gates.',
  },
  {
    step: 'STEP 03',
    title: 'Attribute blame',
    body: 'Backward propagation ranks which agent caused the failure — with confidence decay and intent drift visible per hop.',
  },
];

const SIGNALS = [
  { label: 'Confidence', value: '0.91 → 0.58', desc: 'Inflation across hops' },
  { label: 'Intent Δ', value: '−0.24', desc: 'Goal drift from original query' },
  { label: 'Influence', value: '0.89', desc: 'Causal weight at misroute hop' },
];

const STATS = [
  { value: '88%', label: 'of AI agents fail in production', accent: 're' as const },
  { value: '17%', label: 'accuracy of existing root-cause tools', accent: 're' as const },
  { value: '70%', label: 'of MAS maintenance is debugging', accent: undefined },
  { value: '0', label: 'production OSS tools for causal attribution', accent: 're' as const },
];

const GAPS = [
  {
    title: 'Which agent caused this wrong output?',
    body: 'Traces show every step. None rank agents by causal contribution. With 8+ agents, you guess.',
  },
  {
    title: 'Confidence inflation across handoffs',
    body: 'Agent 2 hedges; Agent 5 states it as fact. Manufactured certainty is invisible in span logs.',
  },
  {
    title: 'Intent decay on long chains',
    body: 'The original goal erodes hop by hop. By step 8 you are confidently answering the wrong question.',
  },
  {
    title: 'Symptom vs root cause',
    body: 'The agent that outputs the wrong answer gets blamed — not the bad decision six hops earlier.',
  },
];

const COMPARE_ROWS: Array<{ cap: string; ls: string; lf: string; ao: string; bl: string }> = [
  { cap: 'Span-level tracing', ls: 'yes', lf: 'yes', ao: 'yes', bl: 'yes' },
  { cap: 'Blame propagation', ls: 'no', lf: 'no', ao: 'no', bl: 'yes' },
  { cap: 'Root cause ranking', ls: 'no', lf: 'no', ao: 'no', bl: 'yes' },
  { cap: 'Confidence decay tracking', ls: 'no', lf: 'no', ao: 'no', bl: 'yes' },
  { cap: 'Intent preservation tracking', ls: 'no', lf: 'no', ao: 'no', bl: 'yes' },
  { cap: 'MCP-native instrumentation', ls: 'no', lf: 'no', ao: 'no', bl: 'yes' },
  { cap: 'Self-hostable OSS', ls: 'no', lf: 'yes', ao: 'no', bl: 'yes' },
];

const EXAMPLES = [
  {
    num: '01',
    level: 'Simple',
    title: 'Wrong agent blamed — misclassification at hop 1',
    scenario:
      'Customer support: intent_classifier → policy_lookup → response_writer. User asks about leave balance; response talks about payroll. All agents log success.',
    without:
      'You tweak response_writer for two hours. You add a manual override. The root cause at intent_classifier is never fixed.',
    with:
      'blamr ranks intent_classifier at 89% blame — classified leave as payroll with 0.91 confidence. Fix: few-shot leave examples on the classifier.',
    fix: 'Add few-shot leave examples to intent_classifier — not the writer.',
  },
  {
    num: '02',
    level: 'Moderate',
    title: 'Silent confidence inflation',
    scenario:
      'Research workflow: web_searcher hedges at 0.43; four hops later the report states "40% — confirmed" at 0.95. No errors, all green spans.',
    without:
      'The report looks authoritative. Standard observability shows 200 OK on every hop. Nobody catches it until reputational damage.',
    with:
      'Confidence trace shows summarizer inflated 0.43 → 0.71 by dropping the hedge. Root cause: hop 2 uncertainty stripping.',
    fix: 'Preserve uncertainty language in summarizer prompt and gate on confidence decay.',
  },
  {
    num: '03',
    level: 'Moderate+',
    title: 'Parallel agent conflict',
    scenario:
      'SDR pipeline: firmographic_agent says HIGH; intent_signal_agent says LOW. Orchestrator picks LOW. Three weeks later it was a $200K deal.',
    without:
      'Both agents succeeded. You debug the agents — but neither was wrong. The orchestrator policy was.',
    with:
      'Conflict report: orchestrator weighted recency over firmographic ICP match. Fix is domain signal weighting — not agent prompts.',
    fix: 'Enterprise ICP leads should overweight firmographic signals in orchestrator policy.',
  },
  {
    num: '04',
    level: 'Complex',
    title: 'Silent data mutation',
    scenario:
      'Invoice pipeline: OCR extracts "1,40,000" (Indian notation). entity_extractor parses ₹1,400,000. Six agents log success; payment goes out 10× wrong.',
    without:
      'Finance finds it in the bank statement. Manual audit of every hop. No exception was ever thrown.',
    with:
      'Causal graph flags entity_extractor at 94% blame — comma stripping misread Indian vs Western notation at hop 2.',
    fix: 'Detect Indian number notation and emit low-confidence when comma placement is ambiguous.',
  },
  {
    num: '05',
    level: 'Advanced',
    title: 'Semantic drift across 8 agents',
    scenario:
      'Competitive analysis goal: "Workday Q2 APAC HCM." Final briefing covers SAP SuccessFactors globally. Polished output, wrong mission, zero errors.',
    without:
      'You re-run the workflow. You tweak report_writer. Drift started at hop 4 — you never find it in logs.',
    with:
      'Intent map: content_aggregator at 61% — SAP content weighted by volume. Counterfactual: relevance filter restores 89% intent.',
    fix: 'Add intent relevance scoring to content_aggregator; filter web_searcher_2 to Workday-only sources.',
  },
];

const WHY_NOW = [
  {
    title: 'Multi-agent systems hit production scale',
    body: '5–15+ coordinating agents are a 2026 phenomenon — MCP, LangGraph, CrewAI. The debugging pain did not exist at this scale a year ago.',
  },
  {
    title: 'MCP is the universal agent protocol',
    body: 'Linux Foundation standard across Anthropic, Microsoft, Google, AWS. blamr instruments at the protocol layer — framework-agnostic by design.',
  },
  {
    title: 'EU AI Act audit trails (Aug 2026)',
    body: 'High-risk AI systems need tamper-evident traceability. Causal audit export is compliance infrastructure — not optional for enterprise HR and finance.',
  },
  {
    title: 'Research proved it — nobody shipped OSS',
    body: 'AgentTrace, AAAI causal inference, A2P scaffolding — validated approaches with no production open-source implementation yet.',
  },
];

function Cell({ v, blamr }: { v: string; blamr?: boolean }) {
  const cls = v === 'yes' ? 'yes' : v === 'partial' ? 'partial' : 'no';
  const label = v === 'yes' ? 'Yes' : v === 'partial' ? 'Partial' : 'No';
  return <td className={`${cls}${blamr ? ' blamr-col' : ''}`}>{label}</td>;
}

export function LandingView() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <AppShell variant="landing">
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-nav-inner">
        <button type="button" className="landing-nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <BlamrLogo variant="full" className="logo-mark" />
        </button>
        <nav className="landing-nav-links">
          <a href="#how-it-works" className="hide-sm" onClick={(e) => { e.preventDefault(); scrollTo('how-it-works'); }}>How it works</a>
          <a href="#philosophy" className="hide-sm" onClick={(e) => { e.preventDefault(); scrollTo('philosophy'); }}>Philosophy</a>
          <a href="#examples" className="hide-sm" onClick={(e) => { e.preventDefault(); scrollTo('examples'); }}>Examples</a>
          <a href="#compare" className="hide-sm" onClick={(e) => { e.preventDefault(); scrollTo('compare'); }}>Compare</a>
          <a href="#deploy" className="hide-sm" onClick={(e) => { e.preventDefault(); scrollTo('deploy'); }}>Deploy</a>
          <a href={DOCS} className="hide-sm">Docs</a>
          <a href={CAUSAL_MONITORING} className="hide-sm">Causal monitoring</a>
          <a className="landing-btn landing-btn-primary" href="/app">Open console</a>
          <a className="landing-btn landing-btn-ghost" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-eyebrow">
          <img src="/blamr_favicon.svg" width="16" height="16" alt="" aria-hidden="true" />
          Open source · Self-hosted
        </div>
        <BlamrLogo variant="full" className="landing-hero-logo" />
        <h1>Causal intelligence for multi-agent AI</h1>
        <p className="landing-hero-lead">
          Span tools log <strong>what happened</strong>. blamr traces handoffs, attributes blame, and explains{' '}
          <strong>which agent caused the failure — and why</strong>. Not observability. Causal intelligence.
        </p>
        <div className="landing-cta-row">
          <a className="landing-btn landing-btn-primary" href={DOCS}>
            Install &amp; quick start
          </a>
          <button type="button" className="landing-btn landing-btn-ghost" onClick={() => scrollTo('how-it-works')}>
            How it works
          </button>
          <button type="button" className="landing-btn landing-btn-ghost" onClick={() => scrollTo('examples')}>
            See failure examples
          </button>
          <a className="landing-btn landing-btn-ghost" href={GITHUB} target="_blank" rel="noreferrer">
            Star on GitHub
          </a>
        </div>
        <div className="landing-stats">
          {STATS.map((s) => (
            <div key={s.label} className="landing-stat">
              <div className={`landing-stat-val${s.accent ? ` ${s.accent}` : ''}`}>{s.value}</div>
              <div className="landing-stat-lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-section alt">
        <div className="landing-section-hdr">
          <h2>How blamr works</h2>
          <p>
            Every agent handoff emits a CausalEdge — confidence, intent drift, I/O previews. Workers build a causal graph
            and rank who actually caused the failure.
          </p>
        </div>
        <div className="landing-how-grid">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} className="landing-how-step">
              <div className="landing-how-num">{s.step}</div>
              <h4>{s.title}</h4>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="landing-signal-demo">
          {SIGNALS.map((s) => (
            <div key={s.label} className="landing-signal-card">
              <div className="landing-signal-lbl">{s.label}</div>
              <div className="landing-signal-val">{s.value}</div>
              <div className="landing-signal-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="philosophy" className="landing-section">
        <div className="landing-section-hdr">
          <h2>Flight recorder vs crash investigator</h2>
          <p>
            Existing tools — LangSmith, Langfuse, AgentOps — excel at recording spans, tokens, and latency.
            When a multi-agent workflow fails silently, they show you every step. They cannot tell you which step caused it.
          </p>
        </div>
        <div className="landing-philosophy">
          <div className="landing-phil-card">
            <h3>Observability tools</h3>
            <p className="big">What did each agent do?</p>
            <p>
              Flat spans and traces. Manual log inspection. The agent that outputs the wrong answer gets investigated first —
              even when the root cause was six hops upstream.
            </p>
          </div>
          <div className="landing-phil-card highlight">
            <h3>blamr</h3>
            <p className="big">Which agent caused this outcome?</p>
            <p>
              Causal edges at every handoff. Backward blame propagation with Shapley scoring. Confidence and intent tracked
              across hops — so silent failures surface before they ship.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section alt">
        <div className="landing-section-hdr">
          <h2>The structural gap</h2>
          <p>
            These are not missing features waiting for the next Langfuse release. Causality requires runtime instrumentation
            at the handoff layer — not post-hoc reconstruction from linear traces.
          </p>
        </div>
        <div className="landing-gap-grid">
          {GAPS.map((g) => (
            <div key={g.title} className="landing-gap-item">
              <span>×</span>
              <div>
                <h4>{g.title}</h4>
                <p>{g.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="examples" className="landing-section">
        <div className="landing-section-hdr">
          <h2>Five production failure patterns</h2>
          <p>
            Real scenarios from customer support, research, sales intelligence, finance, and autonomous analysis —
            from single-hop misclassification to full semantic drift across eight agents.
          </p>
        </div>
        <div className="landing-examples">
          {EXAMPLES.map((ex) => (
            <details key={ex.num} className="landing-example" open={ex.num === '01'}>
              <summary>
                <span className="landing-example-num">{ex.num} · {ex.level}</span>
                <div>
                  <div className="landing-example-title">{ex.title}</div>
                  <div className="landing-example-sub">{ex.scenario}</div>
                </div>
              </summary>
              <div className="landing-example-body">
                <div className="landing-example-cols">
                  <div className="landing-example-col without">
                    <h5>Without blamr</h5>
                    <p>{ex.without}</p>
                  </div>
                  <div className="landing-example-col with">
                    <h5>With blamr</h5>
                    <p>{ex.with}</p>
                  </div>
                </div>
                <div className="landing-example-fix">
                  <strong>Fix path:</strong> {ex.fix}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section id="compare" className="landing-section alt">
        <div className="landing-section-hdr">
          <h2>Capability comparison</h2>
          <p>What existing tools record vs what blamr attributes — at a glance.</p>
        </div>
        <div className="landing-table-wrap">
          <table className="landing-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>LangSmith</th>
                <th>Langfuse</th>
                <th>AgentOps</th>
                <th className="blamr-col">blamr</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.cap}>
                  <td>{row.cap}</td>
                  <Cell v={row.ls} />
                  <Cell v={row.lf} />
                  <Cell v={row.ao} />
                  <Cell v={row.bl} blamr />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-hdr">
          <h2>Why now</h2>
          <p>Four independent forcing functions aligned in 2026 — production pain, protocol standardization, regulation, and validated research.</p>
        </div>
        <div className="landing-why-grid">
          {WHY_NOW.map((w, i) => (
            <div key={w.title} className="landing-why-card">
              <div className="num">{String(i + 1).padStart(2, '0')}</div>
              <h4>{w.title}</h4>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="deploy" className="landing-section alt">
        <div className="landing-section-hdr">
          <h2>Self-hosted by default</h2>
          <p>Run the full stack on your infrastructure. Docker Compose, Helm, Ollama-only LLM enrichment — no cloud LLM required.</p>
        </div>
        <div className="landing-deploy">
          <div className="landing-deploy-card">
            <h4>Docker Compose</h4>
            <p>API, ingest, workers, dashboard, ClickHouse, Redpanda, Postgres — one command to stand up the stack.</p>
          </div>
          <div className="landing-deploy-card">
            <h4>SDK + MCP proxy</h4>
            <p>TypeScript SDK, Python SDK, or zero-code MCP middleware — emit causal edges from any agent runtime.</p>
          </div>
          <div className="landing-deploy-card">
            <h4>Helm on Kubernetes</h4>
            <p>Production chart with ingress, init jobs, and local Ollama for semantic drift and blame reasons.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <BlamrLogo variant="full" className="landing-footer-logo" />
        <p>
          blamr is open-source causal intelligence for multi-agent systems.
          Trace handoffs, attribute blame, explain failures — before they reach production users.
        </p>
        <div className="landing-cta-row">
          <a className="landing-btn landing-btn-ghost" href={CAUSAL_MONITORING}>
            How monitoring works
          </a>
          <a className="landing-btn landing-btn-primary" href={DOCS}>
            Read the install guide
          </a>
          <a className="landing-btn landing-btn-ghost" href={GITHUB} target="_blank" rel="noreferrer">
            Clone the repository
          </a>
        </div>
        <div className="landing-footer-links">
          <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
          <a href={DOCS}>Install docs</a>
          <a href={CAUSAL_MONITORING}>Causal monitoring</a>
          <a href="#philosophy" onClick={(e) => { e.preventDefault(); scrollTo('philosophy'); }}>Philosophy</a>
          <a href="#deploy" onClick={(e) => { e.preventDefault(); scrollTo('deploy'); }}>Self-host</a>
        </div>
        <p className="landing-footer-note">
          Self-hosting the stack? Operator console (runs, blame graphs, API keys) lives at{' '}
          <a href="/app">/app</a> after you deploy — separate from this public site.
        </p>
      </footer>
    </div>
    </AppShell>
  );
}
