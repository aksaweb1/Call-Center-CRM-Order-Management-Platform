'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { useUrlParams } from '@/lib/use-url-params';
import { usePageTitle } from '@/lib/use-page-title';
import { Call, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, TableSkeleton, formatDate } from '@/components/ui';

const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'green',
  CONNECTED: 'green',
  RINGING: 'amber',
  INITIATED: 'blue',
  BUSY: 'amber',
  FAILED: 'red',
  MISSED: 'red',
};

const CALL_STATUSES = ['INITIATED', 'RINGING', 'CONNECTED', 'COMPLETED', 'BUSY', 'FAILED', 'MISSED'];

function CallsPageInner() {
  usePageTitle('Calls');
  const { get, set } = useUrlParams();
  const [page, setPage] = useState(() => Math.max(1, Number(get('page')) || 1));
  const [statusFilter, setStatusFilter] = useState(() => get('status') ?? '');
  const customerId = get('customerId');

  const qs = new URLSearchParams({ page: String(page), limit: '20' });
  if (statusFilter) qs.set('status', statusFilter);
  if (customerId) qs.set('customerId', customerId);
  const { data, loading, error } = useApi<PageResult<Call>>(`/calls?${qs.toString()}`);

  const calls = useMemo(() => data?.items ?? [], [data]);

  function goToPage(p: number) {
    setPage(p);
    set({ page: p === 1 ? undefined : p });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">
        Calls{customerId ? ' — customer' : ''}
      </h1>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); goToPage(1); set({ status: e.target.value || undefined }); }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {CALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(statusFilter || customerId) && (
          <button
            onClick={() => {
              window.history.replaceState(null, '', '/calls');
              setStatusFilter('');
              setPage(1);
            }}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <TableSkeleton rows={6} cols={6} />}
      {error && <EmptyState title="Could not load calls" description={error} />}

      {!loading && !error && (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
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
                        {c.customer?.id ? (
                          <Link href={`/customers/${c.customer.id}`} className="hover:text-blue-600 hover:underline">
                            {c.customer.name ?? '—'}
                          </Link>
                        ) : (c.customer?.name ?? '—')}
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
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Page {data.page} of {data.totalPages} · {data.total} calls</span>
              <div className="flex gap-2">
                <button
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => goToPage(Math.min(data.totalPages, page + 1))}
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

export default function CallsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading calls…" />}>
      <CallsPageInner />
    </Suspense>
  );
}
