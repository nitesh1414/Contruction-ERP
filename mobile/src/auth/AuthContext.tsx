import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, loadTokens, saveTokens, setSessionExpiredHandler } from '../api/client';
import type { ApiOk, LoginResponse, UserProfile } from '../api/types';

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (module: string, action: string) => boolean;
  canAny: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    (async () => {
      const tokens = await loadTokens();
      if (tokens?.accessToken) {
        try {
          const res = await api.get<ApiOk<UserProfile>>('/auth/me');
          setUser(res.data);
        } catch {
          await saveTokens(null);
        }
      }
      setLoading(false);
    })();
    return () => setSessionExpiredHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<ApiOk<LoginResponse>>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
      deviceInfo: 'mobile-app',
    });
    await saveTokens({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken });
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      const tokens = await loadTokens();
      if (tokens?.refreshToken) await api.post('/auth/logout', { refreshToken: tokens.refreshToken });
    } catch {
      /* best effort */
    }
    await saveTokens(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (module: string, action: string) => {
      if (!user) return false;
      if (user.isSuperAdmin) return true;
      return user.permissions.includes(`${module}.${action}`);
    },
    [user]
  );

  const canAny = useCallback(
    (...perms: string[]) => {
      if (!user) return false;
      if (user.isSuperAdmin) return true;
      return perms.some((p) => user.permissions.includes(p));
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, can, canAny }),
    [user, loading, login, logout, can, canAny]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
