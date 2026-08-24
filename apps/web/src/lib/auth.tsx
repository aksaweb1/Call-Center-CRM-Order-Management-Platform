'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AuthUser, LoginResponse } from './types';
import {
  setAuthCookie,
  clearCookies,
  getCookie,
  api,
  jwtMaxAgeSeconds,
  handleSessionExpired,
} from './client';
import { refreshSession } from './refresh';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Returns true only when the JWT is well-formed AND not expired. */
function decodeJwtUser(token: string): AuthUser | null {
  try {
    if (jwtMaxAgeSeconds(token) <= 0) return null; // expired
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(
      typeof atob === 'function' ? atob(payload.replace(/-/g, '+').replace(/_/g, '/')) : payload,
    );
    if (!json || typeof json !== 'object' || !json.sub) return null;
    return {
      id: json.sub,
      email: json.email ?? '',
      fullName: json.fullName ?? json.email ?? '',
      role: json.role ?? 'AGENT',
      teamId: null,
      permissions: json.permissions ?? [],
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getCookie('access_token');
    // Only trust a token that is still valid — an expired JWT must never
    // produce a "logged-in" UI.
    const decoded = token ? decodeJwtUser(token) : null;
    if (decoded) setUser(decoded);

    // Refresh the session so the token stays valid and full user info is synced.
    refreshSession()
      .then(async (d) => {
        if (cancelled) return;
        if (!d) {
          // Refresh failed: without a still-valid access token the session
          // is over — wipe cookies and go to login instead of showing a
          // broken shell.
          if (!decodeJwtUser(getCookie('access_token') ?? '')) {
            handleSessionExpired();
          }
          return;
        }
        const fresh = decodeJwtUser(d.accessToken);
        if (fresh) {
          try {
            const perms = await api<string[] | number[]>('/users/me/permissions');
            if (!cancelled) setUser({ ...fresh, permissions: (perms ?? []) as string[] });
          } catch {
            if (!cancelled) setUser(fresh);
          }
        }
      })
      .catch(() => {
        if (!cancelled && !decoded) handleSessionExpired();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const d = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthCookie('access_token', d.accessToken);
    setAuthCookie('refresh_token', d.refreshToken);
    const decoded = decodeJwtUser(d.accessToken);
    if (decoded) {
      // d.user.permissions come from the server and include per-user overrides.
      setUser({
        ...decoded,
        id: d.user.id ?? decoded.id,
        fullName: d.user.fullName ?? decoded.fullName,
        role: d.user.role ?? decoded.role,
        teamId: d.user.teamId ?? decoded.teamId,
        permissions: d.user.permissions ?? [],
      });
    } else {
      setUser(d.user);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearCookies();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (perm: string) => user?.permissions?.includes(perm) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, hasPermission }),
    [user, loading, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}