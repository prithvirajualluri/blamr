import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthUser, LoginRequest, RegisterTenantRequest, RegisterUserRequest } from '@blamr/types';
import * as authApi from '../api/auth';
import { clearStoredToken, getStoredToken, hydrateTokenFromStorage, setStoredToken } from './storage';

type AuthScreen = 'login' | 'register-tenant' | 'accept-invite';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authScreen: AuthScreen;
  inviteToken: string | null;
  setAuthScreen: (screen: AuthScreen) => void;
  setInviteToken: (token: string | null) => void;
  login: (body: LoginRequest) => Promise<void>;
  registerTenant: (body: RegisterTenantRequest) => Promise<void>;
  registerUser: (body: RegisterUserRequest) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseInviteFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('invite');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [inviteToken, setInviteToken] = useState<string | null>(parseInviteFromUrl);

  const applyAuth = useCallback((token: string, authUser: AuthUser) => {
    setStoredToken(token);
    setUser(authUser);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    hydrateTokenFromStorage();
    const token = getStoredToken();
    const urlInvite = parseInviteFromUrl();
    if (urlInvite) {
      setInviteToken(urlInvite);
      setAuthScreen('accept-invite');
      setLoading(false);
      return;
    }
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser()
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (body: LoginRequest) => {
    const res = await authApi.login(body);
    applyAuth(res.access_token, res.user);
  }, [applyAuth]);

  const registerTenant = useCallback(async (body: RegisterTenantRequest) => {
    const res = await authApi.registerTenant(body);
    applyAuth(res.access_token, res.user);
  }, [applyAuth]);

  const registerUser = useCallback(async (body: RegisterUserRequest) => {
    const res = await authApi.registerUser(body);
    applyAuth(res.access_token, res.user);
    setInviteToken(null);
    window.history.replaceState({}, '', window.location.pathname);
  }, [applyAuth]);

  const logout = useCallback(() => {
    clearStoredToken();
    setUser(null);
    setAuthScreen('login');
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authScreen,
      inviteToken,
      setAuthScreen,
      setInviteToken,
      login,
      registerTenant,
      registerUser,
      logout,
      refreshUser,
    }),
    [user, loading, authScreen, inviteToken, login, registerTenant, registerUser, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useIsAdmin() {
  const { user } = useAuth();
  return user?.role === 'admin';
}
