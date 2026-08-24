'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApi } from '@/lib/hook';
import { FollowUp, PageResult } from '@/lib/types';
import { Spinner, EmptyState, Badge, formatDate } from '@/components/ui';

export default function FollowUpsPage() {
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page), limit: '50' });
  const { data, loading, error } = useApi<PageResult<FollowUp>>(`/followups?${qs.toString()}`);

  const pending = useMemo(
    () =>
      (data?.items ?? [])
        .filter((f) => !f.isDone)
        .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1)),
    [data],
  );
  const completed = useMemo(
    () =>
      (data?.items ?? [])
        .filter((f) => f.isDone)
        .sort((a, b) => (a.completedAt && b.completedAt ? (a.completedAt < b.completedAt ? 1 : -1) : 0)),
    [data],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Follow-ups</h1>

      {loading && <Spinner />}
      {error && <EmptyState title="Could not load follow-ups" description={error} />}

      {!loading && !error && (
        <>
          <FollowUpTable
            title={`Pending (${pending.length})`}
            tone="amber"
            items={pending}
            empty="No pending follow-ups. Great job!"
          />
          <FollowUpTable
            title={`Completed (${completed.length})`}
            tone="green"
            items={completed}
            empty="No completed follow-ups yet."
          />

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

function FollowUpTable({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: 'amber' | 'green';
  items: FollowUp[];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Scheduled</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{f.customer?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{f.title ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(f.scheduledFor)}
                  {f.isDone && f.completedAt && (
                    <span className="ml-1 text-xs text-slate-400">· done {formatDate(f.completedAt)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{f.agent?.fullName ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={tone}>{f.isDone ? 'Completed' : 'Pending'}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {f.lead?.id ? (
                    <Link
                      href={`/leads/${f.lead.id}`}
                      className="inline-flex rounded-lg border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      Handle
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}