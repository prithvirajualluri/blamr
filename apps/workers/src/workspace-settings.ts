import type { WorkspaceSettings } from '@blamr/types';
import { DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';
import type { Pool } from 'pg';

/** Load workspace settings from Postgres for gate registry and workflow profiles. */
export async function loadWorkspaceSettings(
  pg: Pool,
  workspaceId: string,
): Promise<WorkspaceSettings> {
  const result = await pg.query<{ settings: WorkspaceSettings }>(
    `SELECT settings FROM workspaces WHERE id = $1`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row?.settings) return DEFAULT_WORKSPACE_SETTINGS;
  return { ...DEFAULT_WORKSPACE_SETTINGS, ...row.settings };
}
