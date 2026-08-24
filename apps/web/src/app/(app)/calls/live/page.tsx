'use client';
import { useState } from 'react';
import { useApi } from '@/lib/hook';
import { api } from '@/lib/client';
import { Spinner, EmptyState, Badge } from '@/components/ui';

export default function LiveCallsPage() {
  const { data, loading, error, setData } = useApi<unknown[]>('/calls/live/all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const live = (data as unknown as Array<Record<string, unknown>>) ?? [];

  async function hangup(refId: string) {
    setBusy(refId);
    setMsg(null);
    try {
      const callId = (live.find((c) => (c as Record<string,string>).call_id === refId || (c as Record<string,string>).ref_id === refId) as Record<string,string>)?.call_id ?? refId;
      // Find CRM call id that matches providerCallId
      await api(`/calls/${refId}/hangup`, { method: 'POST' });
      setMsg('Hangup sent');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Hangup failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Live Calls — Wallboard</h1>
      <p className="text-sm text-slate-500">Team live calls from Tata (auto-refresh every 5s). Monitor / Whisper / Barge / Transfer available for active calls.</p>
      {msg && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg}</div>}
      {loading && <Spinner />}
      {error && <EmptyState title="Could not load live calls" description={error} />}
      {!loading && !error && live.length === 0 && <EmptyState title="No live calls" description="All agents idle." />}
      {!loading && !error && live.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
              {live.map((c: Record<string, unknown>, i: number) => (
                <tr key={String(c.call_id ?? i)} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{String(c.agent_name ?? c.source ?? '—')}</td>
                  <td className="px-4 py-3 text-slate-600">{String(c.source ?? '—')}</td>
                  <td className="px-4 py-3 text-slate-600">{String(c.destination ?? c.customer_number ?? '—')}</td>
                  <td className="px-4 py-3"><Badge tone={String(c.state) === 'Answered' ? 'green' : 'amber'}>{String(c.state ?? '—')}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{String(c.call_time ?? c.duration ?? '—')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => hangup(String(c.ref_id ?? c.call_id))} disabled={busy === String(c.ref_id ?? c.call_id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">Hangup</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
