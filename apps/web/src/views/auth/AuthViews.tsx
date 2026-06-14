import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { fetchInvitePreview } from '../../api/auth';

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">blamr</div>
        <h1 className="auth-title">{title}</h1>
        {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function LoginView() {
  const { login, setAuthScreen } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Access your workspace">
      <form onSubmit={submit} className="auth-form">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-btn" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footer">
        New organization?{' '}
        <button type="button" className="auth-link" onClick={() => setAuthScreen('register-tenant')}>
          Register workspace
        </button>
      </p>
    </AuthShell>
  );
}

export function RegisterTenantView() {
  const { registerTenant, setAuthScreen } = useAuth();
  const [workspaceName, setWorkspaceName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await registerTenant({ workspace_name: workspaceName, email, password, name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title="Register workspace" subtitle="Create your tenant and admin account">
      <form onSubmit={submit} className="auth-form">
        <Field label="Workspace name">
          <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required />
        </Field>
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Field label="Admin email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password (min 8 chars)">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-btn" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
      <p className="auth-footer">
        Already have an account?{' '}
        <button type="button" className="auth-link" onClick={() => setAuthScreen('login')}>
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}

export function AcceptInviteView() {
  const { registerUser, inviteToken } = useAuth();
  const [preview, setPreview] = useState<{ email: string; role: string; workspace_name: string } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (!inviteToken) return;
    fetchInvitePreview(inviteToken)
      .then(setPreview)
      .catch(() => setError('Invalid or expired invite link'));
  }, [inviteToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await registerUser({ invite_token: inviteToken, password, name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!inviteToken) {
    return (
      <AuthShell title="Invalid invite">
        <p className="auth-subtitle">No invite token found in the link.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Join workspace"
      subtitle={preview ? `${preview.workspace_name} · ${preview.role}` : 'Loading invite…'}
    >
      <form onSubmit={submit} className="auth-form">
        {preview && (
          <Field label="Email">
            <input type="email" value={preview.email} readOnly />
          </Field>
        )}
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Field label="Password (min 8 chars)">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="auth-btn" disabled={submitting || !preview}>
          {submitting ? 'Joining…' : 'Accept invite'}
        </button>
      </form>
    </AuthShell>
  );
}
