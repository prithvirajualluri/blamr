import React, { useCallback, useEffect, useState } from 'react';
import type { UserRole, WorkspaceMemberView, WorkspaceInviteView } from '@blamr/types';
import {
  fetchMembers,
  fetchInvites,
  inviteUser,
  createUser,
  updateMemberRole,
  removeMember,
  revokeInvite,
} from '../api/auth';
import { useAuth, useIsAdmin } from '../auth/AuthContext';
import { EmptyState } from '../components/ApiBanner';

type ToastFn = (type: 'info' | 'success' | 'warn' | 'error', message: string) => void;

const ROLES: UserRole[] = ['admin', 'member', 'viewer'];

function roleLabel(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function UsersView({ onToast }: { onToast?: ToastFn }) {
  const toast = onToast ?? (() => {});
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [members, setMembers] = useState<WorkspaceMemberView[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'members' | 'invite' | 'create'>('members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'member' as UserRole });
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const m = await fetchMembers();
      setMembers(m);
      if (isAdmin) {
        const i = await fetchInvites();
        setInvites(i);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { reload(); }, [reload]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const inv = await inviteUser({ email: inviteEmail, role: inviteRole });
      const link = `${window.location.origin}${window.location.pathname}?invite=${inv.token}`;
      setLastInviteLink(link);
      setInviteEmail('');
      reload();
      toast('success', 'Invite created');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Invite failed');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(createForm);
      setCreateForm({ name: '', email: '', password: '', role: 'member' });
      reload();
      toast('success', 'User created');
      setTab('members');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      await updateMemberRole(userId, role);
      reload();
      toast('success', 'Role updated');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member from the workspace?')) return;
    try {
      await removeMember(userId);
      reload();
      toast('success', 'Member removed');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Remove failed');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      reload();
      toast('success', 'Invite revoked');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Revoke failed');
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link).catch(() => {});
    toast('success', 'Invite link copied');
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--mu)' }}>Loading team…</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Team</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--mu)' }}>
            Signed in as {user?.email} ({roleLabel(user?.role ?? 'member')})
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            {(['members', 'invite', 'create'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`chip${tab === t ? ' on' : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'members' ? 'Members' : t === 'invite' ? 'Invite' : 'Create user'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--reD)', border: '1px solid rgba(220,38,38,.28)', borderRadius: 'var(--rad)', padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: 'var(--reL)' }}>
          {error}
        </div>
      )}

      {tab === 'members' && (
        <>
          {members.length === 0 ? (
            <EmptyState title="No members yet" subtitle="Invite or create users to build your team" />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    {isAdmin && <th />}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.user_id}>
                      <td>{m.name}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{m.email}</td>
                      <td>
                        {isAdmin && m.user_id !== user?.id ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.user_id, e.target.value as UserRole)}
                            style={{ background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--b0)', borderRadius: 4, padding: '4px 8px' }}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{roleLabel(r)}</option>
                            ))}
                          </select>
                        ) : (
                          roleLabel(m.role)
                        )}
                      </td>
                      <td style={{ color: 'var(--mu)', fontSize: 12 }}>{new Date(m.joined_at).toLocaleDateString()}</td>
                      {isAdmin && (
                        <td>
                          {m.user_id !== user?.id && (
                            <button type="button" className="chip" onClick={() => handleRemove(m.user_id)}>Remove</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {isAdmin && invites.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Pending invites</h3>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th>Link</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{roleLabel(inv.role)}</td>
                        <td style={{ fontSize: 12, color: 'var(--mu)' }}>{new Date(inv.expires_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            type="button"
                            className="chip"
                            onClick={() => copyLink(`${window.location.origin}${window.location.pathname}?invite=${inv.token}`)}
                          >
                            Copy link
                          </button>
                        </td>
                        <td>
                          <button type="button" className="chip" onClick={() => handleRevokeInvite(inv.id)}>Revoke</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {isAdmin && tab === 'invite' && (
        <form onSubmit={handleInvite} style={{ maxWidth: 420 }}>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Email</span>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          </label>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Role</span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              style={{ width: '100%', background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--b0)', borderRadius: 4, padding: '8px 10px' }}
            >
              {ROLES.filter((r) => r !== 'admin' || true).map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="auth-btn" style={{ width: 'auto' }}>Send invite</button>
          {lastInviteLink && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg2)', borderRadius: 'var(--rad)', fontSize: 12 }}>
              <div style={{ color: 'var(--mu)', marginBottom: 6 }}>Share this link with the invitee:</div>
              <code style={{ wordBreak: 'break-all', fontFamily: 'var(--mono)' }}>{lastInviteLink}</code>
              <button type="button" className="chip" style={{ marginTop: 8 }} onClick={() => copyLink(lastInviteLink)}>Copy</button>
            </div>
          )}
        </form>
      )}

      {isAdmin && tab === 'create' && (
        <form onSubmit={handleCreate} style={{ maxWidth: 420 }}>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Name</span>
            <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
          </label>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Email</span>
            <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
          </label>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Password</span>
            <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={8} />
          </label>
          <label className="auth-field" style={{ display: 'block', marginBottom: 12 }}>
            <span>Role</span>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
              style={{ width: '100%', background: 'var(--bg2)', color: 'var(--tx)', border: '1px solid var(--b0)', borderRadius: 4, padding: '8px 10px' }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="auth-btn" style={{ width: 'auto' }}>Create user</button>
        </form>
      )}
    </div>
  );
}
