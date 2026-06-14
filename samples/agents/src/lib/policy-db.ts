import {
  alignmentCeiling,
  computeConfidenceOut,
  intentDeltaFromAlignment,
} from '@blamr/sdk';

/** Real policy lookup — deterministic tool, not fabricated telemetry. */
export interface PolicyResult {
  category: string;
  summary: string;
  details: Record<string, unknown>;
  latency_ms: number;
}

const LEAVE_POLICY = {
  annual_days: 18,
  accrual: '1.5 days per month',
  carry_forward_max: 5,
  note: 'Leave balance excludes pending approvals.',
};

const PAYROLL_POLICY = {
  pay_cycle: 'monthly',
  cutoff_day: 25,
  note: 'Payroll queries require employee ID verification.',
};

const GENERAL_POLICY = {
  note: 'Contact HR at hr@company.com for unlisted topics.',
};

export function lookupPolicy(category: string): PolicyResult {
  const start = Date.now();
  const normalized = category.toLowerCase();

  if (normalized.includes('leave') || normalized.includes('pto') || normalized.includes('vacation')) {
    return {
      category: 'leave',
      summary: `Annual leave: ${LEAVE_POLICY.annual_days} days/year, accrual ${LEAVE_POLICY.accrual}.`,
      details: LEAVE_POLICY,
      latency_ms: Date.now() - start + 40,
    };
  }
  if (normalized.includes('payroll') || normalized.includes('salary') || normalized.includes('pay')) {
    return {
      category: 'payroll',
      summary: PAYROLL_POLICY.note,
      details: PAYROLL_POLICY,
      latency_ms: Date.now() - start + 35,
    };
  }
  return {
    category: 'general',
    summary: GENERAL_POLICY.note,
    details: GENERAL_POLICY,
    latency_ms: Date.now() - start + 30,
  };
}

export function intentDelta(intentCategory: string, policyCategory: string): number {
  return intentDeltaFromAlignment(intentCategory, policyCategory);
}

/** Tool confidence from domain alignment — misroutes score low, not inflated. */
export function policyConfidence(
  intentCategory: string,
  policyCategory: string,
  confidenceIn?: number,
): number {
  const delta = intentDelta(intentCategory, policyCategory);
  const aligned = intentCategory.toLowerCase() === policyCategory.toLowerCase();
  const base = aligned ? 0.92 : 0.72;
  return computeConfidenceOut({
    confidenceIn,
    intentDelta: delta,
    toolScore: Math.min(base, alignmentCeiling(delta)),
    callType: 'Tool call',
  });
}
