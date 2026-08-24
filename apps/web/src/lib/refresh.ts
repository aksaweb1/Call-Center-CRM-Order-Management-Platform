'use client';

import { API_URL } from './api';
import { getCookie, setAuthCookie } from './client';
import type { RefreshResult } from './types';

/**
 * Single-flight refresh: the backend rotates refresh tokens one-time, so
 * concurrent callers (tabs, parallel 401 retries) must share ONE in-flight
 * rotation or they invalidate each other's tokens.
 */
let inflight: Promise<RefreshResult | null> | null = null;

export function refreshSession(): Promise<RefreshResult | null> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doRefresh(): Promise<RefreshResult | null> {
  const refreshToken = getCookie('refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.data) return null;
    const data = body.data as { accessToken: string; refreshToken: string };
    // Cookie lifetimes mirror the actual token TTLs.
    setAuthCookie('access_token', data.accessToken);
    setAuthCookie('refresh_token', data.refreshToken);
    return data;
  } catch {
    return null;
  }
}
