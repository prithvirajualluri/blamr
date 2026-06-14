/** Incident runbook lookup — deterministic tool. */
export interface RunbookMatch {
  severity: string;
  runbook_id: string;
  title: string;
  steps: string[];
  latency_ms: number;
}

const RUNBOOKS: Record<string, Omit<RunbookMatch, 'latency_ms'>> = {
  P1: {
    severity: 'P1',
    runbook_id: 'rb-p1-outage',
    title: 'Critical production outage',
    steps: [
      'Page on-call lead and open incident channel',
      'Capture error rate and affected services',
      'Rollback last deploy if correlated',
      'Post status update every 15 minutes',
    ],
  },
  P2: {
    severity: 'P2',
    runbook_id: 'rb-p2-degraded',
    title: 'Major degradation',
    steps: [
      'Assign incident commander',
      'Identify blast radius and mitigations',
      'Schedule fix within SLA window',
    ],
  },
  P3: {
    severity: 'P3',
    runbook_id: 'rb-p3-minor',
    title: 'Minor incident',
    steps: [
      'Log ticket with reproduction steps',
      'Monitor for 24h escalation',
      'Fix in next sprint if no customer impact',
    ],
  },
};

export function lookupRunbook(severity: string): RunbookMatch {
  const start = Date.now();
  const key = severity.toUpperCase().startsWith('P') ? severity.toUpperCase().slice(0, 2) : 'P3';
  const book = RUNBOOKS[key] ?? RUNBOOKS.P3;
  return { ...book, latency_ms: Date.now() - start + 35 };
}

const SEVERITY_TOOL_SCORE: Record<string, number> = {
  P1: 0.94,
  P2: 0.88,
  P3: 0.82,
};

/** Runbook lookup confidence from severity clarity and upstream assessor confidence. */
export function runbookConfidence(severity: string, confidenceIn: number): number {
  const key = severity.toUpperCase().startsWith('P') ? severity.toUpperCase().slice(0, 2) : 'P3';
  const toolScore = SEVERITY_TOOL_SCORE[key] ?? 0.8;
  return Math.min(confidenceIn * 0.98, toolScore);
}
