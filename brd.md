# blamr — Complete Build Requirements Document
**For: Cursor AI (full-stack implementation)**
**Author: Prithvi Raju · VP AI, Engineering & Security · Darwinbox**
**Version: 1.0 · June 2026**

---

## Cursor Instructions

You are building **blamr** — a causal intelligence platform for multi-agent AI systems. This document is your complete specification. Build everything described here. Do not invent features not described. When in doubt, refer to the architecture section and the data models.

Read this entire document before writing a single line of code. The architecture decisions are deliberate and load-bearing.

---

## 1. What You Are Building

blamr answers one question that no existing tool can: **which agent in a multi-agent system caused a failure, and why.**

Existing tools (LangSmith, Langfuse, AgentOps) record what happened — spans, tokens, latency. They are flight recorders. blamr is a crash investigator. It traces blame backwards through a causal graph, ranks every agent by contribution to the failure using Shapley values, and gives engineers a root cause in under one second.

### The core problem

Multi-agent systems fail silently. All agents return HTTP 200. All agents log "success". The wrong answer looks like a right answer until a human catches it. When engineers debug, they read logs manually and guess. This is where 70% of multi-agent maintenance time goes.

### What makes blamr structurally different

Every existing tool is built on OpenTelemetry spans — flat, linear event records. blamr introduces a new first-class data primitive: the **CausalEdge**. It carries fields that do not exist in any trace standard:

- `confidence_in` / `confidence_out` — tracks certainty inflation across handoffs
- `intent_delta` — measures goal drift per hop (cosine similarity)
- `influence_score` — how much this agent's output shaped the downstream chain
- `edge_hash` — merkle-chained SHA256 for tamper-evident audit (EU AI Act Article 13)

These four fields are the moat. You cannot retrofit them into an existing observability tool. They require build-time instrumentation at the handoff layer.

---

## 2. Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Backend API | NestJS + TypeScript |
| Causal graph engine | Rust (compiled to WASM for v0.1, native binary for v1) |
| Primary database | PostgreSQL + TimescaleDB extension |
| Graph store | PostgreSQL adjacency tables (migrate to dedicated graph DB at scale) |
| Event ingest | HTTPS POST endpoint + WebSocket for streaming |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (no component library — custom components only) |
| Auth | JWT + API key authentication |
| Deployment | Docker Compose (self-hosted) + cloud SaaS option |
| SDK | TypeScript package + Python package |

### Repository structure

```
blamr/
├── apps/
│   ├── api/              # NestJS backend
│   ├── web/              # React frontend
│   └── ingest/           # High-throughput edge ingest service
├── packages/
│   ├── sdk-ts/           # TypeScript SDK (@blamr/sdk)
│   ├── sdk-py/           # Python SDK (blamr-sdk)
│   ├── engine/           # Rust causal graph + blame engine
│   └── types/            # Shared TypeScript types
├── adapters/
│   ├── langgraph/        # LangGraph BlamrNode
│   ├── crewai/           # CrewAI @blamr_crew decorator
│   ├── autogen/          # AutoGen BlamrCallbacks
│   └── mcp/              # MCP middleware proxy
├── docker-compose.yml
└── blamr.yaml.example
```

### Data models (TypeScript interfaces — implement these exactly)

