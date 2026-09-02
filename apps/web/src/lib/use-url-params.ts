'use client';

import { useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Read URL query params and merge updates into the URL silently
 * (history.replaceState). Makes list filters shareable/refresh-safe and
 * fixes cross-page deep links (?customerId=…) without navigation churn.
 * Pages keep their own React state as the source of truth and call set()
 * alongside their normal setState calls.
 */
export function useUrlParams() {
  const sp = useSearchParams();
  const pathname = usePathname();

  const get = useCallback((key: string) => sp.get(key) ?? undefined, [sp]);

  const set = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      if (typeof window === 'undefined') return;
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === '') next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );

  return { get, set };
}
