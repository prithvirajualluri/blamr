export type UserRole = 'admin' | 'member' | 'viewer';

export interface JwtPayload {
  sub: string;
  email: string;
  workspace_id: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  workspace_id: string;
  role: UserRole;
}

export interface RegisterTenantRequest {
  workspace_name: string;
  slug?: string;
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterUserRequest {
  invite_token: string;
  password: string;
  name: string;
}

export interface InviteUserRequest {
  email: string;
  role: UserRole;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export interface WorkspaceMemberView {
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  joined_at: string;
}

export interface WorkspaceInviteView {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expires_at: string;
  created_at: string;
}
