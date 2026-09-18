import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '../api/client';
import type { UserProfile } from '../api/types';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (perm: string) => boolean;
  canAny: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) { setUser(null); setLoading(false); return; }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { user: u, accessToken, refreshToken } = res.data.data;
    tokenStore.set(accessToken, refreshToken);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', { refreshToken: tokenStore.refresh }); } catch { /* ignore */ }
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback((perm: string) => {
    if (!user) return false;
    if (user.isSuperAdmin || user.roles.some((role) => role.code === 'admin')) return true;
    return user.permissions.includes(perm);
  }, [user]);

  const canAny = useCallback((...perms: string[]) => {
    if (!user) return false;
    if (user.isSuperAdmin || user.roles.some((role) => role.code === 'admin')) return true;
    return perms.some((p) => user.permissions.includes(p));
  }, [user]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, can, canAny }),
    [user, loading, login, logout, refreshUser, can, canAny]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
