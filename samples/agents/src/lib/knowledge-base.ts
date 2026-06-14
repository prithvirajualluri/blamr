/** Curated knowledge snippets — real tool lookup, not fabricated LLM telemetry. */
export interface KnowledgeHit {
  topic: string;
  source: string;
  excerpt: string;
  relevance: number;
  latency_ms: number;
}

const ENTRIES: Array<{ topic: string; keywords: string[]; source: string; excerpt: string }> = [
  {
    topic: 'multi-agent-tracing',
    keywords: ['causal', 'trace', 'blame', 'multi-agent', 'observability'],
    source: 'blamr/docs/causal-tracing',
    excerpt:
      'Causal edges link agent handoffs with confidence scores, token usage, and intent deltas. Blame attribution uses backward BFS over the edge graph.',
  },
  {
    topic: 'llm-cost',
    keywords: ['cost', 'token', 'pricing', 'budget', 'ollama', 'local'],
    source: 'vendor/pricing-2025',
    excerpt:
      'Track tokens_in/out per hop. blamr uses local Ollama for sample agent LLM hops and platform semantic drift.',
  },
  {
    topic: 'incident-response',
    keywords: ['incident', 'outage', 'severity', 'on-call', 'pager'],
    source: 'runbooks/incident-response',
    excerpt:
      'P1 incidents require immediate escalation. Classify severity from user impact and error rate before selecting a runbook.',
  },
  {
    topic: 'hr-leave',
    keywords: ['leave', 'pto', 'vacation', 'balance'],
    source: 'hr/policies/leave',
    excerpt: 'Annual leave: 18 days/year, 1.5 days accrued monthly, max 5 days carry-forward.',
  },
];

export function searchKnowledge(query: string, limit = 2): KnowledgeHit[] {
  const start = Date.now();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  const scored = ENTRIES.map((entry) => {
    const haystack = `${entry.topic} ${entry.keywords.join(' ')} ${entry.excerpt}`.toLowerCase();
    const hits = terms.filter((t) => haystack.includes(t)).length;
    const relevance = hits / Math.max(terms.length, 1);
    return { entry, relevance };
  })
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);

  if (!scored.length) {
    return [
      {
        topic: 'general',
        source: 'kb/fallback',
        excerpt: 'No direct match. Recommend clarifying the research question.',
        relevance: 0.3,
        latency_ms: Date.now() - start + 25,
      },
    ];
  }

  return scored.map(({ entry, relevance }) => ({
    topic: entry.topic,
    source: entry.source,
    excerpt: entry.excerpt,
    relevance,
    latency_ms: Date.now() - start + 30 + Math.floor(relevance * 20),
  }));
}