```typescript
// The core novel primitive
interface CausalEdge {
  id: string;                    // uuid
  run_id: string;
  workflow_id: string;
  workspace_id: string;
  from_agent: string;
  to_agent: string;
  hop_index: number;
  timestamp_ms: number;

  // Causal primitives — novel, not in OTel
  confidence_in: number;         // 0.0–1.0, confidence agent received
  confidence_out: number;        // 0.0–1.0, confidence agent emitted
  intent_delta: number;          // -1.0–1.0, goal drift (cosine sim)
  influence_score: number;       // 0.0–1.0, downstream impact weight

  // Execution telemetry
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  model: string;
  call_type: 'LLM call' | 'Tool call' | 'Vision call' | 'MCP call';
  cost_usd: number;

  // Integrity
  prev_hash: string;             // previous edge hash in chain
  edge_hash: string;             // SHA256(prev_hash + edge_data + timestamp)
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  workspace_id: string;
  status: 'running' | 'success' | 'failed';
  complexity: 'Simple' | 'Moderate' | 'Moderate+' | 'Complex' | 'Advanced';
  started_at: number;            // unix ms
  ended_at: number;
  duration_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  error_summary: string | null;
  accuracy_score: number;        // 0.0–1.0, computed post-run
  agents: string[];              // ordered list of agent names
  layout: 'linear' | 'parallel' | 'dag';
  edges: CausalEdge[];
}

interface BlameReport {
  run_id: string;
  root_cause_agent: string;
  root_cause_pct: number;        // 0–100
  method: 'backward_bfs_shapley';
  computed_at_ms: number;
  agents: AgentBlame[];
}

interface AgentBlame {
  agent: string;
  blame_pct: number;
  is_root: boolean;
  reason: string;                // human-readable explanation
  confidence_inflated: boolean;
}

interface APIKey {
  id: string;
  key_hash: string;              // bcrypt hash — never store plaintext
  key_prefix: string;            // first 14 chars for display (e.g. bk_live_a1B2c3)
  name: string;
  workspace_id: string;
  environment: 'live' | 'test';
  scopes: APIScope[];
  created_at: number;
  last_used_at: number | null;
  call_count: number;
  status: 'active' | 'revoked';
}

type APIScope = 'ingest:write' | 'runs:read' | 'runs:write' | 'export:read';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_email: string;
  plan: 'oss' | 'cloud' | 'enterprise';
  created_at: number;
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  retention_days: number;
  confidence_inflation_threshold: number;  // default 0.15
  intent_drift_threshold: number;          // default 0.20
  rate_limit_per_min: number;              // default 1000
}
```

---

## 3. Backend API Specification

### Authentication

All API endpoints require either:
1. `Authorization: Bearer <jwt>` — for web app requests
2. `X-API-Key: bk_live_...` — for SDK / agent connections

API keys must be validated by hashing the incoming key with bcrypt and comparing to the stored hash. Never log or store plaintext keys after creation.

### REST API endpoints

#### Ingest (high-throughput — separate service)

```
POST /v1/edges
  Body: CausalEdge | CausalEdge[]
  Auth: X-API-Key with ingest:write scope
  Rate limit: per workspace settings (default 1000/min)
  Response: { accepted: number, run_id: string }

POST /v1/runs/:run_id/complete
  Body: { status: 'success' | 'failed', error_summary?: string }
  Auth: X-API-Key with ingest:write scope
  Response: { blame_report: BlameReport }  // computed synchronously
```

#### Runs

```
GET  /v1/runs
  Query: ?workspace_id=&status=&workflow_id=&limit=&offset=
  Auth: Bearer JWT or API key with runs:read
  Response: { runs: WorkflowRun[], total: number }

GET  /v1/runs/:id
  Response: WorkflowRun with full edges array

GET  /v1/runs/:id/blame
  Response: BlameReport

GET  /v1/runs/:id/confidence-trace
  Response: { hops: { agent: string, ci: number, co: number, inflated: boolean }[] }

GET  /v1/runs/:id/intent-trace
  Response: { hops: { agent: string, intent_pct: number }[] }

GET  /v1/runs/:id/export
  Query: ?format=eu-ai-act
  Response: signed NDJSON audit trail
```

#### Workflows

```
GET  /v1/workflows
  Response: { workflows: WorkflowSummary[], total: number }

GET  /v1/workflows/:id/accuracy-history
  Response: { runs: { run_id, accuracy, timestamp }[] }
```

#### API Key Management

