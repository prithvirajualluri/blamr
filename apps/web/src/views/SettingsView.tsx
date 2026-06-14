import React, { useEffect, useState, useCallback } from 'react';
import { fetchKeys, fetchWebhooks, fetchWorkspace, patchWorkspaceSettings, createKey, revokeKey, createWebhook, deleteWebhook, testWebhook } from '../api/runs';
import { ApiBanner, EmptyState } from '../components/ApiBanner';
import { IconChart, IconBell } from '../components/icons';
import { hasApiCredentials } from '../api/client';

type SettingsTab = 'keys' | 'usage' | 'webhooks' | 'workspace';
type ToastFn = (type: 'info' | 'success' | 'warn' | 'error', message: string) => void;

interface KeyRow {
  id: string;
  name: string;
  environment: 'live' | 'test';
  key_prefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at: string | null;
  call_count: number;
}

function StatCard({ lbl, val, sub, vc = '' }: { lbl: string; val: string; sub: string; vc?: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--b0)', borderRadius: 'var(--rad)', padding: '12px 13px' }}>
      <div style={{ fontSize: 10, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{lbl}</div>
      <div className={vc} style={{ fontSize: 21, fontWeight: 700, fontFamily: 'var(--mono)' }}>{val}</div>
      <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 3 }}>{sub}</div>
    </div>
  );
}

