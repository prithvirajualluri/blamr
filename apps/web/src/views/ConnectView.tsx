import React, { useState } from 'react';

type ConnectPath = 0 | 1 | 2;

function CopyBtn({ getText }: { getText: () => string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(getText()).catch(() => {});
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
      style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--b0)', background: 'var(--bg2)', color: 'var(--mu)', cursor: 'pointer' }}
    >
      {ok ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CodeBlock({ html }: { html: string }) {
  return (
    <div className="ccode" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

const PATHS = [
  { title: 'MCP middleware', sub: 'Zero lines of code', badge: 'Recommended' },
  { title: 'SDK wrapper', sub: '3 lines of code', badge: 'Most flexible' },
  { title: 'Framework adapter', sub: '1 import + 1 decorator', badge: '' },
];

export function ConnectView() {
  const [path, setPath] = useState<ConnectPath>(0);

  return (
    <div className="page-enter">
      <div style={{ background: 'var(--goD)', border: '1px solid rgba(215,119,6,.28)', borderRadius: 'var(--rad)', padding: '10px 14px', fontSize: 12.5, color: 'var(--goL)', marginBottom: 14, lineHeight: 1.55 }}>
        <strong>Local ports:</strong> set <code style={{ fontFamily: 'var(--mono)' }}>BLAMR_ENDPOINT</code> to the <strong>ingest</strong> service (<code style={{ fontFamily: 'var(--mono)' }}>http://localhost:3001/v1</code>) for SDK and MCP emitters. The dashboard API runs on port <code style={{ fontFamily: 'var(--mono)' }}>3000</code> — do not point emitters at it.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {PATHS.map((p, i) => (
          <button
            key={p.title}
            type="button"
            className={`ctab${path === i ? ' con' : ''}`}
            onClick={() => setPath(i as ConnectPath)}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muL)', marginBottom: 6 }}>{p.sub}</div>
            {p.badge && <span className="bdg bdg-cyn">{p.badge}</span>}
          </button>
        ))}
      </div>

      {path === 0 && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {[['Effort', 'Zero code', 'var(--grL)'], ['Works with', 'Any MCP server', 'var(--wh)'], ['How', 'Python proxy', 'var(--wh)']].map(([l, v, c]) => (
              <div key={l as string} style={{ background: 'var(--bg3)', borderRadius: 'var(--rad)', padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: c as string }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--cyD)', border: '1px solid rgba(8,145,178,.25)', borderLeft: '3px solid var(--cy)', borderRadius: 'var(--rad)', padding: '10px 14px', fontSize: 12.5, color: 'var(--muL)', marginBottom: 14, lineHeight: 1.55 }}>
            Wrap any MCP server with zero code changes. The Python proxy intercepts tool calls and emits CausalEdges automatically. See docs/INSTALL.md § MCP.
          </div>
          <div style={{ position: 'relative' }}>
            <CopyBtn getText={() => `export BLAMR_API_KEY=bk_live_...
export BLAMR_ENDPOINT=http://localhost:3001/v1
python3 adapters/mcp/blamr_proxy.py run \\
  --workflow-id customer-support \\
  --api-key "$BLAMR_API_KEY" \\
  -- npx @modelcontextprotocol/server-filesystem /tmp

python3 adapters/mcp/blamr_proxy.py proxy \\
  --workflow-id customer-support \\
  --target https://your-mcp-server.example.com/mcp \\
  --api-key "$BLAMR_API_KEY"`} />
            <CodeBlock html={'<span style="color:var(--mu)"># stdio MCP server</span>\n$ <span style="color:var(--cyL)">export</span> BLAMR_ENDPOINT=<span style="color:var(--grL)">http://localhost:3001/v1</span>\n$ <span style="color:var(--cyL)">python3</span> adapters/mcp/blamr_proxy.py <span style="color:var(--cyL)">run</span> \\\n  --workflow-id customer-support \\\n  --api-key <span style="color:var(--grL)">"$BLAMR_API_KEY"</span> \\\n  -- npx @modelcontextprotocol/server-filesystem /tmp\n\n<span style="color:var(--mu)"># HTTP / SSE MCP server (uses BLAMR_ENDPOINT from env)</span>\n$ <span style="color:var(--cyL)">python3</span> adapters/mcp/blamr_proxy.py <span style="color:var(--cyL)">proxy</span> \\\n  --target https://your-mcp-server.example.com/mcp \\\n  --api-key <span style="color:var(--grL)">"$BLAMR_API_KEY"</span>'} />
          </div>
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="panel-hdr">MCP data flow</div>
            <svg viewBox="0 0 600 80" style={{ width: '100%', display: 'block' }} aria-hidden="true">
              {['Agent', 'MCP proxy', 'MCP server', 'Ingest API'].map((lbl, i) => (
                <g key={lbl}>
                  <rect x={20 + i * 145} y={20} width={110} height={40} rx="6" fill="var(--bg3)" stroke="var(--b0)" />
                  <text x={75 + i * 145} y={45} textAnchor="middle" fontSize="11" fill="var(--wh)" fontFamily="monospace">{lbl}</text>
                  {i < 3 && <line x1={130 + i * 145} y1={40} x2={165 + i * 145} y2={40} stroke="var(--cy)" strokeWidth="1.5" markerEnd="url(#arr)" />}
                </g>
              ))}
              <defs><marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="var(--cy)" /></marker></defs>
            </svg>
          </div>
        </div>
      )}

      {path === 1 && (
        <div>
          <div style={{ background: 'var(--cyD)', border: '1px solid rgba(8,145,178,.25)', borderLeft: '3px solid var(--cy)', borderRadius: 'var(--rad)', padding: '10px 14px', fontSize: 12.5, color: 'var(--muL)', marginBottom: 14, lineHeight: 1.55 }}>
            Use <code style={{ color: 'var(--cyL)' }}>BlamrEmitter</code> to emit causal edges from any agent runtime. Set <code style={{ color: 'var(--cyL)' }}>BLAMR_ENDPOINT</code> to the ingest URL (default <code style={{ color: 'var(--cyL)' }}>http://localhost:3001/v1</code>). Install: <code style={{ color: 'var(--cyL)' }}>npm install @blamr/sdk</code>. See docs/INSTALL.md.
          </div>
          <div style={{ position: 'relative' }}>
            <CopyBtn getText={() => "npm install @blamr/sdk\nimport { BlamrEmitter } from '@blamr/sdk';\n\nconst emitter = new BlamrEmitter(\n  { workflowId: 'my-workflow', agentId: 'my-agent' },\n  process.env.BLAMR_API_KEY!,\n  process.env.BLAMR_ENDPOINT ?? 'http://localhost:3001/v1',\n);\n\nemitter.startRun();\nawait emitter.emitEdge({ from_agent: 'my-agent', to_agent: 'next', confidence_in: 1, confidence_out: 0.9, ... });\nawait emitter.completeRun({ businessFailed: false });" } />
            <CodeBlock html={'npm install <span style="color:var(--cyL)">@blamr/sdk</span>\n<span style="color:var(--viL)">import</span> { BlamrEmitter } <span style="color:var(--viL)">from</span> <span style="color:var(--grL)">\'@blamr/sdk\'</span>;\n\n<span style="color:var(--viL)">const</span> emitter = <span style="color:var(--cyL)">new</span> <span style="color:var(--cyL)">BlamrEmitter</span>({\n  workflowId: <span style="color:var(--grL)">\'my-workflow\'</span>, agentId: <span style="color:var(--grL)">\'my-agent\'</span>\n}, process.env.<span style="color:var(--cyL)">BLAMR_API_KEY</span>!,\n  process.env.<span style="color:var(--cyL)">BLAMR_ENDPOINT</span> ?? <span style="color:var(--grL)">\'http://localhost:3001/v1\'</span>);\n\nemitter.<span style="color:var(--cyL)">startRun</span>();\n<span style="color:var(--viL)">await</span> emitter.<span style="color:var(--cyL)">emitEdge</span>({ <span style="color:var(--mu)">/* causal edge */</span> });\n<span style="color:var(--viL)">await</span> emitter.<span style="color:var(--cyL)">completeRun</span>({ businessFailed: <span style="color:var(--goL)">false</span> });'} />
          </div>
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--b0)', borderRadius: 'var(--rad-lg)', padding: 14, marginTop: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Fields to include on each emitEdge call</div>
            {[
              ['confidence_out', 'float', 'Agent-reported or computed certainty for this hop', 'required'],
              ['intent_delta', 'float', 'Goal drift (−1 to +1); workers enrich with semantic drift', 'required'],
              ['influence_score', 'float', 'Downstream impact weight for blame propagation', 'required'],
              ['input_preview / output_preview', 'string', 'I/O snippets for semantic drift and blame reasons', 'recommended'],
              ['tokens, latency, model', 'mixed', 'Standard telemetry for cost and performance', 'recommended'],
            ].map(([f, t, d, tag]) => (
              <div key={f as string} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--b0)', fontSize: 12 }}>
                <span className="mono" style={{ color: 'var(--cyL)', minWidth: 140, flexShrink: 0 }}>{f}</span>
                <span className="mono" style={{ color: 'var(--goL)', minWidth: 55, flexShrink: 0 }}>{t}</span>
                <span style={{ color: 'var(--muL)', flex: 1 }}>{d}</span>
                <span className={`bdg ${tag === 'required' ? 'bdg-red' : tag === 'recommended' ? 'bdg-grn' : 'bdg-mu'}`}>{tag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {path === 2 && (
        <div>
          <div style={{ position: 'relative' }}>
            <CopyBtn getText={() => 'from blamr.adapters.langgraph import BlamrNode\nworkflow.add_node("blamr", BlamrNode(workflow_id="my-workflow"))' } />
            <CodeBlock html={'<span style="color:var(--viL)">from</span> blamr.adapters.langgraph <span style="color:var(--viL)">import</span> <span style="color:var(--cyL)">BlamrNode</span>\nworkflow.<span style="color:var(--cyL)">add_node</span>(<span style="color:var(--grL)">"blamr"</span>, <span style="color:var(--cyL)">BlamrNode</span>(workflow_id=<span style="color:var(--grL)">"my-workflow"</span>))\n\n<span style="color:var(--cyL)">@blamr_crew</span>(workflow_id=<span style="color:var(--grL)">"my-workflow"</span>)\n<span style="color:var(--viL)">class</span> <span style="color:var(--cyL)">MyCrew</span>(Crew): ...'} />
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, background: 'var(--bg2)', border: '1px solid var(--b0)', borderRadius: 'var(--rad-lg)', padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          CausalEdge — what every integration path emits
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rad)', padding: 12, fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.9, color: 'var(--cyL)' }}>
            {'{\n  "run_id": "<your-run-id>",\n  "confidence_in": 0.85,\n  "confidence_out": 0.91,\n  "intent_delta": -0.04,\n  "influence_score": 0.72,\n  "edge_hash": "<merkle-hash>"\n}'}
          </div>
          <div>
            {[
              ['confidence_in / out', 'Tracks certainty propagation and inflation across hops.', 'Novel'],
              ['intent_delta', 'Goal drift per hop. Ingest embeds I/O previews and merges semantic drift automatically.', 'Novel'],
              ['influence_score', 'Downstream impact weight for Shapley blame.', 'Novel'],
              ['edge_hash', 'Merkle-chained SHA256 for tamper-evident audit trails.', 'Novel'],
              ['tokens + latency', 'Standard. Also in LangSmith, LangFuse.', 'Standard'],
            ].map(([f, d, tag]) => (
              <div key={f as string} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--b0)', fontSize: 11.5 }}>
                <span className="mono" style={{ color: tag === 'Novel' ? 'var(--reL)' : 'var(--muL)', minWidth: 130, flexShrink: 0, fontSize: 11 }}>{f}</span>
                <span style={{ color: 'var(--muL)', flex: 1, lineHeight: 1.45 }}>{d}</span>
                <span className={`bdg ${tag === 'Novel' ? 'bdg-red' : 'bdg-mu'}`} style={{ fontSize: 9 }}>{tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