```
GET  /v1/keys
  Auth: Bearer JWT (owner only)
  Response: APIKey[] (never returns key_hash, only key_prefix)

POST /v1/keys
  Body: { name: string, environment: 'live'|'test', scopes: APIScope[] }
  Response: { key: APIKey, raw_key: string }  // raw_key shown ONCE only

DELETE /v1/keys/:id
  Response: { revoked: true }
```

#### Workspace

```
GET  /v1/workspace
PATCH /v1/workspace
  Body: Partial<WorkspaceSettings>

POST /v1/workspace/rotate-keys
  Response: { rotated: number, new_keys: { id, raw_key }[] }
```

#### Webhooks

```
GET  /v1/webhooks
POST /v1/webhooks
  Body: { name: string, url: string, events: WebhookEvent[], secret: string }
DELETE /v1/webhooks/:id
POST /v1/webhooks/:id/test
```

Webhook event types: `run.completed` · `run.failed` · `blame.detected` · `confidence.inflated` · `intent.drifted` · `alert.high`

### Blame engine (Rust)

The blame engine lives in `packages/engine/`. It takes a completed `WorkflowRun` and returns a `BlameReport`. Algorithm:

1. Build a directed acyclic graph from `run.edges` (nodes = agents, edges = causal connections weighted by `influence_score`)
2. Start from the terminal node (final output agent)
3. Walk backwards using BFS, accumulating `influence_score` along edges
4. Apply Shapley value computation: for each agent `i`, calculate marginal contribution across all subsets of agents
5. Rank agents by Shapley score → `blame_pct`
6. Identify root cause: highest `blame_pct` AND highest `confidence_out - confidence_in` delta
7. Generate natural language reason string using agent name, blame %, and confidence/intent signals

Performance target: root cause in < 1 second for runs with up to 50 agents.

---

## 4. SDK Specification

### TypeScript SDK (`packages/sdk-ts/`)

```typescript
// Primary export
export function wrapClient<T extends AnthropicClient | OpenAIClient>(
  client: T,
  options: {
    workflowId: string;
    agentId: string;
    apiKey?: string;            // falls back to BLAMR_API_KEY env var
    endpoint?: string;          // falls back to https://ingest.blamr.ai/v1
  }
): T & { blamr: BlamrClientExtension }

// Extension methods available on wrapped client
interface BlamrClientExtension {
  markHandoff(options: {
    to: string;
    confidence?: number;
    intentPreserved?: boolean;
  }): void;

  startRun(runId?: string): string;
  endRun(status: 'success' | 'failed', error?: string): Promise<BlameReport>;
  getCurrentRunId(): string | null;
}
```

Auto-extraction behaviour when `messages.create()` is called:
- Extract `tokens_in` and `tokens_out` from `response.usage`
- Extract `model` from request params
- Measure `latency_ms` as wall clock around the call
- Parse `confidence_out` from response text: scan for hedge markers ("might", "possibly", "uncertain", "approximately", "around", "could be", "unclear") — presence reduces confidence from 1.0 in proportion to marker count and strength
- Emit `CausalEdge` to ingest endpoint asynchronously (non-blocking)

### Python SDK (`packages/sdk-py/`)

```python
def wrap_client(
    client: Anthropic | OpenAI,
    workflow_id: str,
    agent_id: str,
    api_key: str | None = None,
    endpoint: str | None = None
) -> BlamrWrappedClient:
    ...
```

Same auto-extraction behaviour as TypeScript SDK.

### MCP Middleware (`adapters/mcp/`)

A transparent proxy that wraps any MCP server:

```bash
# CLI usage
blamr run -- npx @modelcontextprotocol/server-filesystem /data
blamr proxy --target https://mcp-server.example.com/sse --workflow-id customer-support
```

Implementation: stdio-to-HTTP proxy that intercepts all MCP `tools/call` requests and `tools/call` results, extracts timing and content signals, emits CausalEdges, then forwards unchanged.

### Framework Adapters

