const STORAGE_PREFIX = 'blamr_onboarding_done_';

export function isOnboardingComplete(workspaceId: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingComplete(workspaceId: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, '1');
  } catch {
    /* ignore */
  }
}

export type OnboardingTrigger = 'workspace-created' | 'member-joined';
