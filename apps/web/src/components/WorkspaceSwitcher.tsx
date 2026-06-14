import React, { useEffect, useState } from 'react';
import { fetchWorkspaces, switchWorkspace } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { setStoredToken } from '../auth/storage';
import { hasApiCredentials } from '../api/client';

interface WorkspaceSwitcherProps {
  onSwitched?: () => void;
}

export function WorkspaceSwitcher({ onSwitched }: WorkspaceSwitcherProps) {
  const { user, refreshUser } = useAuth();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !hasApiCredentials()) {
      setWorkspaces([]);
      return;
    }
    fetchWorkspaces()
      .then((list) => setWorkspaces(list.map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => setWorkspaces([]));
  }, [user?.workspace_id, user?.id]);

  if (!user || workspaces.length === 0) return null;

  const current = workspaces.find((w) => w.id === user.workspace_id);

  if (workspaces.length === 1) {
    return (
      <div className="sb-workspace" title={current?.name ?? 'Workspace'}>
        {current?.name ?? 'Workspace'}
      </div>
    );
  }

  return (
    <select
      className="sb-workspace-select"
      value={user.workspace_id}
      disabled={busy}
      aria-label="Switch workspace"
      onChange={async (e) => {
        const nextId = e.target.value;
        if (nextId === user.workspace_id) return;
        setBusy(true);
        try {
          const res = await switchWorkspace(nextId);
          setStoredToken(res.access_token);
          await refreshUser();
          onSwitched?.();
        } catch {
          // revert selection on failure
          e.target.value = user.workspace_id;
        } finally {
          setBusy(false);
        }
      }}
    >
      {workspaces.map((w) => (
        <option key={w.id} value={w.id}>{w.name}</option>
      ))}
    </select>
  );
}