**LangGraph** (`adapters/langgraph/`):
```python
from blamr.adapters.langgraph import BlamrNode
# Instantiate as a LangGraph node — passthrough that emits edges on state transition
node = BlamrNode(workflow_id="customer-support", api_key=None)
```

**CrewAI** (`adapters/crewai/`):
```python
from blamr.adapters.crewai import blamr_crew
@blamr_crew(workflow_id="research-assistant")
class ResearchCrew(Crew): ...
```

**AutoGen** (`adapters/autogen/`):
```python
from blamr.adapters.autogen import BlamrCallbacks
callbacks = BlamrCallbacks(workflow_id="incident-triage")
```

---

## 5. Frontend Specification

### App structure

Single-page React app with six views navigated from a persistent sidebar. No routing library — implement view switching with a `view` state variable.

```
Views:
  monitor    — Live workflow accuracy heatmap (landing page)
  list       — Runs list with filter/search
  detail     — Run detail (tabs: graph, trace, cost, blame, timeline, alerts, fix)
  connect    — Agent connection guide (MCP, SDK, framework adapters)
  settings   — API & key management
  workspace  — Workspace settings
```

### Design system

Dark theme. No component library. All components hand-built.

```
Colors:
  --bg:      #070D1A   (page background)
  --bg2:     #0D1627   (card/sidebar background)
  --bg3:     #0F1C30   (input/hover background)
  --b0:      #1E3050   (default border)
  --b1:      #2A4070   (hover border)
  --cy:      #0891B2   (primary accent / cyan)
  --cyL:     #22D3EE   (cyan light)
  --vi:      #7C3AED   (violet — model/SDK indicators)
  --viL:     #A78BFA
  --gr:      #059669   (success / green)
  --grL:     #34D399
  --go:      #D97706   (warning / amber)
  --goL:     #FCD34D
  --re:      #DC2626   (danger / red)
  --reL:     #FCA5A5
  --wh:      #F0F9FF   (primary text)
  --mu:      #64748B   (muted text)
  --muL:     #94A3B8   (muted light)
  --mono:    'Courier New', monospace

Typography:
  Primary:   system-ui, -apple-system, sans-serif
  Monospace: 'Courier New', Courier, monospace
  Base size: 14px
```

### View: Monitor (landing)

The primary monitoring surface. Shows all workflows as a heatmap grid.

**Layout:** Two-column — heatmap (left, 70%) and right panel (30%).

**KPI strip (top):** Four cards — Platform accuracy, Critical workflows, Total runs, High blame heat. Each clickable to filter the heatmap.

**Filter chips:** All · Critical <60% · Warning 60-75% · Healthy >90%

**Sort control:** Accuracy ↑ · Accuracy ↓ · Blame heat · Run count

**Heatmap grid:**
- Each row = one workflow
- Each cell = one run, colour encodes accuracy:
  - `< 40%` → `#A32D2D`
  - `40–60%` → `#DC2626`
  - `60–75%` → `#BA7517`
  - `75–90%` → `#639922`
  - `> 90%` → `#34D399`
- Cell opacity = `0.45 + accuracy * 0.55`
- Cell size: 14×14px with 2px gap
- Cells belonging to real runs (with full detail available) are clickable and navigate to run detail
- Workflow name column: 140px wide, monospace, truncated
- Accuracy column: 34px wide, monospace, right-aligned, colour-coded

**Workflow drawer (inline, below heatmap):**
Clicking a workflow row opens an inline drawer (not a modal) showing:
- Accuracy metrics: avg accuracy, trend (last run vs first run), total runs, agent count
- Run-by-run accuracy trail (coloured cell strip)
- Agent blame heat distribution (ranked bar chart, top 5 agents)
- If real runs exist: clickable run buttons labelled with run ID, coloured by status

