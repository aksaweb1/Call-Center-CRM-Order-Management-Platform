'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

/** Small data-fetching hook for client components. */
export function useApi<T>(
  path: string | null,
  opts?: { auto?: boolean },
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(opts?.auto !== false);

  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    if (path) load();
  }, [path, load]);

  return { data, error, loading, reload: load, setData, setError };
}