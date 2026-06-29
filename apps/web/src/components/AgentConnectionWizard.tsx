import React, { useState } from 'react';
import { createKey } from '../api/runs';
import { sendOnboardingTestEdge } from '../api/ingest';
import { buildAgentEnvBlock, INGEST_ENDPOINT } from '../config';
import type { OnboardingTrigger } from '../auth/onboarding';

export type OnboardingVariant = OnboardingTrigger | 'empty-workspace';

type WizardStep = 'key' | 'env' | 'test' | 'success';

interface AgentConnectionWizardProps {
  open: boolean;
  variant: OnboardingVariant;
  userName: string;
  isAdmin: boolean;
  onSkip: () => void;
  onDismiss: () => void;
  onTestSuccess: (runId: string) => void;
  onGoToConnect: () => void;
}

const DOCS = 'https://github.com/prithvirajualluri/blamr/blob/main/docs/INSTALL.md';

export function AgentConnectionWizard({
  open,
  variant,
  userName,
  isAdmin,
  onSkip,
  onDismiss,
  onTestSuccess,
  onGoToConnect,
}: AgentConnectionWizardProps) {
  const [step, setStep] = useState<WizardStep>('key');
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('Dashboard onboarding');
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const isNewWorkspace = variant === 'workspace-created';
  const title = isNewWorkspace
    ? `Welcome, ${userName.split(' ')[0] || 'there'}`
    : variant === 'member-joined'
      ? `You're in, ${userName.split(' ')[0] || 'there'}`
      : 'Connect your first agent';

  const subtitle =
    step === 'success'
      ? 'Telemetry is flowing. Open the test run or connect a real agent.'
      : isNewWorkspace
        ? 'Create a key, copy your env, and send a test edge — all from here.'
        : variant === 'member-joined'
          ? 'Paste your ingest key and verify the connection before running agents.'
          : 'No runs yet. Verify ingest in under two minutes without leaving the dashboard.';

  const envBlock = apiKey ? buildAgentEnvBlock(apiKey) : '';

  const handleCreateKey = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createKey({
        name: keyName || 'Dashboard onboarding',
        environment: 'live',
        scopes: ['ingest:write', 'runs:read'],
      });
      setApiKey(res.raw_key);
      setStep('env');
    } catch {
      setError('Failed to create API key. Check permissions and try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyEnv = () => {
    if (!envBlock) return;
    navigator.clipboard.writeText(envBlock).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setError('Enter your ingest API key first.');
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const result = await sendOnboardingTestEdge(apiKey.trim());
      setRunId(result.run_id);
      setStep('success');
      onTestSuccess(result.run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const stepIndex = step === 'key' ? 1 : step === 'env' ? 2 : step === 'test' ? 3 : 4;

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div className="onboard-panel wizard-panel">
        <div className="onboard-eyebrow">Connection wizard · step {stepIndex} of 4</div>
        <h2 id="wizard-title" className="onboard-title">{title}</h2>
        <p className="onboard-subtitle">{subtitle}</p>

        <div className="wizard-progress">
          {(['key', 'env', 'test', 'success'] as WizardStep[]).map((s, i) => (
            <div key={s} className={`wizard-progress-seg${stepIndex > i ? ' done' : step === s ? ' active' : ''}`} />
          ))}
        </div>

        {step === 'key' && (
          <div className="wizard-step-body">
            {isAdmin ? (
              <>
                <label className="wizard-label" htmlFor="key-name">Key name</label>
                <input
                  id="key-name"
                  className="wizard-input"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Dashboard onboarding"
                />
                <p className="wizard-hint">
                  Creates a live key with <code>ingest:write</code>. Copy it on the next step — it is shown once.
                </p>
                <button type="button" className="btn-primary onboard-primary" disabled={creating} onClick={handleCreateKey}>
                  {creating ? 'Creating…' : 'Create ingest API key'}
                </button>
              </>
            ) : (
              <>
                <label className="wizard-label" htmlFor="paste-key">Ingest API key</label>
                <input
                  id="paste-key"
                  className="wizard-input mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="bk_live_…"
                  autoComplete="off"
                />
                <p className="wizard-hint">Ask a workspace admin for a key with <code>ingest:write</code>.</p>
                <button
                  type="button"
                  className="btn-primary onboard-primary"
                  disabled={!apiKey.trim()}
                  onClick={() => setStep('env')}
                >
                  Continue →
                </button>
              </>
            )}
          </div>
        )}

        {step === 'env' && (
          <div className="wizard-step-body">
            <div className="wizard-warn">
              Point agents at the <strong>ingest</strong> service — <code>{INGEST_ENDPOINT}</code> — not the dashboard API on port 3000.
            </div>
            <pre className="onboard-code wizard-env-block">{envBlock}</pre>
            <div className="wizard-actions-row">
              <button type="button" className="btn-primary" onClick={handleCopyEnv}>
                {copied ? 'Copied!' : 'Copy .env block'}
              </button>
              <button type="button" className="btn" onClick={() => setStep('test')}>
                Next: test connection →
              </button>
            </div>
          </div>
        )}

        {step === 'test' && (
          <div className="wizard-step-body">
            <p className="wizard-hint">
              Sends one test edge from your browser to ingest. No local agents or Ollama required.
            </p>
            <button type="button" className="btn-primary onboard-primary" disabled={testing || !apiKey.trim()} onClick={handleTest}>
              {testing ? 'Sending test edge…' : 'Send test connection'}
            </button>
            {error && <div className="wizard-error">{error}</div>}
          </div>
        )}

        {step === 'success' && runId && (
          <div className="wizard-step-body">
            <div className="wizard-success">
              <span className="wizard-success-icon">✓</span>
              <div>
                <strong>Connection verified</strong>
                <p>Run <code className="mono">{runId}</code> was ingested. It may take a few seconds to appear on Overview.</p>
              </div>
            </div>
            <div className="wizard-actions-row">
              <button type="button" className="btn-primary" onClick={onGoToConnect}>
                Connect real agent →
              </button>
            </div>
          </div>
        )}

        {error && step !== 'test' && <div className="wizard-error">{error}</div>}

        <div className="onboard-actions wizard-footer">
          {step === 'success' ? (
            <button type="button" className="btn-primary onboard-primary" onClick={onDismiss}>
              Open dashboard
            </button>
          ) : (
            <>
              {step !== 'key' && (
                <button
                  type="button"
                  className="onboard-docs"
                  onClick={() => {
                    setError(null);
                    setStep(step === 'env' ? 'key' : 'env');
                  }}
                >
                  ← Back
                </button>
              )}
              <button type="button" className="onboard-docs" onClick={onSkip}>
                I'll connect later
              </button>
            </>
          )}
          <a className="onboard-docs" href={DOCS} target="_blank" rel="noreferrer">
            Install guide
          </a>
        </div>
      </div>
    </div>
  );
}