export function SettingsView({ onToast }: { onToast?: ToastFn }) {
  const toast = onToast ?? (() => {});
  const [tab, setTab] = useState<SettingsTab>('keys');
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [webhooks, setWebhooks] = useState<Record<string, unknown>[]>([]);
  const [workspace, setWorkspace] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [revealedKey, setRevealedKey] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [wfJson, setWfJson] = useState('');
  const [wfSaving, setWfSaving] = useState(false);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');
  const [whSecret, setWhSecret] = useState('');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    const settings = workspace?.settings as { workflow_configs?: Record<string, unknown> } | undefined;
    if (settings?.workflow_configs) {
      setWfJson(JSON.stringify(settings.workflow_configs, null, 2));
    }
  }, [workspace]);

  const reload = useCallback(async () => {
    if (!hasApiCredentials()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [k, w, ws] = await Promise.all([
        fetchKeys(),
        fetchWebhooks(),
        fetchWorkspace(),
      ]);
      setKeys(k as unknown as KeyRow[]);
      setWebhooks(w);
      setWorkspace(ws);
      setWorkspaceError(ws ? null : 'Could not load workspace settings');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const activeKeys = keys.filter((k) => k.status === 'active').length;
  const totalCalls = keys.reduce((a, k) => a + Number(k.call_count ?? 0), 0);

  const generateKey = async () => {
    try {
      const res = await createKey({ name: newKeyName || 'New key', environment: 'live', scopes: ['ingest:write', 'runs:read'] });
      setRevealedKey(res.raw_key);
      setShowCreate(false);
      setShowReveal(true);
      reload();
      toast('success', 'API key created');
    } catch {
      toast('error', 'Failed to create key');
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    try {
      await revokeKey(id);
      toast('warn', `Revoked key: ${name}`);
      reload();
    } catch {
      toast('error', 'Failed to revoke key');
    }
  };

  return (
    <div className="page-enter" style={{ maxWidth: 900 }}>
      <ApiBanner error={error} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>API &amp; key management</div>
          <div style={{ fontSize: 13, color: 'var(--muL)' }}>Create and manage API keys for connecting your agents to blamr.</div>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)} disabled={!hasApiCredentials()}>+ Create API key</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard lbl="Active keys" val={String(activeKeys)} sub={`of ${keys.length} total`} vc="c-grn" />
        <StatCard lbl="Total API calls" val={totalCalls.toLocaleString()} sub="all keys" vc="c-cyn" />
        <StatCard lbl="Webhooks" val={String(webhooks.length)} sub="configured" />
        <StatCard lbl="Plan" val={String(workspace?.plan ?? '—')} sub="workspace" />
      </div>

      <div className="settings-tabs">
        {(['keys', 'usage', 'webhooks', 'workspace'] as SettingsTab[]).map((t) => (
          <button key={t} type="button" className={`settings-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t === 'keys' ? 'API keys' : t === 'usage' ? 'Usage & limits' : t === 'webhooks' ? 'Webhooks' : 'Workspace'}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--muL)', padding: 16 }}>Loading…</div>}

      {!loading && tab === 'keys' && (
        keys.length ? keys.map((k) => {
          const isRevoked = k.status === 'revoked';
          const shown = revealedIds.has(k.id);
          return (
            <div key={k.id} className="panel" style={{ opacity: isRevoked ? 0.5 : 1, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <strong>{k.name}</strong>
                <span className={`bdg ${k.environment === 'live' ? 'bdg-red' : 'bdg-mu'}`}>{k.environment}</span>
                <span className={`bdg ${isRevoked ? 'bdg-red' : 'bdg-grn'}`}>{isRevoked ? 'Revoked' : 'Active'}</span>
                {!isRevoked && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => { navigator.clipboard.writeText(k.key_prefix).catch(() => {}); toast('success', 'Prefix copied'); }}>Copy prefix</button>
                    <button type="button" className="btn" style={{ fontSize: 11, color: 'var(--reL)' }} onClick={() => handleRevoke(k.id, k.name)}>Revoke</button>
                  </div>
                )}
              </div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--muL)', background: 'var(--bg3)', padding: '7px 10px', borderRadius: 4, marginBottom: 8 }}>
                {shown ? k.key_prefix : `${k.key_prefix}••••••••`}
                {!isRevoked && <button type="button" className="btn" style={{ float: 'right', fontSize: 10, padding: '2px 8px' }} onClick={() => setRevealedIds((s) => { const n = new Set(s); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n; })}>{shown ? 'Hide' : 'Show'}</button>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--mu)' }}>{Number(k.call_count).toLocaleString()} calls · last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'never'}</div>
            </div>
          );
        }) : <EmptyState title="No API keys" subtitle="Create a key to connect agents to blamr." />
      )}

      {!loading && tab === 'usage' && (
        <div className="panel">
          <div className="panel-hdr"><IconChart /> Usage <span className="panel-sub">per-key call counts</span></div>
          {keys.length ? keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--b0)', fontSize: 12 }}>
              <span style={{ flex: 1 }}>{k.name}</span>
              <span className="mono">{Number(k.call_count).toLocaleString()} calls</span>
            </div>
          )) : <EmptyState title="No usage data" subtitle="Usage appears after keys are used." />}
        </div>
      )}

      {!loading && tab === 'webhooks' && (
        <div className="panel">
          <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><IconBell /> Webhooks</span>
            <button type="button" className="btn btn-sm" onClick={() => setShowWebhookForm(true)}>+ Add webhook</button>
          </div>
          {webhooks.length ? webhooks.map((wh) => (
            <div key={String(wh.id)} style={{ background: 'var(--bg3)', borderRadius: 'var(--rad)', padding: 12, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong>{String(wh.name)}</strong>
                <div className="mono" style={{ fontSize: 11, color: 'var(--muL)', marginTop: 4 }}>{String(wh.url)}</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={async () => {
                try {
                  await testWebhook(String(wh.id));
                  toast('success', 'Test event sent');
                } catch {
                  toast('error', 'Test failed');
                }
              }}>Test</button>
              <button type="button" className="btn btn-sm" style={{ color: 'var(--reL)' }} onClick={async () => {
                try {
                  await deleteWebhook(String(wh.id));
                  toast('warn', 'Webhook deleted');
                  reload();
                } catch {
                  toast('error', 'Delete failed');
                }
              }}>Delete</button>
            </div>
          )) : <EmptyState title="No webhooks" subtitle="Add a webhook endpoint to receive blame and run events." actionLabel="+ Add webhook" onAction={() => setShowWebhookForm(true)} />}
        </div>
      )}

      {!loading && tab === 'workspace' && !workspace && (
        <EmptyState title="Workspace unavailable" subtitle={workspaceError ?? 'Could not load workspace. Check API connection and permissions.'} />
      )}

      {!loading && tab === 'workspace' && workspace && (
        <>
          <div className="panel">
            <div className="panel-hdr">Workspace</div>
            {([['Name', workspace.name], ['ID', workspace.id], ['Plan', workspace.plan], ['Owner', workspace.owner_email]] as [string, unknown][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--b0)' }}>
                <span style={{ color: 'var(--muL)' }}>{l}</span>
                <span className="mono" style={{ fontSize: 12 }}>{String(v ?? '—')}</span>
              </div>
            ))}
          </div>
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="panel-hdr">Workflow profiles</div>
            <p style={{ fontSize: 12, color: 'var(--muL)', marginBottom: 8 }}>
              Optional per-workflow gate thresholds and domain hints. Unknown workflows work without config; quality improves when set.
            </p>
            <textarea
              value={wfJson}
              onChange={(e) => setWfJson(e.target.value)}
              rows={14}
              className="mono"
              style={{ width: '100%', fontSize: 11, background: 'var(--bg3)', border: '1px solid var(--b0)', borderRadius: 4, padding: 10 }}
              placeholder={'{\n  "my-workflow": {\n    "confidence_accept_level": 0.75,\n    "confidence_gate_mode": "min",\n    "domain_type": "generic"\n  }\n}'}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: 10 }}
              disabled={wfSaving || !hasApiCredentials()}
              onClick={async () => {
                try {
                  setWfSaving(true);
                  const parsed = JSON.parse(wfJson) as Record<string, unknown>;
                  await patchWorkspaceSettings({ workflow_configs: parsed });
                  toast('success', 'Workflow profiles saved');
                  reload();
                } catch {
                  toast('error', 'Invalid JSON or save failed');
                } finally {
                  setWfSaving(false);
                }
              }}
            >
              {wfSaving ? 'Saving…' : 'Save workflow profiles'}
            </button>
          </div>
        </>
      )}

      {showWebhookForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 'var(--rad-lg)', padding: 24, maxWidth: 500, width: '90%' }}>
            <h3 style={{ marginBottom: 16 }}>Add webhook</h3>
            <input placeholder="Name" value={whName} onChange={(e) => setWhName(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder="URL" value={whUrl} onChange={(e) => setWhUrl(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            <input placeholder="Signing secret" value={whSecret} onChange={(e) => setWhSecret(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowWebhookForm(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={async () => {
                try {
                  await createWebhook({ name: whName || 'Webhook', url: whUrl, secret: whSecret || 'changeme', events: ['run.completed', 'blame.ready'] });
                  toast('success', 'Webhook created');
                  setShowWebhookForm(false);
                  setWhName(''); setWhUrl(''); setWhSecret('');
                  reload();
                } catch {
                  toast('error', 'Failed to create webhook');
                }
              }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 'var(--rad-lg)', padding: 24, maxWidth: 500, width: '90%' }}>
            <h3 style={{ marginBottom: 16 }}>Create new API key</h3>
            <input placeholder="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={generateKey}>Generate key</button>
            </div>
          </div>
        </div>
      )}

      {showReveal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--b1)', borderRadius: 'var(--rad-lg)', padding: 24, maxWidth: 520, width: '90%' }}>
            <h3 style={{ marginBottom: 8 }}>API key created</h3>
            <p style={{ fontSize: 12, color: 'var(--grL)', marginBottom: 12 }}>Copy this key now. It will not be shown again.</p>
            <div className="mono" style={{ background: 'var(--bg3)', padding: 12, borderRadius: 4, wordBreak: 'break-all', marginBottom: 16 }}>{revealedKey}</div>
            <button type="button" className="btn-primary" onClick={() => { navigator.clipboard.writeText(revealedKey).catch(() => {}); toast('success', 'Key copied'); setShowReveal(false); }}>Copy &amp; close</button>
          </div>
        </div>
      )}
    </div>
  );
}
