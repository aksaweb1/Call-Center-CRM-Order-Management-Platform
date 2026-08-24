'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { Call, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, formatDate } from '@/components/ui';

const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'green',
  CONNECTED: 'green',
  RINGING: 'amber',
  INITIATED: 'blue',
  BUSY: 'amber',
  FAILED: 'red',
  MISSED: 'red',
};

export default function CallsPage() {
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  const { data, loading, error } = useApi<PageResult<Call>>(`/calls?${qs.toString()}`);

  const calls = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Calls</h1>

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load calls" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Recording</th>
                  <th className="px-4 py-3">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      No calls recorded yet.
                    </td>
                  </tr>
                )}
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.customer?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.direction}</td>
                    <td className="px-4 py-3 text-slate-600">{c.dialedNumber}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[c.status] ?? 'slate'}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.agent?.fullName ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.durationSecs != null ? `${Math.round(c.durationSecs / 60)}m ${c.durationSecs % 60}s` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {(c as unknown as { recordingUrl?: string; recording?: { recordingUrl?: string } }).recordingUrl || (c as unknown as { recording?: { recordingUrl?: string } }).recording?.recordingUrl ? (
                        <audio controls src={(c as unknown as { recordingUrl?: string }).recordingUrl ?? (c as unknown as { recording?: { recordingUrl?: string } }).recording?.recordingUrl} className="h-8 w-32" />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(c.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Page {data.page} of {data.totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}