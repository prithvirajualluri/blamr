export interface WorkflowRunOptions {
  apiKey: string;
  endpoint?: string;
  /** Mark run failed after all hops (for testing blame UI with full traces). */
  forceFail?: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  runId: string;
  status: 'success' | 'failed';
  errorSummary?: string;
}
