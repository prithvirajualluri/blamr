import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterTenantRequest,
  RegisterUserRequest,
  InviteUserRequest,
  CreateUserRequest,
  WorkspaceMemberView,
  WorkspaceInviteView,
  UserRole,
} from '@blamr/types';
import { apiFetch } from '../api/client';

export function login(body: LoginRequest) {
  return apiFetch<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  });
}

export function registerTenant(body: RegisterTenantRequest) {
  return apiFetch<AuthResponse>('/v1/auth/register-tenant', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  });
}

export function registerUser(body: RegisterUserRequest) {
  return apiFetch<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    skipAuth: true,
  });
}

export function fetchMe() {
  return apiFetch<AuthUser>('/v1/auth/me');
}

export function fetchWorkspaces() {
  return apiFetch<Array<{ id: string; name: string; slug: string; role: UserRole; joined_at: string }>>(
    '/v1/auth/workspaces',
  );
}

export function switchWorkspace(workspaceId: string) {
  return apiFetch<AuthResponse>('/v1/auth/switch-workspace', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

export function fetchInvitePreview(token: string) {
  return apiFetch<{ email: string; role: UserRole; workspace_name: string; expires_at: string }>(
    `/v1/auth/invite/${token}`,
    { skipAuth: true },
  );
}

export function fetchMembers() {
  return apiFetch<WorkspaceMemberView[]>('/v1/users');
}

export function fetchInvites() {
  return apiFetch<WorkspaceInviteView[]>('/v1/users/invites');
}

export function inviteUser(body: InviteUserRequest) {
  return apiFetch<WorkspaceInviteView>('/v1/users/invite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createUser(body: CreateUserRequest) {
  return apiFetch<{ user_id: string; email: string; name: string; role: UserRole }>('/v1/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateMemberRole(userId: string, role: UserRole) {
  return apiFetch<{ user_id: string; role: UserRole }>(`/v1/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function removeMember(userId: string) {
  return apiFetch<{ removed: boolean }>(`/v1/users/${userId}`, { method: 'DELETE' });
}

export function revokeInvite(inviteId: string) {
  return apiFetch<{ revoked: boolean }>(`/v1/users/invites/${inviteId}`, { method: 'DELETE' });
}
