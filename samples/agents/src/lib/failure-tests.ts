/** Dev-only gate for intentional failure scenarios (fail:* scripts, BLAMR_FORCE_FAIL). */
export function requireFailureTestsEnabled(context: string): void {
  if (process.env.BLAMR_FAILURE_TESTS === '1') return;
  console.error(`\n${context} is dev-only. Set BLAMR_FAILURE_TESTS=1 to run.`);
  console.error('  Add BLAMR_FAILURE_TESTS=1 to samples/agents/.env');
  console.error('  Or: BLAMR_FAILURE_TESTS=1 npm run fail:all\n');
  process.exit(1);
}

export function resolveForceFail(): boolean {
  if (process.env.BLAMR_FORCE_FAIL !== '1') return false;
  if (process.env.BLAMR_FAILURE_TESTS !== '1') {
    console.warn('BLAMR_FORCE_FAIL ignored — set BLAMR_FAILURE_TESTS=1 to enable forced failures.');
    return false;
  }
  return true;
}
