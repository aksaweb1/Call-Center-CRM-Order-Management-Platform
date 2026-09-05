'use client';

import { API_URL, ApiEnvelope } from './api';
import { refreshSession } from './refresh';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Seconds left until a JWT expires (falls back to 15 min). */
export function jwtMaxAgeSeconds(token: string): number {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (typeof payload?.exp === 'number') {
      return Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // malformed token
  }
  return 15 * 60;
}

/**
 * Client-side HTTP wrapper. Attaches the bearer token from a cookie,
 * unwraps the standard envelope, refreshes the token once on 401, and
 * hard-logs-out if the session cannot be recovered.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
  const token = getCookie('access_token');
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // One retry with a refreshed token.
    if (res.status === 401 && !_retried) {
      const ok = await refreshSession();
      if (ok) return api<T>(path, init, true);
    }
    // Session is unrecoverable — clear it and send the user to login.
    if (res.status === 401) {
      handleSessionExpired();
    }
    const msg =
      body && typeof body === 'object' && (body as { message?: string }).message
        ? (body as { message: string }).message
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, body);
  }

  const env = body as ApiEnvelope<T>;
  return env?.data ?? (body as T);
}

let redirectingToLogin = false;

/** Terminal 401: wipe tokens and bounce to the login page once. */
export function handleSessionExpired(): void {
  if (typeof window === 'undefined') return;
  clearCookies();
  if (redirectingToLogin || window.location.pathname.startsWith('/login')) return;
  redirectingToLogin = true;
  window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
}

export function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie
    .split('; ')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : undefined;
}

// Secure cookies are silently dropped by browsers over plain HTTP (office
// WiFi), so only send `secure` when the page itself is served over HTTPS.
const baseCookieAttrs = () => {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  return secure ? 'path=/; samesite=lax; secure' : 'path=/; samesite=lax';
};

/** Stores a value with an explicit lifetime in seconds. */
export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; ${baseCookieAttrs()}; max-age=${Math.max(0, Math.floor(maxAgeSeconds))}`;
}

/** Stores a JWT cookie whose lifetime matches the token's own expiry. */
export function setAuthCookie(name: string, token: string): void {
  setCookie(name, token, jwtMaxAgeSeconds(token));
}

export function clearCookies(): void {
  document.cookie = `access_token=; ${baseCookieAttrs()}; max-age=0`;
  document.cookie = `refresh_token=; ${baseCookieAttrs()}; max-age=0`;
}
