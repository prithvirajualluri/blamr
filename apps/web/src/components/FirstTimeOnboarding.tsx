import React from 'react';
import type { OnboardingTrigger } from '../auth/onboarding';

export type OnboardingVariant = OnboardingTrigger | 'empty-workspace';

interface FirstTimeOnboardingProps {
  open: boolean;
  variant: OnboardingVariant;
  userName: string;
  isAdmin: boolean;
  onDismiss: () => void;
  onGoToSettings: () => void;
  onGoToConnect: () => void;
}

const DOCS = 'https://github.com/prithvirajualluri/blamr/blob/main/docs/INSTALL.md';

export function FirstTimeOnboarding({
  open,
  variant,
  userName,
  isAdmin,
  onDismiss,
  onGoToSettings,
  onGoToConnect,
}: FirstTimeOnboardingProps) {
  if (!open) return null;

  const isNewWorkspace = variant === 'workspace-created';
  const title = isNewWorkspace
    ? `Welcome, ${userName.split(' ')[0] || 'there'}`
    : variant === 'member-joined'
      ? `You're in, ${userName.split(' ')[0] || 'there'}`
      : 'Get started with blamr';

  const subtitle = isNewWorkspace
    ? 'Your workspace is ready. Follow these steps to connect agents and see your first causal run.'
    : variant === 'member-joined'
      ? 'Your account is active. Here is how to connect agents and explore runs.'
      : 'No runs yet — connect agents to populate Overview and blame graphs.';

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="onboard-panel">
        <div className="onboard-eyebrow">First-time setup</div>
        <h2 id="onboard-title" className="onboard-title">{title}</h2>
        <p className="onboard-subtitle">{subtitle}</p>

        <ol className="onboard-steps">
          {isAdmin && (
            <li className="onboard-step">
              <span className="onboard-step-num">1</span>
              <div>
                <strong>Create an ingest API key</strong>
                <p>
                  Open <em>API &amp; keys</em> → create a key with scope{' '}
                  <code>ingest:write</code>. Copy it once — you will need it for agents.
                </p>
                <button type="button" className="onboard-link-btn" onClick={onGoToSettings}>
                  Go to API &amp; keys →
                </button>
              </div>
            </li>
          )}
          {!isAdmin && (
            <li className="onboard-step">
              <span className="onboard-step-num">1</span>
              <div>
                <strong>Get an ingest API key</strong>
                <p>Ask a workspace admin for a key with <code>ingest:write</code>, or use one they shared with you.</p>
              </div>
            </li>
          )}
          <li className="onboard-step">
            <span className="onboard-step-num">{isAdmin ? '2' : '2'}</span>
            <div>
              <strong>Connect your agents</strong>
              <p>
                Point telemetry at the <strong>ingest</strong> service (not the dashboard API):
              </p>
              <pre className="onboard-code">{`BLAMR_ENDPOINT=http://localhost:3001/v1
BLAMR_API_KEY=bk_live_...your_key`}</pre>
              <button type="button" className="onboard-link-btn" onClick={onGoToConnect}>
                Open Connect agents →
              </button>
            </div>
          </li>
          <li className="onboard-step">
            <span className="onboard-step-num">{isAdmin ? '3' : '3'}</span>
            <div>
              <strong>Run a workflow</strong>
              <p>From the repo on your host (with Ollama running for samples):</p>
              <pre className="onboard-code">{`cp samples/agents/.env.example samples/agents/.env
# set BLAMR_API_KEY in .env
./scripts/run-workflow.sh support`}</pre>
            </div>
          </li>
          <li className="onboard-step">
            <span className="onboard-step-num">{isAdmin ? '4' : '4'}</span>
            <div>
              <strong>Watch blame on Overview</strong>
              <p>
                Runs appear in <em>Overview</em> and <em>Executions</em>. Open a failed run for the blame graph and root-cause ranking.
              </p>
            </div>
          </li>
        </ol>

        <div className="onboard-actions">
          <button type="button" className="btn-primary onboard-primary" onClick={onDismiss}>
            {isNewWorkspace ? 'Got it — open dashboard' : 'Got it'}
          </button>
          <a className="onboard-docs" href={DOCS} target="_blank" rel="noreferrer">
            Full install guide
          </a>
        </div>
      </div>
    </div>
  );
}
