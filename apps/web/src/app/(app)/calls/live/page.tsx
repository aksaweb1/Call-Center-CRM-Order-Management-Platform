'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/lib/hook';
import { usePageTitle } from '@/lib/use-page-title';
import { api } from '@/lib/client';
import { Spinner, EmptyState, Badge } from '@/components/ui';

export default function LiveCallsPage() {
  usePageTitle('Live Calls');
  const { data, loading, error, setData } = useApi<unknown[]>('/calls/live/all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const live = (data as unknown as Array<Record<string, unknown>>) ?? [];

  const silentRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await api<unknown[]>('/calls/live/all');
      setData(fresh as never);
    } catch {
      // silent — keep showing stale data
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, setData]);

  // Silent auto-refresh every 5s while the tab is visible — never shows a spinner.
  useEffect(() => {
    if (!autoRefresh) return;
    function onVisibility() {
      if (!document.hidden) void silentRefresh();
    }
    document.addEventListener('visibilitychange', onVisibility);
    const iv = setInterval(() => {
      if (!document.hidden) void silentRefresh();
    }, 5000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(iv);
    };
  }, [autoRefresh, silentRefresh]);

  async function hangup(row: Record<string, unknown>) {
    const refId = String(row.ref_id ?? row.call_id ?? '');
    if (!refId) return;
    if (!window.confirm(`Hang up the call to ${String(row.destination ?? row.customer_number ?? 'customer')}?`)) {
      return;
    }
    setBusy(refId);
    setMsg(null);
    try {
      await api(`/calls/${refId}/hangup`, { method: 'POST' });
      setMsg('Hangup sent.');
      await silentRefresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Hangup failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            Live Calls — Wallboard
            {refreshing && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" title="Refreshing…" />}
          </h1>
          <p className="text-sm text-slate-500">
            Team live calls from the telephony provider{autoRefresh ? ' · auto-refreshes every 5s' : ''}
            {refreshing && <span className="ml-1 text-emerald-600">updating…</span>}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto-refresh
        </label>
        <button
          onClick={() => void silentRefresh()}
          disabled={refreshing}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {msg && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg}</div>}
      {loading && !data && <Spinner />}
      {error && !data && <EmptyState title="Could not load live calls" description={error} />}
      {error && data && <p className="text-xs text-amber-600">Could not refresh — showing last known data.</p>}
      {!loading && data && live.length === 0 && <EmptyState title="No live calls" description="All agents idle." />}
      {data && live.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {live.map((c, i) => (
                  <tr key={String(c.call_id ?? i)} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{String(c.agent_name ?? c.source ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-600">{String(c.source ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-600">{String(c.destination ?? c.customer_number ?? '—')}</td>
                    <td className="px-4 py-3"><Badge tone={String(c.state) === 'Answered' ? 'green' : 'amber'}>{String(c.state ?? '—')}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{String(c.call_time ?? c.duration ?? '—')}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void hangup(c)}
                        disabled={busy === String(c.ref_id ?? c.call_id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {busy === String(c.ref_id ?? c.call_id) ? 'Hanging up…' : 'Hang up'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
