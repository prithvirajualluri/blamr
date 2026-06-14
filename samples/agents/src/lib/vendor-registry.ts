/** Mock enterprise vendor registry + compliance rules for procurement workflow. */

export interface VendorRecord {
  vendor_id: string;
  name: string;
  category: string;
  monthly_cost_usd: number;
  soc2: boolean;
  pen_test_date: string | null;
  data_regions: string[];
  contract_min_months: number;
  latency_ms: number;
}

export interface PricingBenchmark {
  category: string;
  p25: number;
  median: number;
  p75: number;
  latency_ms: number;
}

export interface ComplianceRuleResult {
  passed: boolean;
  violations: string[];
  score: number;
  latency_ms: number;
}

const VENDORS: Record<string, VendorRecord> = {
  'acme-analytics': {
    vendor_id: 'acme-analytics',
    name: 'Acme Analytics Cloud',
    category: 'analytics',
    monthly_cost_usd: 8400,
    soc2: true,
    pen_test_date: '2025-11-01',
    data_regions: ['US', 'EU'],
    contract_min_months: 12,
    latency_ms: 85,
  },
  'cheap-metrics': {
    vendor_id: 'cheap-metrics',
    name: 'CheapMetrics.io',
    category: 'analytics',
    monthly_cost_usd: 2200,
    soc2: false,
    pen_test_date: null,
    data_regions: ['US'],
    contract_min_months: 1,
    latency_ms: 60,
  },
};

const BENCHMARKS: Record<string, PricingBenchmark> = {
  analytics: { category: 'analytics', p25: 3500, median: 6200, p75: 9500, latency_ms: 45 },
  security: { category: 'security', p25: 5000, median: 8000, p75: 12000, latency_ms: 40 },
};

export function lookupVendor(vendorId: string): VendorRecord {
  const v = VENDORS[vendorId.toLowerCase()] ?? VENDORS['acme-analytics'];
  return { ...v };
}

export function pricingBenchmark(category: string): PricingBenchmark {
  return BENCHMARKS[category] ?? BENCHMARKS.analytics;
}

export function priceVsBenchmark(vendor: VendorRecord): { ratio: number; label: string; relevance: number } {
  const bench = pricingBenchmark(vendor.category);
  const ratio = vendor.monthly_cost_usd / bench.median;
  let label = 'at_market';
  let relevance = 0.75;
  if (ratio > 1.25) {
    label = 'above_median';
    relevance = 0.45;
  } else if (ratio < 0.75) {
    label = 'below_median';
    relevance = 0.85;
  }
  return { ratio, label, relevance };
}

export function securityScore(vendor: VendorRecord, requiresSoc2: boolean): { score: number; relevance: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0.5;
  if (vendor.soc2) score += 0.25;
  else flags.push('no_soc2');
  if (vendor.pen_test_date) score += 0.15;
  else flags.push('no_recent_pen_test');
  if (vendor.data_regions.includes('EU')) score += 0.1;
  if (requiresSoc2 && !vendor.soc2) score = Math.min(score, 0.35);
  const relevance = requiresSoc2 && !vendor.soc2 ? 0.3 : Math.min(0.95, score);
  return { score: Math.min(1, score), relevance, flags };
}

export function checkCompliance(
  vendor: VendorRecord,
  budgetUsd: number,
  requiresEuData: boolean,
): ComplianceRuleResult {
  const violations: string[] = [];
  if (vendor.monthly_cost_usd > budgetUsd) violations.push('over_budget');
  if (requiresEuData && !vendor.data_regions.includes('EU')) violations.push('missing_eu_region');
  if (vendor.contract_min_months > 12) violations.push('contract_term_exceeds_policy');
  const score = violations.length === 0 ? 0.92 : Math.max(0.25, 0.85 - violations.length * 0.22);
  return {
    passed: violations.length === 0,
    violations,
    score,
    latency_ms: 35,
  };
}