**Right panel:**
1. Platform health donut — healthy vs critical ratio
2. Accuracy by workflow type — sparklines per type
3. Blame heat leaderboard — top 8 agents by cumulative blame across all workflows
4. Live anomaly feed — 6 most recent anomalies, clickable to run detail

**Alert banner:** If critical workflows exist, show a red callout at the top with count and list of alert titles. Clickable to filter critical.

### View: Runs list

**Filter chips:** All (N) · Failed (N) · Success (N) — persists across navigation

**Search:** Real-time filter on title, ID, workflow, error text

**Run cards:**
- Left border: 3px, red for failed, green for success
- Fields: run ID (monospace), status badge, complexity badge
- Title (bold), then metadata row: timestamp · agent count · token count · cost · duration
- Accuracy badge: coloured by value
- Error summary bar (red, for failed runs)
- High alert count badge if alerts exist

### View: Run detail

**Breadcrumb:** Monitor › Runs › [run title]

**Badge row:** status · complexity · "Confidence inflation" (if detected) · "N high alerts" · "Fix available"

**Success hero (success runs only):** Green banner with ✓, "Workflow completed successfully", subtitle with key stats

**Error callout (failed runs only):** Red left-border callout with failure summary

**Stat row (4 cards):** Root cause agent / "None" · Total cost · Total latency · Intent preserved

**Tabs:** Causal graph · Trace · Cost & tokens · Blame report (failed only) · Timeline · Alerts · Fix (if fix exists)

#### Tab: Causal graph

SVG rendered in-browser. Layout computed from `run.layout`:
- `linear`: agents evenly spaced left-to-right, y centred
- `parallel`: first N-1 agents stacked vertically on left, final agent centred right
- `dag`: research_planner → two web searchers (split) → aggregator → remaining chain

Node rendering:
- Circle, radius 23px (root cause: 27px)
- Fill: rgba(220,38,38,0.18) for root, rgba(215,119,6,0.1) for >20% blame, rgba(8,145,178,0.08) for normal, rgba(5,150,105,0.08) for success
- Stroke: matching accent colour
- Root cause: dashed outer ring + "ROOT CAUSE" label above node
- Label: agent name truncated to 11 chars, monospace 9px
- Blame % label below node (red for root, amber for >20%, gray otherwise)
- Success runs: ✓ label instead of blame %
- Latency micro-bar below node: 28px wide, 2px tall, cyan/amber by proportion
- Cost ring: dashed amber circle, radius proportional to relative cost

Edge rendering:
- Line thickness: `0.7 + influence_score * 2.4`
- Colour: red for edges touching root cause, cyan for success runs, dark blue otherwise
- Arrow marker at end
- Influence score label at midpoint (9px)

Hover tooltip (fixed-position div):
- Agent name
- Blame % · Confidence in → out · Intent preserved · Tokens · Cost · Latency

Click agent → agent detail panel slides in below graph

#### Tab: Trace

Two sections:
1. Span list — each span shows agent name, call type, model badge (violet), status badge, timing metadata, proportional latency bar, blame reason if applicable
2. Waterfall chart — SVG, each agent as a horizontal bar proportional to latency, positioned by cumulative time offset

#### Tab: Cost & tokens

Three stat cards: total cost, total tokens (split in/out), cost per agent avg

Three panels:
1. Cost by agent — ranked bars (amber fill)
2. Tokens in / out — stacked bar per agent
3. Model cost breakdown — bars by model name (violet)

#### Tab: Blame report

Empty state for success runs: "No blame attributed — all agents healthy"

For failed runs: ranked list of agents with:
- Agent name
- Proportional blame bar (red for root, amber for >20%, blue otherwise)
- Blame % (bold)
- "Root" badge for top agent
- Reasoning text below each row

#### Tab: Timeline

Two panels:
1. Confidence per hop — dual bar per agent showing `confidence_in` (faint) and `confidence_out` (solid), red for inflated hops
2. Intent preservation per hop — single bar per agent, green/amber/red by value

#### Tab: Alerts

