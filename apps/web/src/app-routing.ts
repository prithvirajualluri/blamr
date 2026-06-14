import type { View, RunFilter, DetailSource } from './types';

export interface AppRoute {
  view: View;
  runId?: string;
}

const VIEW_MAP: Record<string, View> = {
  overview: 'monitor',
  monitor: 'monitor',
  workflows: 'workflows',
  agents: 'agents',
  executions: 'list',
  runs: 'list',
  connect: 'connect',
  settings: 'settings',
  team: 'users',
};

export function parseAppRoute(): AppRoute {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const head = parts[0] ?? 'overview';
  const view = VIEW_MAP[head] ?? 'monitor';

  if ((head === 'executions' || head === 'runs') && parts[1]) {
    return { view: 'detail', runId: parts[1] };
  }

  return { view };
}

export function hashForRoute(route: AppRoute, runFilter?: RunFilter): string {
  if (route.view === 'detail' && route.runId) {
    return `#/executions/${encodeURIComponent(route.runId)}`;
  }
  switch (route.view) {
    case 'monitor': return '#/overview';
    case 'workflows': return '#/workflows';
    case 'agents': return '#/agents';
    case 'list': {
      if (runFilter === 'failed') return '#/executions/failed';
      if (runFilter === 'success') return '#/executions/success';
      return '#/executions';
    }
    case 'connect': return '#/connect';
    case 'settings': return '#/settings';
    case 'users': return '#/team';
    default: return '#/overview';
  }
}

export function navIdForView(view: View, runFilter: RunFilter = 'all'): string {
  if (view === 'list') {
    if (runFilter === 'failed') return 'na-fail';
    if (runFilter === 'success') return 'na-ok';
    return 'na-all';
  }
  if (view === 'detail') return 'na-all';
  return view;
}

export function runFilterFromHash(): RunFilter {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (parts[0] === 'executions' || parts[0] === 'runs') {
    if (parts[1] === 'failed') return 'failed';
    if (parts[1] === 'success') return 'success';
  }
  return 'all';
}

export type { DetailSource };