Sorted: high → medium → low

Each alert: severity icon + colour-coded title + body text + severity label

Empty state for clean runs.

#### Tab: Fix

Sections:
1. Green callout with fix recommendation
2. CLI commands code block (monospace, dark bg) with Copy button
3. Root cause summary (kv rows: agent, blame %, complexity, failure)

### View: Connect agents

Three path cards at top (clickable to switch panel):
1. MCP middleware — "Zero lines of code" — "Recommended"
2. SDK wrapper — "3 lines of code" — "Most flexible"
3. Framework adapter — "1 import + 1 decorator"

Active card gets highlighted border.

Each card switches a code panel below. Panels contain:
- Meta row (3 cards: effort, works with, how)
- Info callout (cyan left-border)
- For MCP: data flow SVG diagram + YAML config + CLI commands
- For SDK: install command + TypeScript snippet + Python snippet + auto-extracted fields table
- For framework: LangGraph + CrewAI + AutoGen code snippets

Bottom of page (always visible): CausalEdge schema — JSON on left, field descriptions on right with "Novel" / "Standard" badges.

All code blocks have Copy buttons. Copy writes to clipboard and shows "Copied!" for 1.5s.

### View: API & keys

**Header:** "API & key management" + "Create API key" button (cyan primary)

**Summary strip:** 4 stat cards — Active keys · Total API calls · Workflows connected · Rate limit

**Sub-tabs:** API keys · Usage & limits · Webhooks · Workspace

**API keys tab:**

Each key card shows:
- Name + environment badge (live = red, test = gray) + status badge (active = green, revoked = gray)
- Masked key: `bk_live_a1B2c3D4e5F6g7H8••••••••••••••••••` + "Show" button (inline reveal)
- "Copy key" button + "Revoke" button (red, for active keys only)
- Metadata: created date · last used · call count · workflow count
- Revoked keys: 50% opacity, no action buttons

Scopes reference panel at bottom (2-column grid): ingest:write · runs:read · runs:write · export:read

**Create key modal (overlay):**
- Key name input
- Environment toggle (Live / Test radio buttons)
- Scope checkboxes (ingest:write pre-checked and required)
- Warning: "API keys are shown only once at creation"
- "Generate key" button → closes modal → opens reveal screen

**Reveal screen (replaces modal):**
- ✅ icon, "API key created", key name
- Green callout: "Copy this key now. It will not be shown again."
- Full key in monospace box
- Quick connect snippet (Python)
- "Copy key" + "Done" buttons

After "Done": key added to list with status active, reveal screen closed.

**Usage & limits tab:**
- 7-day bar chart (calls per day, colour-coded by volume)
- Rate limits grid (6 cards): ingest rate · retention · workflows · seats · export quota · support

**Webhooks tab:**
- Existing webhooks with masked URL, delivery count, event subscriptions
- "+ Add endpoint" button
- Event types grid: 6 event types as cards

**Workspace tab:**
- Settings rows (name, workspace ID, plan, owner, retention, confidence threshold) with inline Edit buttons
- Danger zone: Rotate all keys · Export data · Delete workspace (red border, confirming toast)

### Global components

**Sidebar (220px wide):**
- Logo + animated pulse dot (blamr brand)
- Search input (filters runs in real-time when on list view, navigates to list when on other views)
- Nav sections: Platform (Monitor) · Runs (All, Failed, Success) · Workflows (dynamic from data) · Tools (Connect agents, API & keys, CI diff, Export)
- Counts: All shows total run count, Failed shows badge with count, Success shows count
- Footer: blamr.ai wordmark, version, keyboard shortcuts link, live clock

**Topbar (52px):**
- Breadcrumb (clickable ancestors)
- Right slot: context-sensitive buttons (Back, Copy ID, Export, Refresh)
- Keyboard shortcuts button (⌨ icon)

**Toast notifications:**
- Bottom-right, stacked
- Slide in from right (CSS animation)
- Auto-dismiss after 3s (warn/error: 3.5s)
- Types: info · success · warn · error with matching icons
- Manual close button

**Keyboard overlay (modal):**
- `?` to open, `Esc` to close
- Shortcuts: G M (Monitor), G R (Runs), G C (Connect), G K (Keys), / (Search), Esc (Back), ] / [ (Next/prev tab)

**Tooltip (hover on graph nodes):**
- Fixed position, follows cursor
- Dark bg, cyan border
- Fields: agent name (header), blame, confidence, intent, tokens, cost, latency

**Page transitions:**
- `fadeUp` keyframe: opacity 0→1, translateY 5px→0, 0.2s ease

---

## 6. Sample data (development)

**Do not seed fictional runs in the database or UI.** All dashboard data comes from ingested CausalEdges via the API.

For local development, use **`samples/agents/`** — three real multi-agent workflows backed by OpenAI and Anthropic:

| Workflow | Agents |
|----------|--------|
| `customer-support` | intent_classifier → policy_lookup → response_writer |
| `research-assistant` | query_planner → kb_retriever → summarizer → synthesizer |
| `incident-triage` | alert_classifier → impact_assessor → runbook_selector → action_planner |

```bash
cd samples/agents && npm run real        # success paths
BLAMR_FAILURE_TESTS=1 npm run fail:all # dev-only failure scenarios
```

The platform computes blame, semantic intent drift, and LLM reasons from ingested telemetry — no hardcoded run JSON in the frontend.

---

## 7. Monitoring view

The monitor heatmap displays **only workflows that have ingested runs** (grouped from the API). When no runs exist, show an empty state — do not generate synthetic workflows.

Debounce filter/sort changes at 150ms. Use `requestAnimationFrame` when building large SVG heatmaps.

---

## 8. CausalEdge Ingest Pipeline

Ingest must be non-blocking from the agent's perspective. Design:

1. Agent SDK emits edge via HTTPS POST
2. Ingest service validates API key, validates schema, writes to a `raw_edges` Postgres table
3. Background worker aggregates edges into `workflow_runs`, computing accuracy and triggering blame engine when run completes
4. Blame engine result written to `blame_reports` table
5. Webhook dispatcher fires events based on blame report results

Performance requirements:
- Ingest endpoint p99 latency: < 5ms
- Blame computation: < 1s for up to 50 agents
- Dashboard data freshness: < 5s from run completion

---

## 9. Open-Core Model — What Is Free vs Paid

| Feature | OSS (self-hosted) | Cloud ($299/mo) | Enterprise ($2K+/mo) |
|---|---|---|---|
| Causal graph engine | ✓ | ✓ | ✓ |
| Blame propagation | ✓ | ✓ | ✓ |
| CLI + SDK (TS + Python) | ✓ | ✓ | ✓ |
| MCP middleware | ✓ | ✓ | ✓ |
| LangGraph/CrewAI adapters | ✓ | ✓ | ✓ |
| Self-hosted registry | ✓ | ✓ | ✓ |
| Hosted causal graph store | — | ✓ | ✓ |
| Team dashboards | — | ✓ | ✓ |
| CI/CD regression gates | — | ✓ | ✓ |
| Slack/Teams alerts | — | ✓ | ✓ |
| 30-day trace retention | — | ✓ | ✓ |
| Air-gapped deployment | — | — | ✓ |
| EU AI Act audit export | — | — | ✓ |
| RBAC + SSO/SAML | — | — | ✓ |
| Unlimited retention | — | — | ✓ |
| SLA + dedicated support | — | — | ✓ |

---

## 10. Development Phases

### Phase 1 — v0.1 (weeks 1–6): Core OSS

**Week 1–2:** CausalEdge data model + ingest endpoint + PostgreSQL schema
**Week 3–4:** Blame engine (backward BFS + Shapley) in TypeScript (Rust rewrite in v1)
**Week 4–5:** MCP middleware + TypeScript SDK `wrapClient()`
**Week 5–6:** React frontend (monitor + run detail) + Docker Compose self-host

Deliverable: GitHub release. Engineers can `docker compose up`, add 3 lines to their agent, and see their first blame report.

### Phase 2 — v0.2 (weeks 7–10): Cloud SaaS

Hosted ingest, multi-tenant, API key management UI, team dashboards, webhook delivery, Slack integration.

### Phase 3 — v0.3 (months 4–6): Enterprise

EU AI Act export, RBAC, SSO/SAML, air-gapped deployment, Python SDK, CrewAI/AutoGen adapters, CI/CD regression gates.

---

## 11. Environment Variables

```bash
# Backend
DATABASE_URL=postgresql://blamr:password@localhost:5432/blamr
REDIS_URL=redis://localhost:6379
BLAMR_INGEST_SECRET=...          # signs edge_hash merkle chain
JWT_SECRET=...
WEBHOOK_SIGNING_SECRET=...

# Frontend
VITE_API_BASE_URL=http://localhost:3000
VITE_INGEST_URL=http://localhost:3001

# SDK (consumer-side)
BLAMR_API_KEY=bk_live_...
BLAMR_ENDPOINT=https://ingest.blamr.ai/v1
```

---

## 12. Docker Compose (self-hosted)

```yaml
version: '3.9'
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_DB: blamr
      POSTGRES_USER: blamr
      POSTGRES_PASSWORD: blamr_dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./apps/api
    ports: ["3000:3000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://blamr:blamr_dev@postgres:5432/blamr

  ingest:
    build: ./apps/ingest
    ports: ["3001:3001"]
    depends_on: [postgres]

  web:
    build: ./apps/web
    ports: ["8080:8080"]
    environment:
      VITE_API_BASE_URL: http://localhost:3000
      VITE_INGEST_URL: http://localhost:3001

volumes:
  pgdata:
```

---

## 13. Key Non-Negotiables

1. **Never store plaintext API keys.** bcrypt hash on write, compare hash on read. Show raw key exactly once at creation.

2. **Ingest is non-blocking.** The agent must not wait for blame computation. Ingest endpoint returns in < 5ms. Blame is computed asynchronously.

3. **edge_hash chain.** Every CausalEdge must have `edge_hash = SHA256(prev_hash + JSON.stringify(edge_data) + timestamp_ms)`. The first edge in a run uses `prev_hash = run_id`. This is required for EU AI Act compliance.

4. **Blame engine is deterministic.** Same input always produces same output. No randomness in Shapley computation.

5. **Confidence extraction is heuristic for v0.1.** Do not call an LLM to extract confidence. Use lexical scanning for hedge markers. Document the heuristic clearly. Semantic confidence extraction is v1+.

6. **The frontend has zero external runtime dependencies** beyond React itself. No D3, no Chart.js, no component libraries. All charts are hand-built SVG.

7. **The monitor heatmap uses real ingested runs only.** Show an empty state when no data exists. Debounce filter/sort at 150ms.

---

## 14. Testing Requirements

- Unit tests for blame engine: cover backward BFS, Shapley scoring, confidence inflation detection, intent drift detection
- Integration tests for ingest endpoint: schema validation, rate limiting, edge_hash verification
- E2E tests for the 5 real run scenarios: each must produce the correct root cause agent
- The 5 canonical failure scenarios and their expected blame outputs:
  - run_a1b2c3: root = intent_classifier, 89%
  - run_b2c3d4: root = summarizer, 71%
  - run_c3d4e5: root = qualification_orchestrator, 84%
  - run_d4e5f6: root = entity_extractor, 94%
  - run_e5f6g7: root = web_searcher_2, 45% (success run, lowest blame wins as most responsible for drift)

---

*blamr.ai · github.com/blamr-ai · prithvi@blamr.ai*
